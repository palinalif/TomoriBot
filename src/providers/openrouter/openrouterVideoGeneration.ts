import type {
  ProviderNativeVideoGenerationRequest,
  ProviderNativeVideoGenerationResult,
} from "@/types/provider/featureInterfaces";
import { log } from "@/utils/misc/logger";
import { pollForCompletion } from "@/utils/async/pollForCompletion";

/** OpenRouter alpha video generation endpoint */
const OPENROUTER_VIDEO_URL = "https://openrouter.ai/api/alpha/videos";

/** Polling interval for OpenRouter video jobs (30 seconds, per OpenRouter docs) */
const POLL_INTERVAL_MS = 30_000;

/** Maximum poll attempts before timeout (~10 minutes at 30s intervals) */
const MAX_POLL_ATTEMPTS = 20;

/** Shape of the OpenRouter video job creation response */
interface OpenRouterVideoSubmitResponse {
  id?: string;
  polling_url?: string;
  status?: string;
  error?: string;
}

/** Shape of the OpenRouter video job poll response */
interface OpenRouterVideoPollResponse {
  id?: string;
  status?: "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "expired";
  unsigned_urls?: string[];
  error?: string;
  usage?: {
    cost?: number;
    is_byok?: boolean;
  };
}

/**
 * Generate a video using OpenRouter's alpha video generation API.
 *
 * Flow:
 *   1. POST to /api/alpha/videos with model, prompt, and parameters
 *   2. Receive a job ID with "pending" status
 *   3. Poll every 30s via GET /api/alpha/videos/:jobId until "completed" or "failed"
 *   4. Download the MP4 from the unsigned_urls or content endpoint
 *
 * Supported models: google/veo-3.1, bytedance/seedance-1-5-pro, alibaba/wan-2.6, openai/sora-2-pro
 *
 * @param request - Video generation request with apiKey, model, prompt, and optional parameters
 * @returns Raw MP4 video data as a Buffer, or null values on failure
 */
export async function generateOpenRouterNativeVideo(
  request: ProviderNativeVideoGenerationRequest,
): Promise<ProviderNativeVideoGenerationResult> {
  // 1. Build request body
  const body: Record<string, unknown> = {
    model: request.model,
    prompt: request.prompt,
    generate_audio: true,
  };

  // Add aspect ratio if specified
  if (request.aspectRatio) {
    body.aspect_ratio = request.aspectRatio;
  }

  // Add reference images for image-to-video
  if (request.referenceImages && request.referenceImages.length > 0) {
    body.input_references = request.referenceImages.map((ref) => ({
      type: "image_url",
      image_url: {
        url: `data:${ref.mimeType};base64,${ref.data}`,
      },
    }));
  }

  log.info(
    `OpenRouter video generation: submitting request (model: ${request.model}, aspectRatio: ${request.aspectRatio ?? "default"}, hasReferenceImages: ${!!(request.referenceImages && request.referenceImages.length > 0)})`,
  );

  // 2. Submit the generation request
  const submitResponse = await fetch(OPENROUTER_VIDEO_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!submitResponse.ok) {
    const errorBody = await submitResponse.text();
    log.error(
      `OpenRouter video generation request failed (model: ${request.model}, status: ${submitResponse.status})`,
      new Error(errorBody),
    );
    throw new Error(`OpenRouter video generation failed: ${submitResponse.status} ${submitResponse.statusText}`);
  }

  const submitResult = (await submitResponse.json()) as OpenRouterVideoSubmitResponse;
  const jobId = submitResult.id;

  if (!jobId) {
    log.error("OpenRouter video generation returned no job ID", new Error("Missing job ID"));
    throw new Error("OpenRouter video generation returned no job ID");
  }

  log.info(`OpenRouter video generation: job submitted, polling for completion (jobId: ${jobId})`);

  // 3. Poll for completion
  const completedJob = await pollForCompletion<OpenRouterVideoPollResponse>({
    pollFn: async () => {
      const pollResponse = await fetch(`${OPENROUTER_VIDEO_URL}/${jobId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${request.apiKey}`,
        },
      });

      if (!pollResponse.ok) {
        await pollResponse.text(); // Drain body
        log.warn(`OpenRouter video poll request failed (jobId: ${jobId}, status: ${pollResponse.status})`);
        return { done: false };
      }

      const pollResult = (await pollResponse.json()) as OpenRouterVideoPollResponse;

      switch (pollResult.status) {
        case "completed":
          return { done: true, result: pollResult };
        case "failed":
          return {
            done: true,
            error: `OpenRouter video generation failed: ${pollResult.error ?? "unknown error"}`,
          };
        case "cancelled":
          return { done: true, error: "OpenRouter video generation was cancelled" };
        case "expired":
          return { done: true, error: "OpenRouter video generation expired" };
        default:
          // "pending" or "in_progress"
          return { done: false };
      }
    },
    intervalMs: POLL_INTERVAL_MS,
    maxAttempts: MAX_POLL_ATTEMPTS,
    logLabel: "OpenRouterVideoGeneration",
  });

  // 4. Download the video
  //    Use unsigned_urls if available, otherwise use the content endpoint
  const videoUrl = completedJob.unsigned_urls?.[0] ?? `${OPENROUTER_VIDEO_URL}/${jobId}/content?index=0`;

  log.info(`OpenRouter video generation: downloading video (jobId: ${jobId}, url: ${videoUrl.slice(0, 80)})`);

  const videoResponse = await fetch(videoUrl, {
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
    },
  });

  if (!videoResponse.ok) {
    log.error(`Failed to download OpenRouter video (jobId: ${jobId})`, new Error(`HTTP ${videoResponse.status}`));
    return { videoData: null, mimeType: null };
  }

  const arrayBuffer = await videoResponse.arrayBuffer();
  const videoData = Buffer.from(arrayBuffer);

  log.info(`OpenRouter video generation: download complete (jobId: ${jobId}, sizeBytes: ${videoData.length})`);

  return {
    videoData,
    mimeType: "video/mp4",
  };
}
