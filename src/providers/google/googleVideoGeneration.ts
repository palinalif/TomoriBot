import { GoogleGenAI } from "@google/genai";
import type {
  ProviderNativeVideoGenerationRequest,
  ProviderNativeVideoGenerationResult,
} from "@/types/provider/featureInterfaces";
import { log } from "@/utils/misc/logger";
import { pollForCompletion } from "@/utils/async/pollForCompletion";

/** Polling interval for Google Veo operations (10 seconds, per Google docs) */
const POLL_INTERVAL_MS = 10_000;

/** Maximum poll attempts before timeout (~5 minutes at 10s intervals) */
const MAX_POLL_ATTEMPTS = 30;

/**
 * Generate a video using Google's Veo API via the @google/genai SDK.
 *
 * Flow:
 *   1. Call ai.models.generateVideos() — returns a long-running operation
 *   2. Poll every 10s via ai.operations.getVideosOperation() until done
 *   3. Download the video from the operation response
 *
 * Supports:
 *   - Text-to-video: prompt only
 *   - Image-to-video: prompt + single reference image as starting frame
 *   - Aspect ratio: "16:9" (default) or "9:16"
 *
 * @param request - Video generation request with apiKey, model, prompt, and optional parameters
 * @returns Raw MP4 video data as a Buffer, or null values on failure
 */
export async function generateGoogleNativeVideo(
  request: ProviderNativeVideoGenerationRequest,
): Promise<ProviderNativeVideoGenerationResult> {
  const ai = new GoogleGenAI({ apiKey: request.apiKey });

  // 1. Build generation parameters
  const generateParams: Record<string, unknown> = {
    model: request.model,
    prompt: request.prompt,
  };

  // 2. Add config (aspect ratio)
  const config: Record<string, unknown> = {};
  if (request.aspectRatio) {
    config.aspectRatio = request.aspectRatio;
  }
  if (Object.keys(config).length > 0) {
    generateParams.config = config;
  }

  // 3. Add reference image for image-to-video (first image becomes starting frame)
  if (request.referenceImages && request.referenceImages.length > 0) {
    const ref = request.referenceImages[0];
    generateParams.image = {
      imageBytes: ref.data,
      mimeType: ref.mimeType,
    };
  }

  log.info(
    `Google video generation: submitting request (model: ${request.model}, aspectRatio: ${request.aspectRatio ?? "16:9"}, hasReferenceImage: ${!!(request.referenceImages && request.referenceImages.length > 0)})`,
  );

  // 4. Submit the generation request
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let operation = await (ai.models as any).generateVideos(generateParams);

  // 5. Poll for completion
  const completedOp = await pollForCompletion<typeof operation>({
    pollFn: async () => {
      if (operation.done) {
        return { done: true, result: operation };
      }
      // Poll for updated status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      operation = await (ai.operations as any).getVideosOperation({ operation });
      if (operation.done) {
        return { done: true, result: operation };
      }
      return { done: false };
    },
    intervalMs: POLL_INTERVAL_MS,
    maxAttempts: MAX_POLL_ATTEMPTS,
    logLabel: "GoogleVideoGeneration",
  });

  // 6. Extract video from the completed operation
  const generatedVideos = completedOp?.response?.generatedVideos;
  if (!generatedVideos || generatedVideos.length === 0) {
    log.warn(`Google video generation completed but returned no videos (model: ${request.model})`);
    return { videoData: null, mimeType: null };
  }

  const video = generatedVideos[0].video;

  // 7. Download the video file
  //    The SDK provides video.uri for download, or video bytes may be inline
  if (video?.videoBytes) {
    // Video bytes available directly
    const videoData = Buffer.from(video.videoBytes);
    log.info(
      `Google video generation: got inline video bytes (model: ${request.model}, sizeBytes: ${videoData.length})`,
    );
    return { videoData, mimeType: "video/mp4" };
  }

  // Fallback: download from URI using the SDK's files.download
  if (video?.uri) {
    log.info(`Google video generation: downloading from URI (model: ${request.model}, uri: ${video.uri.slice(0, 80)})`);

    try {
      // Use SDK download method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (ai.files as any).download({ file: video });

      // After download, videoBytes should be populated
      if (video.videoBytes) {
        const videoData = Buffer.from(video.videoBytes);
        return { videoData, mimeType: "video/mp4" };
      }

      // If SDK download didn't populate bytes, fetch directly with API key
      const downloadResponse = await fetch(video.uri, {
        headers: { "x-goog-api-key": request.apiKey },
      });

      if (!downloadResponse.ok) {
        throw new Error(`HTTP ${downloadResponse.status}`);
      }

      const arrayBuffer = await downloadResponse.arrayBuffer();
      const videoData = Buffer.from(arrayBuffer);
      return { videoData, mimeType: "video/mp4" };
    } catch (downloadError) {
      log.error("Failed to download Google video", downloadError as Error, {
        errorType: "GoogleVideoDownloadError",
        metadata: { model: request.model },
      });
      return { videoData: null, mimeType: null };
    }
  }

  log.warn(`Google video generation: no video bytes or URI in response (model: ${request.model})`);
  return { videoData: null, mimeType: null };
}
