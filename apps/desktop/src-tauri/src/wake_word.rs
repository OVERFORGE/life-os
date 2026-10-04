use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const SAMPLE_RATE: u32 = 16000;
const BUFFER_CAP: usize = 24000; // 1.5s @ 16kHz
const RMS_THRESHOLD: f32 = 0.012;
const COOLDOWN_DURATION: Duration = Duration::from_millis(2000);

pub struct WakeWordDetector {
    is_running: Arc<AtomicBool>,
}

impl WakeWordDetector {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(&self, app: AppHandle) -> Result<(), String> {
        if self.is_running.load(Ordering::SeqCst) {
            return Ok(());
        }

        self.is_running.store(true, Ordering::SeqCst);
        let running_flag = self.is_running.clone();

        std::thread::Builder::new()
            .name("aven-wake-word-thread".into())
            .spawn(move || {
                log::info!("[WakeWord] Starting desktop acoustic detection thread");

                let host = cpal::default_host();
                let device = match host.default_input_device() {
                    Some(d) => d,
                    None => {
                        log::warn!("[WakeWord] No default audio input device found");
                        running_flag.store(false, Ordering::SeqCst);
                        return;
                    }
                };

                let config = match device.default_input_config() {
                    Ok(c) => c,
                    Err(e) => {
                        log::warn!("[WakeWord] Failed to get default input config: {:?}", e);
                        running_flag.store(false, Ordering::SeqCst);
                        return;
                    }
                };

                let channels = config.channels() as usize;
                let sample_rate = config.sample_rate().0;

                // Circular audio buffer
                let mut audio_buffer = vec![0.0f32; BUFFER_CAP];
                let mut write_ptr = 0usize;
                let mut total_samples = 0usize;
                let mut last_trigger = Instant::now() - COOLDOWN_DURATION;

                // Phonetic profile for "Hey Aven": [low, mid, high]
                let profile: [(f32, f32, f32); 6] = [
                    (0.10, 0.40, 0.50), // H
                    (0.60, 0.35, 0.05), // EY
                    (0.60, 0.35, 0.05), // AH
                    (0.30, 0.45, 0.25), // V
                    (0.50, 0.40, 0.10), // EH
                    (0.70, 0.25, 0.05), // N
                ];

                let (tx, rx) = std::sync::mpsc::channel::<Vec<f32>>();

                let err_fn = |err| {
                    log::warn!("[WakeWord] Audio stream error: {:?}", err);
                };

                let stream = match config.sample_format() {
                    cpal::SampleFormat::F32 => device.build_input_stream(
                        &config.into(),
                        move |data: &[f32], _: &cpal::InputCallbackInfo| {
                            let mut mono = Vec::with_capacity(data.len() / channels);
                            for chunk in data.chunks(channels) {
                                let avg: f32 = chunk.iter().sum::<f32>() / channels as f32;
                                mono.push(avg);
                            }
                            let _ = tx.send(mono);
                        },
                        err_fn,
                        None,
                    ),
                    cpal::SampleFormat::I16 => device.build_input_stream(
                        &config.into(),
                        move |data: &[i16], _: &cpal::InputCallbackInfo| {
                            let mut mono = Vec::with_capacity(data.len() / channels);
                            for chunk in data.chunks(channels) {
                                let avg: f32 = chunk.iter().map(|&s| s as f32 / 32768.0).sum::<f32>() / channels as f32;
                                mono.push(avg);
                            }
                            let _ = tx.send(mono);
                        },
                        err_fn,
                        None,
                    ),
                    _ => {
                        log::warn!("[WakeWord] Unsupported audio sample format");
                        running_flag.store(false, Ordering::SeqCst);
                        return;
                    }
                };

                let stream = match stream {
                    Ok(s) => s,
                    Err(e) => {
                        log::warn!("[WakeWord] Failed to build input stream: {:?}", e);
                        running_flag.store(false, Ordering::SeqCst);
                        return;
                    }
                };

                if let Err(e) = stream.play() {
                    log::warn!("[WakeWord] Failed to play audio stream: {:?}", e);
                    running_flag.store(false, Ordering::SeqCst);
                    return;
                }

                // Process incoming audio frames
                while running_flag.load(Ordering::SeqCst) {
                    if let Ok(samples) = rx.recv_timeout(Duration::from_millis(100)) {
                        // Resample / downsample if needed, or ingest directly
                        let step = if sample_rate > 0 { (sample_rate / SAMPLE_RATE).max(1) as usize } else { 1 };
                        for (i, &sample) in samples.iter().enumerate() {
                            if i % step == 0 {
                                audio_buffer[write_ptr] = sample;
                                write_ptr = (write_ptr + 1) % BUFFER_CAP;
                                total_samples += 1;
                            }
                        }

                        if total_samples < 9600 {
                            continue;
                        }

                        if last_trigger.elapsed() < COOLDOWN_DURATION {
                            continue;
                        }

                        // Extract 1.0s window
                        let win_len = 16000usize;
                        let mut buf = vec![0.0f32; win_len];
                        let mut rp = (write_ptr + BUFFER_CAP - win_len) % BUFFER_CAP;
                        for i in 0..win_len {
                            buf[i] = audio_buffer[rp];
                            rp = (rp + 1) % BUFFER_CAP;
                        }

                        // RMS gate
                        let e_sum: f32 = buf.iter().map(|&x| x * x).sum();
                        let rms = (e_sum / win_len as f32).sqrt();
                        if rms < RMS_THRESHOLD {
                            continue;
                        }

                        // Multi-slice spectral matching
                        let num_slices = profile.len();
                        let slice_len = win_len / (num_slices + 1);
                        let step_len = (win_len - slice_len) / (num_slices - 1);

                        let mut score = 0.0f32;
                        for (s, &(t_lo, t_mi, t_hi)) in profile.iter().enumerate() {
                            let start = s * step_len;
                            let sub = &buf[start..start + slice_len];

                            let mut lo = 0.0f32;
                            let mut mi = 0.0f32;
                            let mut hi = 0.0f32;

                            for j in 1..sub.len() {
                                let v = sub[j].abs();
                                let d = (sub[j] - sub[j - 1]).abs();
                                if d > 0.08 {
                                    hi += d;
                                } else if v > 0.02 {
                                    mi += v;
                                } else {
                                    lo += v;
                                }
                            }

                            let total = lo + mi + hi + 1e-6;
                            let n_lo = lo / total;
                            let n_mi = mi / total;
                            let n_hi = hi / total;

                            let dist = (n_lo - t_lo).abs() * 0.5 + (n_mi - t_mi).abs() * 0.35 + (n_hi - t_hi).abs() * 0.35;
                            score += (1.0 - dist).max(0.0);
                        }

                        let confidence = score / num_slices as f32;
                        let threshold = 1.0 - 0.65 * 0.55; // sensitivity = 0.65

                        if confidence >= threshold {
                            last_trigger = Instant::now();
                            log::info!("[WakeWord] Desktop detected wake word! Confidence: {:.2}", confidence);

                            // Trigger action: Emit event to frontend and show Spotlight HUD
                            let _ = app.emit("aven-wake-detected", serde_json::json!({
                                "keyword": "Hey Aven",
                                "confidence": confidence
                            }));

                            if let Some(hud) = app.get_webview_window("hud") {
                                let _ = hud.show();
                                let _ = hud.set_focus();
                            } else if let Some(main) = app.get_webview_window("main") {
                                let _ = main.show();
                                let _ = main.set_focus();
                            }
                        }
                    }
                }

                log::info!("[WakeWord] Audio detection thread exiting cleanly");
            })
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
    }

    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }
}
