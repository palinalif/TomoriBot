# TomoriBot Reference TTS Servers

These scripts are optional local wrapper servers for Phase 4 speech endpoints. They expose TomoriBot's `POST /synthesize` contract and keep model weights outside the Bun app.

Each script uses one first-party model variant:

- `chatterbox_turbo_server.py`: Chatterbox-Turbo, bracket tags, default port `8011`.
- `qwen3tts_12hz_17b_base_server.py`: `Qwen/Qwen3-TTS-12Hz-1.7B-Base`, plain clone speech, default port `8012`.
- `irodori_tts_server.py`: `Aratako/Irodori-TTS-500M-v2`, Japanese-focused clone speech, default port `8013`.

## Setup (Windows PowerShell)

Run these commands from the repo root. Swap in the requirements file and server script for the engine you want.

```powershell
# 1. Create and activate a virtual environment inside scripts/tts/
python -m venv scripts\tts\.venv
scripts\tts\.venv\Scripts\Activate.ps1

# 2. Upgrade pip
python -m pip install -U pip

# 3. Install dependencies — example for Chatterbox-Turbo
#    Replace the filename for qwen3tts or irodori as needed.
python -m pip install -r scripts\tts\requirements-chatterbox-turbo.txt

# 4. Start the server
python scripts\tts\chatterbox_turbo_server.py
```

> **CUDA version**: the requirements files default to `cu124` (CUDA 12.4). Edit the
> `--extra-index-url` line to `cu118` or `cu121` if your driver targets an older toolkit.
> Remove the line entirely for a CPU-only install.

## Per-engine requirements and ports

| Engine | Requirements file | Default port |
|---|---|---|
| Chatterbox-Turbo | `requirements-chatterbox-turbo.txt` | 8011 |
| Qwen3-TTS 12Hz 1.7B Base | `requirements-qwen3tts.txt` | 8012 |
| Irodori-TTS 500M v2 | `requirements-irodori.txt` | 8013 |

## Registering in TomoriBot

After the server is running, register it with:

- `capability = speech`
- `api_style = tts-clone`
- `endpoint_url = http://127.0.0.1:<port>`

Use the `script_markup` and `supports_instruct` values from the Phase 4 plan for your chosen engine.

> **ffmpeg required**: voice sample uploads are normalised to WAV via ffmpeg. Install it
> and ensure `ffmpeg` is on your PATH before running `/config speech voice-add`.
