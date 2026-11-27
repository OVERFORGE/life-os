#!/usr/bin/env python3
"""
Phase 2 End-to-End Training & Blind Evaluation Orchestrator for 'Hey Aven'
Runs openWakeWord synthetic multi-speaker generation, injects real user recordings
from dataset_real/, mines hard negatives, trains custom hey_aven.onnx, and
validates against blind unseen speakers + hard negative traps.
"""

import glob
import os
import shutil
import subprocess
import sys
import wave
import numpy as np
import onnxruntime as ort
import yaml

ROOT = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(ROOT, "config_hey_aven.yaml")
DATASET_DIR = os.path.join(ROOT, "dataset_real")
WORK_DIR = os.path.join(ROOT, "work", "hey_aven_model")
MODELS_DIR = os.path.join(ROOT, "..", "models")


def ensure_background_audio_dirs():
    """Ensure fallback ambient audio exists if user has not downloaded AudioSet/FMA."""
    os.makedirs(os.path.join(ROOT, "work", "audioset_16k"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "work", "fma"), exist_ok=True)
    ambient_files = glob.glob(os.path.join(DATASET_DIR, "**", "neg_ambient", "*.wav"), recursive=True)
    for i, src in enumerate(ambient_files):
        dst = os.path.join(ROOT, "work", "audioset_16k", f"real_ambient_{i}.wav")
        if not os.path.exists(dst):
            shutil.copy2(src, dst)


def inject_real_recordings():
    """
    Blend real recorded clips from dataset_real/train_real/ into openWakeWord's
    generated positive_train and negative_train directories (oversampled 20x for
    diverse downstream RIR/SNR augmentation without touching val_blind speakers).
    """
    pos_train_dir = os.path.join(WORK_DIR, "hey_aven", "positive_train")
    neg_train_dir = os.path.join(WORK_DIR, "hey_aven", "negative_train")
    os.makedirs(pos_train_dir, exist_ok=True)
    os.makedirs(neg_train_dir, exist_ok=True)

    train_pos = glob.glob(os.path.join(DATASET_DIR, "train_real", "*", "pos_*", "*.wav"))
    train_neg_hard = (
        glob.glob(os.path.join(DATASET_DIR, "train_real", "*", "neg_hard", "*.wav"))
        + glob.glob(os.path.join(DATASET_DIR, "train_real", "*", "neg_hey_names", "*.wav"))
        + glob.glob(os.path.join(DATASET_DIR, "train_real", "*", "neg_free_speech", "*.wav"))
    )

    print(f"[Inject] Found {len(train_pos)} real train positives and {len(train_neg_hard)} real hard negatives.")

    # Oversample real positives so each copy receives independent RIR + noise augmentation
    oversample_pos = 20 if len(train_pos) > 0 else 0
    for r in range(oversample_pos):
        for idx, src in enumerate(train_pos):
            dst = os.path.join(pos_train_dir, f"real_pos_r{r}_{idx}.wav")
            shutil.copy2(src, dst)

    oversample_neg = 25 if len(train_neg_hard) > 0 else 0
    for r in range(oversample_neg):
        for idx, src in enumerate(train_neg_hard):
            dst = os.path.join(neg_train_dir, f"real_neg_hard_r{r}_{idx}.wav")
            shutil.copy2(src, dst)


def load_wav_16k(path: str) -> np.ndarray:
    with wave.open(path, "rb") as wf:
        assert wf.getnchannels() == 1 and wf.getframerate() == 16000 and wf.getsampwidth() == 2, f"Invalid WAV: {path}"
        pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32)
    return pcm


def score_wav_file(mel_sess, emb_sess, cls_sess, wav_path: str) -> float:
    """Run exact openWakeWord 3-stage ONNX streaming inference on a 16kHz WAV file."""
    pcm = load_wav_16k(wav_path)
    # Zero-pad 800ms tail so phrase right before clip end flushes through 76-frame window
    pcm = np.concatenate([pcm, np.zeros(12800, dtype=np.float32)])

    chunk_size = 1280
    mel_buf = []
    emb_buf = []
    max_score = 0.0

    for start in range(0, len(pcm) - chunk_size + 1, chunk_size):
        chunk = pcm[start : start + chunk_size][None, :]
        mel_out = mel_sess.run(None, {mel_sess.get_inputs()[0].name: chunk})[0]
        mel_scaled = (mel_out.squeeze() / 10.0) + 2.0
        for row in mel_scaled:
            mel_buf.append(row)

        while len(mel_buf) >= 76:
            win = np.array(mel_buf[:76], dtype=np.float32)[None, :, :, None]
            mel_buf = mel_buf[8:]
            emb_out = emb_sess.run(None, {emb_sess.get_inputs()[0].name: win})[0].squeeze()
            emb_buf.append(emb_out)
            if len(emb_buf) > 16:
                emb_buf = emb_buf[-16:]
            if len(emb_buf) == 16:
                seq = np.array(emb_buf, dtype=np.float32)[None, :, :]
                prob = float(cls_sess.run(None, {cls_sess.get_inputs()[0].name: seq})[0].squeeze())
                if prob > max_score:
                    max_score = prob
    return max_score


def evaluate_onnx(onnx_path: str):
    """Benchmark exported ONNX against blind speakers + hard negative traps."""
    mel_sess = ort.InferenceSession(os.path.join(ROOT, "models", "melspectrogram.onnx"))
    emb_sess = ort.InferenceSession(os.path.join(ROOT, "models", "embedding_model.onnx"))
    cls_sess = ort.InferenceSession(onnx_path)

    blind_pos = glob.glob(os.path.join(DATASET_DIR, "val_blind", "*", "pos_*", "*.wav"))
    all_neg_hard = (
        glob.glob(os.path.join(DATASET_DIR, "**", "neg_hard", "*.wav"), recursive=True)
        + glob.glob(os.path.join(DATASET_DIR, "**", "neg_hey_names", "*.wav"), recursive=True)
        + glob.glob(os.path.join(DATASET_DIR, "**", "neg_free_speech", "*.wav"), recursive=True)
    )

    print("\n================ OFFLINE ORACLE EVALUATION ================")
    for threshold in [0.40, 0.50, 0.60, 0.70]:
        tp = sum(1 for p in blind_pos if score_wav_file(mel_sess, emb_sess, cls_sess, p) >= threshold)
        fp = sum(1 for n in all_neg_hard if score_wav_file(mel_sess, emb_sess, cls_sess, n) >= threshold)
        pos_recall = (tp / len(blind_pos) * 100.0) if blind_pos else 0.0
        print(
            f"  Threshold {threshold:.2f} | Blind Positive Recall: {tp}/{len(blind_pos)} ({pos_recall:.1f}%) "
            f"| Hard-Negative False Triggers: {fp}/{len(all_neg_hard)}"
        )
    print("===========================================================\n")


def run_step(args):
    cmd = [sys.executable, "-m", "openwakeword.train", "--training_config", CONFIG_PATH] + args
    print(f"\n[Exec] {' '.join(cmd)}")
    subprocess.run(cmd, check=True, cwd=ROOT)


def main():
    ensure_background_audio_dirs()
    run_step(["--generate_clips"])
    inject_real_recordings()
    run_step(["--augment_clips"])
    run_step(["--train_model"])

    exported_onnx = os.path.join(WORK_DIR, "hey_aven.onnx")
    if os.path.exists(exported_onnx):
        evaluate_onnx(exported_onnx)
        os.makedirs(MODELS_DIR, exist_ok=True)
        for fname in ["melspectrogram.onnx", "embedding_model.onnx", "silero_vad.onnx", "wespeaker_en_voxceleb_resnet34.onnx"]:
            src_m = os.path.join(ROOT, "models", fname)
            if os.path.exists(src_m):
                shutil.copy2(src_m, os.path.join(MODELS_DIR, fname))
        shutil.copy2(exported_onnx, os.path.join(MODELS_DIR, "hey_aven.onnx"))
        print(f"Copied final trained model & ONNX assets into: {os.path.abspath(MODELS_DIR)}")
    else:
        print(f"WARNING: Expected exported ONNX not found at {exported_onnx}")


if __name__ == "__main__":
    main()

