# Video Generation

This document summarizes the current video generation stack.

## Command Surface

- User-facing generation entrypoint: `src/commands/generate/video.ts`
- Admin model selection: `src/commands/config/model/video.ts`
- Admin quota controls:
  - `src/commands/server/quota/video-generation.ts`
  - `src/commands/server/quota/reset.ts`
- Capability/help exposure:
  - `src/commands/help/features.ts`
  - `src/tools/functionCalls/reviewCapabilities.ts`

## Runtime Flow

`/generate video` follows this sequence:

1. Load `TomoriState`.
2. Validate `videogen_enabled`.
3. Validate provider support for `nativeVideoGeneration`.
4. Validate configured API key and `video_model_id`.
5. Check video quota with `utils/quota/videoQuotaManager.ts`.
6. Show a modal for prompt, aspect ratio, and optional reference image.
7. Poll the provider asynchronously until the generated MP4 is ready.
8. Send the final file back to Discord.
9. Increment quota only after a successful delivery path.

This mirrors the image-generation architecture, but all provider implementations are asynchronous and return binary MP4 output rather than base64 images.

## Providers

Provider routing is resolved through `utils/provider/providerInfoRegistry.ts`.

Current native video implementations live in:

- `src/providers/google/googleVideoGeneration.ts`
- `src/providers/openrouter/openrouterVideoGeneration.ts`
- `src/providers/zai/zaiVideoGeneration.ts`

### OpenRouter: alpha API (subject to change)

OpenRouter's video generation API is currently in alpha (`/api/alpha/videos`). The endpoint, request/response shapes, and supported models are expected to change as it moves toward a stable release. When that happens, `openrouterVideoGeneration.ts` will need to be updated to match the new contract.

### OpenRouter: curl-based HTTP (TLS fingerprint bypass)

OpenRouter's API sits behind Cloudflare, which uses JA3/JA4 TLS fingerprinting to identify HTTP clients. Bun's BoringSSL stack produces a non-standard fingerprint that Cloudflare serves a cached HTML page to (HTTP 200 with HTML body) instead of routing to the API origin. Both `fetch()` and Bun's `node:https` compatibility shim share this same fingerprint.

To work around this, `openrouterVideoGeneration.ts` uses a `curlRequest()` helper that spawns `curl` as a child process via `Bun.spawn`. `curl` uses the system's native TLS stack (OpenSSL on Linux, Schannel on Windows), which produces a standard fingerprint that Cloudflare allows through.

**Deployment requirement**: The host environment must have `curl` available on `PATH`. This is standard on all major Linux distributions and Windows 10+.

The Google and Z.ai providers use Bun's native `fetch()` directly since their APIs are not affected by TLS fingerprinting.

The command supports:

- Text-to-video
- Image-to-video through an optional uploaded reference image
- Aspect ratio selection

The built-in `generate_video` tool also supports:

- `duration` in seconds
- `resolution` as `480p`, `720p`, or `1080p`

Tool defaults are:

- `duration = 5`
- `resolution = 720p`

Provider adapters normalize unsupported values to the nearest supported provider/model combination instead of blindly passing invalid values through.

## Configuration and State

Video generation uses these server-scoped config fields:

- `tomori_configs.videogen_enabled`
- `tomori_configs.video_model_id`

Provider snapshot save/restore also preserves `saved_provider_configs.video_model_id` so `/config provider switch` can restore the previous video model with the rest of the provider state.

## Quotas

Video quotas are separate from image and text quotas because video generation is more expensive.

Tables:

- `video_quota_configs`
- `video_quotas`
- `video_serverwide_quotas`

Defaults:

- `daily_user_quota = 3`
- `serverwide_quota = 0` (`0` means unlimited)
- `serverwide_quota_resets_in = 365`

Management commands:

- `/server quota video-generation`
- `/server quota reset`

Reset behavior supports both:

- per-user daily usage reset
- server-wide pool reset

## Discord Delivery Constraints

The command currently enforces Discord's standard upload ceiling and rejects oversized results before attempting to send them.

- current limit: `25 MB`
- file type: `mp4`

## Related Files

- `src/utils/quota/videoQuotaManager.ts`
- `src/types/db/schema.ts`
- `src/db/schema.sql`
- `src/utils/db/dbWrite.ts`
- `src/utils/db/dbRead.ts`
