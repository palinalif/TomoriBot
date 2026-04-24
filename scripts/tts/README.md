# TomoriBot Reference TTS Servers

These scripts are optional local wrapper servers for Phase 4 speech endpoints. They expose TomoriBot's `POST /synthesize` contract and keep model weights outside the Bun app.

Each script uses one first-party model variant:

- `chatterbox_turbo_server.py`: Chatterbox-Turbo, bracket tags, default port `8011`.
- `qwen3tts_12hz_17b_base_server.py`: `Qwen/Qwen3-TTS-12Hz-1.7B-Base`, plain clone speech, default port `8012`.
- `irodori_tts_server.py`: `Aratako/Irodori-TTS-500M-v2`, Japanese-focused clone speech, default port `8013`.

Basic setup:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
python -m pip install -r scripts\maintenance\tts\requirements-chatterbox-turbo.txt
python scripts\maintenance\tts\chatterbox_turbo_server.py
```

Use the matching requirements file and server script for the engine you want to run. Register the running server in TomoriBot with `capability = speech`, `api_style = tts-clone`, and the script-specific `script_markup` / `supports_instruct` values from the Phase 4 plan.
