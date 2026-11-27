#!/usr/bin/env bash
set -euo pipefail

# Phase 2 Setup Script for Ubuntu / WSL2 (NVIDIA RTX 3050 CUDA or Linux GPU)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[1/6] Checking NVIDIA GPU & Python toolchain..."
nvidia-smi || echo "WARN: nvidia-smi not exposed in WSL; falling back to CPU or use Hey_Aven_Colab.ipynb."
python3 --version

python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip wheel setuptools

echo "[2/6] Installing PyTorch, openWakeWord & audio dependencies..."
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install audiomentations torch-audiomentations pronouncing datasets scipy tqdm pyyaml soundfile librosa onnx onnxruntime huggingface_hub piper-tts webrtcvad

if [ ! -d "openwakeword" ]; then
  git clone https://github.com/dscripka/openwakeword
fi
pip install -e ./openwakeword

echo "[3/6] Installing rhasspy/piper-sample-generator & LibriTTS-R multi-speaker TTS..."
mkdir -p work models
if [ ! -d "piper-sample-generator" ]; then
  git clone https://github.com/rhasspy/piper-sample-generator
fi
mkdir -p piper-sample-generator/models
if [ ! -f "piper-sample-generator/models/en_US-libritts_r-medium.pt" ]; then
  curl -L -o piper-sample-generator/models/en_US-libritts_r-medium.pt \
    "https://github.com/rhasspy/piper-sample-generator/releases/download/v2.0.0/en_US-libritts_r-medium.pt"
fi

echo "[4/6] Downloading MIT Room Impulse Responses (MIT_environmental_impulse_responses)..."
if [ ! -d "work/mit_rirs" ]; then
  git lfs install || true
  git clone https://huggingface.co/datasets/davidscripka/MIT_environmental_impulse_responses work/mit_rirs || true
fi

echo "[5/6] Downloading ONNX frontends (openWakeWord, Silero VAD v5, WeSpeaker ResNet34)..."
python3 - <<'PY'
import os, urllib.request
os.makedirs("models", exist_ok=True)
downloads = {
    "models/melspectrogram.onnx": "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/melspectrogram.onnx",
    "models/embedding_model.onnx": "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/embedding_model.onnx",
    "models/silero_vad.onnx": "https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx",
    "models/wespeaker_en_voxceleb_resnet34.onnx": "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_resnet34.onnx",
}
for dest, url in downloads.items():
    if not os.path.exists(dest):
        print(f"Downloading {url} -> {dest}")
        urllib.request.urlretrieve(url, dest)
PY

echo "[6/6] Downloading ACAV100M 2000h negative feature bank & validation features..."
python3 - <<'PY'
import os
from huggingface_hub import hf_hub_download
os.makedirs("work", exist_ok=True)
for fname in [
    "openwakeword_features_ACAV100M_2000_hrs_16bit.npy",
    "validation_set_features.npy",
]:
    dest = os.path.join("work", fname)
    if not os.path.exists(dest):
        print(f"Fetching {fname} (large download)...")
        hf_hub_download(repo_id="davidscripka/openwakeword_features", filename=fname, repo_type="dataset", local_dir="work")
PY

echo "Setup complete! Next step: source .venv/bin/activate && python3 train_pipeline.py"
