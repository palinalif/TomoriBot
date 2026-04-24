from __future__ import annotations

import base64
import os
import tempfile
import threading
from pathlib import Path
from typing import Optional

import soundfile as sf
import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel


MODEL_ID = os.getenv("QWEN3TTS_MODEL_ID", "Qwen/Qwen3-TTS-12Hz-1.7B-Base")
MODEL_NAME = "qwen3-tts-12hz-1.7b-base"
HOST = os.getenv("TOMORI_TTS_HOST", "127.0.0.1")
PORT = int(os.getenv("TOMORI_TTS_PORT", "8012"))
DEVICE_MAP = os.getenv("QWEN3TTS_DEVICE_MAP", "cuda:0" if torch.cuda.is_available() else "cpu")
DTYPE = os.getenv("QWEN3TTS_DTYPE", "bfloat16" if torch.cuda.is_available() else "float32")
USE_FLASH_ATTENTION = os.getenv("QWEN3TTS_FLASH_ATTENTION", "0") == "1"
MAX_TEXT_CHARS = int(os.getenv("TOMORI_TTS_MAX_TEXT_CHARS", "2000"))

LANGUAGE_NAMES = {
  "zh": "Chinese",
  "zh-cn": "Chinese",
  "en": "English",
  "ja": "Japanese",
  "jp": "Japanese",
  "ko": "Korean",
  "de": "German",
  "fr": "French",
  "ru": "Russian",
  "pt": "Portuguese",
  "es": "Spanish",
  "it": "Italian",
}

app = FastAPI(title="TomoriBot Qwen3-TTS 12Hz 1.7B Base Server")
model = None
model_lock = threading.Lock()


class SynthesizeRequest(BaseModel):
  text: str
  ref_audio: str
  ref_text: Optional[str] = None
  instruct: Optional[str] = None
  language: Optional[str] = None


def decode_ref_audio(raw_base64: str, directory: str) -> str:
  try:
    audio_bytes = base64.b64decode(raw_base64, validate=True)
  except Exception as exc:
    raise HTTPException(status_code=400, detail="ref_audio must be valid base64.") from exc

  ref_path = Path(directory) / "reference.wav"
  ref_path.write_bytes(audio_bytes)
  return str(ref_path)


def resolve_dtype() -> torch.dtype:
  normalized = DTYPE.strip().lower()
  if normalized in {"bf16", "bfloat16"}:
    return torch.bfloat16
  if normalized in {"fp16", "float16"}:
    return torch.float16
  return torch.float32


def resolve_language(language: Optional[str]) -> str:
  if not language or not language.strip():
    return "Auto"

  normalized = language.strip().lower().replace("_", "-")
  return LANGUAGE_NAMES.get(normalized, language.strip())


@app.on_event("startup")
def load_model() -> None:
  global model

  from qwen_tts import Qwen3TTSModel

  kwargs = {
    "device_map": DEVICE_MAP,
    "dtype": resolve_dtype(),
  }
  if USE_FLASH_ATTENTION:
    kwargs["attn_implementation"] = "flash_attention_2"

  model = Qwen3TTSModel.from_pretrained(MODEL_ID, **kwargs)


@app.get("/health")
def health() -> dict[str, str]:
  return {
    "status": "ok" if model is not None else "loading",
    "model": MODEL_NAME,
    "model_id": MODEL_ID,
    "device_map": DEVICE_MAP,
  }


@app.post("/synthesize")
def synthesize(payload: SynthesizeRequest) -> Response:
  if model is None:
    raise HTTPException(status_code=503, detail="Model is still loading.")

  text = payload.text.strip()
  if not text:
    raise HTTPException(status_code=400, detail="text is required.")
  if len(text) > MAX_TEXT_CHARS:
    raise HTTPException(status_code=400, detail=f"text exceeds {MAX_TEXT_CHARS} characters.")
  if not payload.ref_audio.strip():
    raise HTTPException(status_code=400, detail="ref_audio is required.")

  ref_text = payload.ref_text.strip() if payload.ref_text else ""
  x_vector_only_mode = ref_text == ""

  with tempfile.TemporaryDirectory(prefix="tomori-qwen3tts-") as temp_dir:
    ref_path = decode_ref_audio(payload.ref_audio, temp_dir)
    output_path = Path(temp_dir) / "output.wav"

    with model_lock:
      wavs, sample_rate = model.generate_voice_clone(
        text=text,
        language=resolve_language(payload.language),
        ref_audio=ref_path,
        ref_text=ref_text,
        x_vector_only_mode=x_vector_only_mode,
      )

    sf.write(str(output_path), wavs[0], int(sample_rate))
    return Response(content=output_path.read_bytes(), media_type="audio/wav")


if __name__ == "__main__":
  uvicorn.run(app, host=HOST, port=PORT)
