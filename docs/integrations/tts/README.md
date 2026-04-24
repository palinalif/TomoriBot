# TTS Integration

TomoriBot treats speech as a custom endpoint capability. Local engines run outside the bot as HTTP servers and implement `POST /synthesize`; TomoriBot only sends text plus the configured reference audio sample.

## Quick Flow

1. Start one wrapper from `scripts/tts/`.
2. Register it with `/config custom-endpoint add` using capability `speech` and api style `tts-clone`.
3. Select it with `/config model speech`.
4. Add a reference sample with `/config speech voice-add`.
5. Assign the sample to a persona with `/config speech voice-assign`.

ElevenLabs users should use `/config speech elevenlabs`; it registers the speech and transcription endpoints together.

## Endpoint Contract

Local wrappers must expose:

- `GET /health` returning JSON with `status: "ok"`
- `POST /synthesize` accepting JSON `{ text, ref_audio, ref_text, instruct, language }`
- a bare `audio/*` response content type such as `audio/wav`

Reference scripts are best-effort examples, not production services. Upstream model packages may break over time; fixes should be made in the wrapper scripts and documented here.
