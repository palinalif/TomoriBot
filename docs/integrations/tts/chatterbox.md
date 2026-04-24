# Chatterbox-Turbo TTS

Use `scripts/tts/chatterbox_turbo_server.py` for a local clone endpoint that preserves bracket delivery tags.

```powershell
cd scripts/tts
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-chatterbox-turbo.txt
python chatterbox_turbo_server.py
```

Register with `/config custom-endpoint add`:

- capability: `speech`
- api_style: `tts-clone`
- endpoint_url: your wrapper URL, usually `http://127.0.0.1:8020`
- script_markup: `bracket-tags`
- supports_instruct: `false`

Then run `/config model speech`, `/config speech voice-add`, and `/config speech voice-assign`.
