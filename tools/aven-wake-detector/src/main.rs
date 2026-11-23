use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::io::{self, BufRead, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

const SAMPLE_RATE: u32 = 16000;
const BUFFER_CAP: usize = 24000; // 1.5s @ 16kHz

// =========================================================================
// CALIBRATION PARAMETERS FOR "HEY AVEN" WAKE DETECTION
// You can adjust these values manually to tune sensitivity:
// =========================================================================

// 1. RMS_THRESHOLD: Minimum volume/loudness required before analyzing sound.
//    - Decrease (e.g. 0.012 - 0.015): Hears softer speech or from further away.
//    - Increase (e.g. 0.025 - 0.035): Requires speaking louder / closer to microphone.
//    Default: 0.018
pub const RMS_THRESHOLD: f32 = 0.018;

// 2. CONFIDENCE_THRESHOLD: Match score required to trigger "Hey Aven" (0.00 to 1.00).
//    - Decrease (e.g. 0.62 - 0.65): Triggers much more easily, even with relaxed pronunciation.
//    - Increase (e.g. 0.72 - 0.80): Strict, only triggers on very crisp pronunciation.
//    Default: 0.68
pub const CONFIDENCE_THRESHOLD: f32 = 0.68;

// 3. COOLDOWN_DURATION: Delay before another wake trigger can occur.
//    Default: 2000ms
pub const COOLDOWN_DURATION: Duration = Duration::from_millis(2000);

fn emit_json_event(event_name: &str, data: serde_json::Value) {
    let mut msg = serde_json::Map::new();
    msg.insert("event".to_string(), serde_json::Value::String(event_name.to_string()));
    if let serde_json::Value::Object(map) = data {
        for (k, v) in map {
            msg.insert(k, v);
        }
    }
    let payload = serde_json::Value::Object(msg);
    let line = serde_json::to_string(&payload).unwrap_or_default();
    println!("{}", line);
    let _ = io::stdout().flush();
}

fn main() {
    let running = Arc::new(AtomicBool::new(true));
    let r_clone = running.clone();

    // Listen on stdin in background for EOF / termination signal
    std::thread::spawn(move || {
        let stdin = io::stdin();
        let mut lines = stdin.lock().lines();
        while let Some(line_res) = lines.next() {
            match line_res {
                Ok(line) => {
                    let trimmed = line.trim();
                    if trimmed == "STOP" || trimmed == "QUIT" || trimmed == "EXIT" {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        r_clone.store(false, Ordering::SeqCst);
    });

    let host = cpal::default_host();
    let device = match host.default_input_device() {
        Some(d) => d,
        None => {
            emit_json_event("error", serde_json::json!({ "message": "No default audio input device found" }));
            return;
        }
    };

    let config = match device.default_input_config() {
        Ok(c) => c,
        Err(e) => {
            emit_json_event("error", serde_json::json!({ "message": format!("Failed to get default input config: {:?}", e) }));
            return;
        }
    };

    let channels = config.channels() as usize;
    let sample_rate = config.sample_rate().0;

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

    let err_fn = move |err| {
        emit_json_event("error", serde_json::json!({ "message": format!("Audio stream error: {:?}", err) }));
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
            emit_json_event("error", serde_json::json!({ "message": "Unsupported audio sample format" }));
            return;
        }
    };

    let stream = match stream {
        Ok(s) => s,
        Err(e) => {
            emit_json_event("error", serde_json::json!({ "message": format!("Failed to build input stream: {:?}", e) }));
            return;
        }
    };

    if let Err(e) = stream.play() {
        emit_json_event("error", serde_json::json!({ "message": format!("Failed to play audio stream: {:?}", e) }));
        return;
    }

    emit_json_event("ready", serde_json::json!({
        "sample_rate": sample_rate,
        "target_rate": SAMPLE_RATE,
        "keyword": "Hey Aven"
    }));

    while running.load(Ordering::SeqCst) {
        if let Ok(samples) = rx.recv_timeout(Duration::from_millis(100)) {
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

            let win_len = 16000usize;
            let mut buf = vec![0.0f32; win_len];
            let mut rp = (write_ptr + BUFFER_CAP - win_len) % BUFFER_CAP;
            for i in 0..win_len {
                buf[i] = audio_buffer[rp];
                rp = (rp + 1) % BUFFER_CAP;
            }

            let e_sum: f32 = buf.iter().map(|&x| x * x).sum();
            let rms = (e_sum / win_len as f32).sqrt();
            if rms < RMS_THRESHOLD {
                continue;
            }

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

            if confidence >= CONFIDENCE_THRESHOLD {
                last_trigger = Instant::now();
                emit_json_event("wake_detected", serde_json::json!({
                    "keyword": "Hey Aven",
                    "confidence": confidence,
                    "rms": rms
                }));
            } else if confidence >= 0.55 {
                emit_json_event("debug_score", serde_json::json!({
                    "rms": rms,
                    "confidence": confidence,
                    "threshold": CONFIDENCE_THRESHOLD
                }));
            }
        }
    }

    emit_json_event("stopped", serde_json::json!({ "reason": "clean_shutdown" }));
}

