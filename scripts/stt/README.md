# TomoriBot Reference STT Server

`whisperx_server.py` is the Phase 4 reference local STT endpoint. It exposes:

- `GET /health`
- `GET /v1/models`
- `POST /v1/audio/transcriptions`

Basic setup:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
python -m pip install -r scripts\stt\requirements-whisperx.txt
python scripts\stt\whisperx_server.py
```

Register the running server in TomoriBot with `capability = transcription`, `api_style = openai-compatible-transcription`, and `model = large-v3` unless you set `WHISPERX_MODEL` to another local model.
