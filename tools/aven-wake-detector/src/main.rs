use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::io::{self, BufRead, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

const TARGET_SAMPLE_RATE: u32 = 16000;
const RING_BUFFER_CAP: usize = 64000; // 4.0 seconds @ 16kHz
const CHUNK_SIZE_16K: usize = 320;     // 20ms frame @ 16kHz

// Voice Activity Detection Thresholds
const RMS_SPEECH_ONSET: f32 = 0.024;      // Loudness to start an utterance
const RMS_SPEECH_CONTINUE: f32 = 0.015;   // Loudness to sustain an utterance
const MIN_UTTERANCE_MS: usize = 320;      // Minimum phrase duration
const MAX_UTTERANCE_MS: usize = 2500;     // Maximum phrase duration
const PAUSE_FRAMES_REQUIRED: usize = 12;  // 12 * 20ms = 240ms pause to seal utterance
const COOLDOWN_DURATION: Duration = Duration::from_millis(1500);

fn emit_json_event(event_name: &str, data: serde_json::Value) {
    let mut msg = serde_json::Map::new();
    msg.insert("event".to_string(), serde_json::Value::String(event_name.to_string()));
    if let serde_json::Value::Object(map) = data {
        for (k, v) in map {
            msg.insert(k, v);
        }
    }
    let payload = serde_json::Value::Object(msg);
    if let Ok(line) = serde_json::to_string(&payload) {
        println!("{}", line);
        let _ = io::stdout().flush();
    }
}

// Resampler using linear interpolation to convert arbitrary input rate to 16,000 Hz
struct AudioResampler {
    in_rate: f64,
    out_rate: f64,
    phase: f64,
    prev_sample: f32,
}

impl AudioResampler {
    fn new(in_rate: u32, out_rate: u32) -> Self {
        Self {
            in_rate: in_rate as f64,
            out_rate: out_rate as f64,
            phase: 0.0,
            prev_sample: 0.0,
        }
    }

    fn process(&mut self, input: &[f32], output: &mut Vec<f32>) {
        if (self.in_rate - self.out_rate).abs() < 1.0 {
            output.extend_from_slice(input);
            return;
        }

        let ratio = self.in_rate / self.out_rate;
        for &sample in input {
            while self.phase < 1.0 {
                let interpolated = self.prev_sample + (sample - self.prev_sample) * (self.phase as f32);
                output.push(interpolated);
                self.phase += ratio;
            }
            self.phase -= 1.0;
            self.prev_sample = sample;
        }
    }
}

fn base64_encode(input: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    let mut i = 0;
    while i < input.len() {
        let b0 = input[i];
        let b1 = if i + 1 < input.len() { input[i + 1] } else { 0 };
        let b2 = if i + 2 < input.len() { input[i + 2] } else { 0 };

        let idx0 = (b0 >> 2) & 0x3F;
        let idx1 = ((b0 & 0x03) << 4) | ((b1 >> 4) & 0x0F);
        let idx2 = ((b1 & 0x0F) << 2) | ((b2 >> 6) & 0x03);
        let idx3 = b2 & 0x3F;

        out.push(CHARSET[idx0 as usize] as char);
        out.push(CHARSET[idx1 as usize] as char);
        if i + 1 < input.len() {
            out.push(CHARSET[idx2 as usize] as char);
        } else {
            out.push('=');
        }
        if i + 2 < input.len() {
            out.push(CHARSET[idx3 as usize] as char);
        } else {
            out.push('=');
        }
        i += 3;
    }
    out
}

fn samples_to_wav_base64(samples: &[f32], sample_rate: u32) -> String {
    let num_samples = samples.len() as u32;
    let byte_rate = sample_rate * 2;
    let block_align = 2u16;
    let bits_per_sample = 16u16;
    let data_len = num_samples * 2;
    let file_len = 36 + data_len;

    let mut wav_bytes = Vec::with_capacity(44 + data_len as usize);
    wav_bytes.extend_from_slice(b"RIFF");
    wav_bytes.extend_from_slice(&file_len.to_le_bytes());
    wav_bytes.extend_from_slice(b"WAVE");
    wav_bytes.extend_from_slice(b"fmt ");
    wav_bytes.extend_from_slice(&16u32.to_le_bytes()); // subchunk1 size (16 for PCM)
    wav_bytes.extend_from_slice(&1u16.to_le_bytes());  // AudioFormat (1 = PCM)
    wav_bytes.extend_from_slice(&1u16.to_le_bytes());  // NumChannels (1 = Mono)
    wav_bytes.extend_from_slice(&sample_rate.to_le_bytes());
    wav_bytes.extend_from_slice(&byte_rate.to_le_bytes());
    wav_bytes.extend_from_slice(&block_align.to_le_bytes());
    wav_bytes.extend_from_slice(&bits_per_sample.to_le_bytes());
    wav_bytes.extend_from_slice(b"data");
    wav_bytes.extend_from_slice(&data_len.to_le_bytes());

    for &s in samples {
        let clamped = s.clamp(-1.0, 1.0);
        let val_i16 = (clamped * 32767.0) as i16;
        wav_bytes.extend_from_slice(&val_i16.to_le_bytes());
    }

    base64_encode(&wav_bytes)
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
    let input_sample_rate = config.sample_rate().0;

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
        "sample_rate": input_sample_rate,
        "target_rate": TARGET_SAMPLE_RATE,
        "keyword": "Hey Aven",
        "engine": "vad_acoustic_stream"
    }));

    let mut resampler = AudioResampler::new(input_sample_rate, TARGET_SAMPLE_RATE);
    let mut ring_buffer = vec![0.0f32; RING_BUFFER_CAP];
    let mut write_pos = 0usize;
    let mut total_16k_samples = 0usize;

    let mut is_speaking = false;
    let mut speech_frames_count = 0usize;
    let mut pause_frames_count = 0usize;
    let mut sum_rms = 0.0f32;
    let mut last_candidate_time = Instant::now() - COOLDOWN_DURATION;

    let mut pending_16k_samples = Vec::with_capacity(2048);

    while running.load(Ordering::SeqCst) {
        if let Ok(raw_chunk) = rx.recv_timeout(Duration::from_millis(50)) {
            // Resample input chunk to exact 16,000 Hz
            pending_16k_samples.clear();
            resampler.process(&raw_chunk, &mut pending_16k_samples);

            for &sample in &pending_16k_samples {
                ring_buffer[write_pos] = sample;
                write_pos = (write_pos + 1) % RING_BUFFER_CAP;
                total_16k_samples += 1;

                // Process every 20ms frame (320 samples)
                if total_16k_samples % CHUNK_SIZE_16K == 0 {
                    // Compute RMS for the recent 320 samples
                    let mut e_sum = 0.0f32;
                    let mut read_idx = (write_pos + RING_BUFFER_CAP - CHUNK_SIZE_16K) % RING_BUFFER_CAP;
                    for _ in 0..CHUNK_SIZE_16K {
                        let s = ring_buffer[read_idx];
                        e_sum += s * s;
                        read_idx = (read_idx + 1) % RING_BUFFER_CAP;
                    }
                    let frame_rms = (e_sum / CHUNK_SIZE_16K as f32).sqrt();

                    if !is_speaking {
                        // Check for speech onset
                        if frame_rms >= RMS_SPEECH_ONSET && last_candidate_time.elapsed() >= COOLDOWN_DURATION {
                            is_speaking = true;
                            // Speech onset detected
                            speech_frames_count = 1;
                            pause_frames_count = 0;
                            sum_rms = frame_rms;
                        }
                    } else {
                        speech_frames_count += 1;
                        sum_rms += frame_rms;

                        if frame_rms < RMS_SPEECH_CONTINUE {
                            pause_frames_count += 1;
                        } else {
                            pause_frames_count = 0;
                        }

                        let utterance_duration_ms = speech_frames_count * 20;

                        // Sealing condition: user finished phrase (pause detected)
                        if pause_frames_count >= PAUSE_FRAMES_REQUIRED {
                            let active_duration_ms = utterance_duration_ms.saturating_sub(pause_frames_count * 20);

                            if active_duration_ms >= MIN_UTTERANCE_MS && active_duration_ms <= MAX_UTTERANCE_MS {
                                // Extract the audio slice from the ring buffer
                                let total_extract_samples = (speech_frames_count * CHUNK_SIZE_16K + 3200).min(RING_BUFFER_CAP);
                                let mut extracted_samples = vec![0.0f32; total_extract_samples];
                                let mut extract_pos = (write_pos + RING_BUFFER_CAP - total_extract_samples) % RING_BUFFER_CAP;
                                for i in 0..total_extract_samples {
                                    extracted_samples[i] = ring_buffer[extract_pos];
                                    extract_pos = (extract_pos + 1) % RING_BUFFER_CAP;
                                }

                                let avg_rms = sum_rms / speech_frames_count as f32;
                                let wav_b64 = samples_to_wav_base64(&extracted_samples, TARGET_SAMPLE_RATE);

                                emit_json_event("candidate_wake", serde_json::json!({
                                    "keyword": "Hey Aven",
                                    "audio_wav_base64": wav_b64,
                                    "duration_ms": active_duration_ms,
                                    "rms": avg_rms
                                }));

                                last_candidate_time = Instant::now();
                            }

                            // Reset VAD state
                            is_speaking = false;
                            speech_frames_count = 0;
                            pause_frames_count = 0;
                        } else if utterance_duration_ms > 3500 {
                            // Utterance too long (e.g. continuous talk/monologue) - reset
                            is_speaking = false;
                            speech_frames_count = 0;
                            pause_frames_count = 0;
                        }
                    }
                }
            }
        }
    }

    emit_json_event("stopped", serde_json::json!({ "reason": "clean_shutdown" }));
}
