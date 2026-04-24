# IrodoriTTS

Use `scripts/tts/irodori_tts_server.py` for the Japanese-focused IrodoriTTS local clone path.

```powershell
cd scripts/tts
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-irodori.txt
python irodori_tts_server.py
```

Register with `/config custom-endpoint add`:

- capability: `speech`
- api_style: `tts-clone`
- endpoint_url: your wrapper URL
- script_markup: `plain`
- supports_instruct: `false`

Then select it with `/config model speech`, upload a sample with `/config speech voice-add`, and assign it with `/config speech voice-assign`.
