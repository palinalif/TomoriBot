import type {
  ProviderNativeVideoGenerationRequest,
  ProviderNativeVideoGenerationResult,
} from "@/types/provider/featureInterfaces";
import { log } from "@/utils/misc/logger";
import { pollForCompletion } from "@/utils/async/pollForCompletion";

/** Z.ai video generation API endpoint */
const ZAI_VIDEO_GENERATIONS_URL = "https://api.z.ai/api/paas/v4/videos/generations";

/** Z.ai async video retrieval endpoint (uses task ID from generation response) */
const ZAI_ASYNC_RESULT_URL = "https://api.z.ai/api/paas/v4/async-result";

/** Polling interval for Z.ai video generation status checks (10 seconds) */
const POLL_INTERVAL_MS = 10_000;

/** Maximum poll attempts before timeout (~5 minutes at 10s intervals) */
const MAX_POLL_ATTEMPTS = 30;

/**
 * Aspect ratio to pixel size mapping for Z.ai CogVideoX-3.
 * Supported resolutions: 1280x720, 720x1280, 1024x1024, 1920x1080, 1080x1920, 2048x1080, 3840x2160
 */
const ASPECT_RATIO_TO_SIZE: Record<string, string> = {
  "16:9": "1920x1080",
  "9:16": "1080x1920",
  "1:1": "1024x1024",
  "21:9": "2048x1080",
};

const DEFAULT_SIZE = "1920x1080";

/** Shape of the Z.ai video generation response */
interface ZaiVideoResponse {
  id?: string;
  request_id?: string;
  model?: string;
  task_status?: "PROCESSING" | "SUCCESS" | "FAIL";
  video_result?: Array<{
    url?: string;
    cover_image_url?: string;
  }>;
}

/**
 * Generate a video using Z.ai's CogVideoX-3 API.
 *
 * Flow:
 *   1. POST to /paas/v4/videos/generations with prompt and parameters
 *   2. Receive a task ID with PROCESSING status
 *   3. Poll /paas/v4/async-result/{taskId} until SUCCESS or FAIL
 *   4. Download the MP4 from the result URL
 *
 * @param request - Video generation request with apiKey, model, prompt, and optional parameters
 * @returns Raw MP4 video data as a Buffer, or null values on failure
 */
export async function generateZaiNativeVideo(
  request: ProviderNativeVideoGenerationRequest,
): Promise<ProviderNativeVideoGenerationResult> {
  const size = ASPECT_RATIO_TO_SIZE[request.aspectRatio ?? "16:9"] ?? DEFAULT_SIZE;

  // 1. Build request body
  const body: Record<string, unknown> = {
    model: request.model,
    prompt: request.prompt,
    size,
    quality: "quality",
    with_audio: true,
    fps: 30,
    duration: 5,
  };

  // 2. Add reference image for image-to-video if provided
  if (request.referenceImages && request.referenceImages.length > 0) {
    const ref = request.referenceImages[0];
    body.image_url = [`data:${ref.mimeType};base64,${ref.data}`];
  }

  // 3. Submit generation request
  log.info(
    `Z.ai video generation: submitting request (model: ${request.model}, size: ${size}, hasReferenceImage: ${!!(request.referenceImages && request.referenceImages.length > 0)})`,
  );

  const response = await fetch(request.endpointUrl || ZAI_VIDEO_GENERATIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    log.error(
      `Z.ai video generation request failed (model: ${request.model}, status: ${response.status})`,
      new Error(errorBody),
    );
    throw new Error(`Z.ai video generation failed: ${response.status} ${response.statusText}`);
  }

  const submitResult = (await response.json()) as ZaiVideoResponse;
  const taskId = submitResult.id;

  if (!taskId) {
    log.error("Z.ai video generation returned no task ID", new Error("Missing task ID"));
    throw new Error("Z.ai video generation returned no task ID");
  }

  log.info(`Z.ai video generation: task submitted, polling for completion (taskId: ${taskId})`);

  // 4. Poll for completion
  const completedResult = await pollForCompletion<ZaiVideoResponse>({
    pollFn: async () => {
      const pollResponse = await fetch(`${ZAI_ASYNC_RESULT_URL}/${taskId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${request.apiKey}`,
        },
      });

      if (!pollResponse.ok) {
        await pollResponse.text(); // Drain body
        log.warn(`Z.ai video poll request failed (taskId: ${taskId}, status: ${pollResponse.status})`);
        return { done: false };
      }

      const pollResult = (await pollResponse.json()) as ZaiVideoResponse;

      if (pollResult.task_status === "SUCCESS") {
        return { done: true, result: pollResult };
      }
      if (pollResult.task_status === "FAIL") {
        return { done: true, error: "Z.ai video generation task failed" };
      }
      // Still PROCESSING
      return { done: false };
    },
    intervalMs: POLL_INTERVAL_MS,
    maxAttempts: MAX_POLL_ATTEMPTS,
    logLabel: "ZaiVideoGeneration",
  });

  // 5. Extract video URL from result
  const videoUrl = completedResult.video_result?.[0]?.url;
  if (!videoUrl) {
    log.warn(`Z.ai video generation completed but returned no video URL (taskId: ${taskId})`);
    return { videoData: null, mimeType: null };
  }

  // 6. Download the video
  log.info(`Z.ai video generation: downloading video (taskId: ${taskId}, url: ${videoUrl.slice(0, 80)})`);
  const videoResponse = await fetch(videoUrl);
  if (!videoResponse.ok) {
    log.error(`Failed to download Z.ai video (taskId: ${taskId})`, new Error(`HTTP ${videoResponse.status}`));
    return { videoData: null, mimeType: null };
  }

  const arrayBuffer = await videoResponse.arrayBuffer();
  const videoData = Buffer.from(arrayBuffer);

  return {
    videoData,
    mimeType: "video/mp4",
  };
}
