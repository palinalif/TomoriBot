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

The command supports:

- Text-to-video
- Image-to-video through an optional uploaded reference image
- Aspect ratio selection

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
