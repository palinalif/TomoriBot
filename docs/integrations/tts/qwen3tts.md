# Qwen3-TTS

Use `scripts/tts/qwen3tts_12hz_17b_base_server.py` for the Phase 4 Qwen3-TTS 12Hz 1.7B Base reference clone path.

```powershell
cd scripts/tts
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-qwen3tts.txt
python qwen3tts_12hz_17b_base_server.py
```

Register with `/config custom-endpoint add`:

- capability: `speech`
- api_style: `tts-clone`
- endpoint_url: your wrapper URL
- script_markup: `plain`
- supports_instruct: `false`

When vLLM-Omni or another stable hosted serving path supports this model, prefer documenting that as the production path and keep this wrapper as a reference implementation.
