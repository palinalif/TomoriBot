from __future__ import annotations

import argparse
import base64
import os
import sys
import tempfile
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import soundfile as sf
import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel


CLONE_MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
VOICE_DESIGN_MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"


def resolve_mode(raw_mode: str) -> str:
  normalized = raw_mode.strip().lower().replace("_", "-")
  if normalized in {"clone", "voice-clone", "base"}:
    return "clone"
  if normalized in {"voice-design", "design"}:
    return "voice-design"
  raise ValueError("TOMORI_TTS_MODE must be 'clone' or 'voice-design'.")


def read_startup_mode() -> str:
  for index, arg in enumerate(sys.argv[1:], start=1):
    if arg == "--mode" and index + 1 < len(sys.argv):
      return sys.argv[index + 1]
    if arg.startswith("--mode="):
      return arg.split("=", 1)[1]

  return os.getenv("TOMORI_TTS_MODE", "clone")


MODE = resolve_mode(read_startup_mode())
DEFAULT_MODEL_ID = VOICE_DESIGN_MODEL_ID if MODE == "voice-design" else CLONE_MODEL_ID
MODEL_ID = os.getenv("QWEN3TTS_MODEL_ID", DEFAULT_MODEL_ID)
MODEL_NAME = "qwen3-tts-12hz-1.7b-voice-design" if MODE == "voice-design" else "qwen3-tts-12hz-1.7b-base"
HOST = os.getenv("TOMORI_TTS_HOST", "127.0.0.1")
PORT = int(os.getenv("TOMORI_TTS_PORT", "8014" if MODE == "voice-design" else "8012"))
DEVICE_MAP = os.getenv("QWEN3TTS_DEVICE_MAP", "cuda:0" if torch.cuda.is_available() else "cpu")
DTYPE = os.getenv("QWEN3TTS_DTYPE", "bfloat16" if torch.cuda.is_available() else "float32")
USE_FLASH_ATTENTION = os.getenv("QWEN3TTS_FLASH_ATTENTION", "0") == "1"
MAX_TEXT_CHARS = int(os.getenv("TOMORI_TTS_MAX_TEXT_CHARS", "2000"))
DEFAULT_INSTRUCT = os.getenv("TOMORI_TTS_DEFAULT_INSTRUCT", "").strip()

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

model = None
model_lock = threading.Lock()


class SynthesizeRequest(BaseModel):
  text: str
  # Required in clone mode, ignored in voice-design mode.
  ref_audio: Optional[str] = None
  # Clone mode treats this as the reference transcript. VoiceDesign keeps it as
  # a compatibility fallback for manual tests; TomoriBot sends persona prompts
  # in `instruct`.
  ref_text: Optional[str] = None
  # VoiceDesign mode uses this as the voice prompt. Clone mode intentionally
  # ignores it so clone wrappers do not start interpreting delivery directions.
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


def resolve_design_instruct(payload: SynthesizeRequest) -> str:
  # Preferred path: TomoriBot's VoiceDesign adapter sends the persona prompt,
  # plus any one-off voice_instructions, in `instruct`. `ref_text` and the env
  # fallback are kept for manual curl testing and simple single-voice servers.
  for candidate in (payload.instruct, payload.ref_text, DEFAULT_INSTRUCT):
    if candidate and candidate.strip():
      return candidate.strip()

  raise HTTPException(
    status_code=400,
    detail=(
      "VoiceDesign requires a voice description. Send `instruct`, pass `ref_text` "
      "for manual testing, or set TOMORI_TTS_DEFAULT_INSTRUCT."
    ),
  )


def load_model() -> None:
  global model

  from qwen_tts import Qwen3TTSModel

  kwargs: dict = {
    "device_map": DEVICE_MAP,
    "dtype": resolve_dtype(),
  }
  if USE_FLASH_ATTENTION:
    kwargs["attn_implementation"] = "flash_attention_2"

  model = Qwen3TTSModel.from_pretrained(MODEL_ID, **kwargs)


@asynccontextmanager
async def lifespan(_app: FastAPI):
  load_model()
  yield


app = FastAPI(title=f"TomoriBot Qwen3-TTS 12Hz 1.7B {MODE} Server", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
  return {
    "status": "ok" if model is not None else "loading",
    "model": MODEL_NAME,
    "model_id": MODEL_ID,
    "device_map": DEVICE_MAP,
    "mode": MODE,
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

  with tempfile.TemporaryDirectory(prefix=f"tomori-qwen3tts-{MODE}-") as temp_dir:
    output_path = Path(temp_dir) / "output.wav"

    with model_lock:
      if MODE == "voice-design":
        wavs, sample_rate = model.generate_voice_design(
          text=text,
          language=resolve_language(payload.language),
          instruct=resolve_design_instruct(payload),
        )
      else:
        if not payload.ref_audio or not payload.ref_audio.strip():
          raise HTTPException(status_code=400, detail="ref_audio is required.")

        ref_text = payload.ref_text.strip() if payload.ref_text else ""
        ref_path = decode_ref_audio(payload.ref_audio, temp_dir)
        wavs, sample_rate = model.generate_voice_clone(
          text=text,
          language=resolve_language(payload.language),
          ref_audio=ref_path,
          ref_text=ref_text,
          x_vector_only_mode=ref_text == "",
        )

    sf.write(str(output_path), wavs[0], int(sample_rate))
    return Response(content=output_path.read_bytes(), media_type="audio/wav")


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="TomoriBot Qwen3-TTS wrapper")
  parser.add_argument(
    "--mode",
    choices=("clone", "voice-design"),
    default=MODE,
    help="TTS serving mode. Equivalent to TOMORI_TTS_MODE.",
  )
  return parser.parse_args()


if __name__ == "__main__":
  parse_args()
  uvicorn.run(app, host=HOST, port=PORT)
