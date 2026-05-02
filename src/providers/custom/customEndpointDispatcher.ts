import type { CustomEndpointRow } from "@/types/db/schema";
import type {
  ProviderNativeImageGenerationRequest,
  ProviderNativeImageGenerationResult,
  ProviderNativeVideoGenerationRequest,
  ProviderNativeVideoGenerationResult,
} from "@/types/provider/featureInterfaces";
import { buildCustomHeaders } from "@/providers/custom/customOpenAICompatibleUtils";
import { fetchUserRemoteUrl } from "@/utils/security/userRemoteFetch";

type ComfyUiGenerationMode = "image" | "video";

interface ComfyUiReferenceImage {
  mimeType: string;
  data: string;
  url?: string;
}

interface ComfyUiGenerationOptions {
  mode: ComfyUiGenerationMode;
  prompt: string;
  aspectRatio?: string;
  durationSeconds?: number;
  resolution?: string;
  generateAudio?: boolean;
  referenceImages?: ComfyUiReferenceImage[];
}

type WorkflowPlaceholderValue = string | number | boolean | null | Record<string, unknown> | Array<unknown>;

const COMFYUI_IMAGE_TARGET_AREA = (() => {
  const parsed = Number.parseInt(process.env.COMFYUI_IMAGE_TARGET_AREA || "1048576", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1024 * 1024;
})();
const COMFYUI_DIMENSION_MULTIPLE = 64;

function getComfyUiTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.COMFYUI_POLL_TIMEOUT_MS ?? "300000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300000;
}

function parseAspectRatio(
  aspectRatio: string | undefined,
  fallback: string,
): { widthUnits: number; heightUnits: number } {
  const normalized = aspectRatio?.trim() || fallback;
  const match = normalized.match(/^(\d+):(\d+)$/);
  if (!match) {
    return fallback === normalized ? { widthUnits: 1, heightUnits: 1 } : parseAspectRatio(fallback, fallback);
  }

  const widthUnits = Number.parseInt(match[1], 10);
  const heightUnits = Number.parseInt(match[2], 10);
  if (!Number.isFinite(widthUnits) || !Number.isFinite(heightUnits) || widthUnits <= 0 || heightUnits <= 0) {
    return fallback === normalized ? { widthUnits: 1, heightUnits: 1 } : parseAspectRatio(fallback, fallback);
  }

  return { widthUnits, heightUnits };
}

function roundToNearestMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

function buildComfyUiImageDimensions(aspectRatio: string | undefined): { width: number; height: number } {
  const { widthUnits, heightUnits } = parseAspectRatio(aspectRatio, "1:1");
  const width = Math.sqrt((COMFYUI_IMAGE_TARGET_AREA * widthUnits) / heightUnits);
  const height = Math.sqrt((COMFYUI_IMAGE_TARGET_AREA * heightUnits) / widthUnits);

  return {
    width: roundToNearestMultiple(width, COMFYUI_DIMENSION_MULTIPLE),
    height: roundToNearestMultiple(height, COMFYUI_DIMENSION_MULTIPLE),
  };
}

function buildComfyUiVideoDimensions(
  aspectRatio: string | undefined,
  resolution: string | undefined,
): {
  width: number;
  height: number;
} {
  const normalizedResolution = resolution === "1080p" ? "1080p" : resolution === "720p" ? "720p" : "480p";
  const normalizedAspectRatio = aspectRatio === "9:16" || aspectRatio === "1:1" ? aspectRatio : "16:9";

  if (normalizedAspectRatio === "9:16") {
    if (normalizedResolution === "1080p") {
      return { width: 1080, height: 1920 };
    }
    if (normalizedResolution === "720p") {
      return { width: 720, height: 1280 };
    }
    return { width: 480, height: 854 };
  }

  if (normalizedAspectRatio === "1:1") {
    if (normalizedResolution === "1080p") {
      return { width: 1024, height: 1024 };
    }
    if (normalizedResolution === "720p") {
      return { width: 720, height: 720 };
    }
    return { width: 480, height: 480 };
  }

  if (normalizedResolution === "1080p") {
    return { width: 1920, height: 1080 };
  }
  if (normalizedResolution === "720p") {
    return { width: 1280, height: 720 };
  }
  return { width: 854, height: 480 };
}

function buildComfyUiDimensions(options: ComfyUiGenerationOptions): { width: number; height: number } {
  return options.mode === "video"
    ? buildComfyUiVideoDimensions(options.aspectRatio, options.resolution)
    : buildComfyUiImageDimensions(options.aspectRatio);
}

function buildComfyUiReferencePayload(referenceImages: ComfyUiReferenceImage[]): Array<Record<string, unknown>> {
  return referenceImages.map((referenceImage, index) => ({
    index: index + 1,
    mimeType: referenceImage.mimeType,
    data: referenceImage.data,
    dataUrl: `data:${referenceImage.mimeType};base64,${referenceImage.data}`,
    ...(referenceImage.url ? { url: referenceImage.url } : {}),
  }));
}

function stringifyWorkflowPlaceholder(value: WorkflowPlaceholderValue): string {
  if (value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function replaceWorkflowStringPlaceholders(
  value: string,
  placeholders: Record<string, WorkflowPlaceholderValue>,
): WorkflowPlaceholderValue {
  const exactMatch = value.match(/^\{([A-Z0-9_]+)\}$/);
  if (exactMatch && Object.hasOwn(placeholders, exactMatch[1])) {
    return placeholders[exactMatch[1]];
  }

  let replaced = value;
  for (const [placeholderName, placeholderValue] of Object.entries(placeholders)) {
    const token = `{${placeholderName}}`;
    if (!replaced.includes(token)) {
      continue;
    }
    replaced = replaced.split(token).join(stringifyWorkflowPlaceholder(placeholderValue));
  }

  return replaced;
}

function replaceWorkflowPlaceholders(value: unknown, placeholders: Record<string, WorkflowPlaceholderValue>): unknown {
  if (typeof value === "string") {
    return replaceWorkflowStringPlaceholders(value, placeholders);
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceWorkflowPlaceholders(item, placeholders));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, replaceWorkflowPlaceholders(childValue, placeholders)]),
    );
  }

  return value;
}

function buildComfyUiPlaceholderMap(
  endpoint: CustomEndpointRow,
  options: ComfyUiGenerationOptions,
  dimensions: { width: number; height: number },
  referencePayload: Array<Record<string, unknown>>,
): Record<string, WorkflowPlaceholderValue> {
  const placeholderMap: Record<string, WorkflowPlaceholderValue> = {
    TOMORI_PROMPT: options.prompt,
    TOMORI_MODEL: endpoint.model_name ?? endpoint.display_name,
    TOMORI_MODEL_NAME: endpoint.model_name ?? endpoint.display_name,
    TOMORI_MODE: options.mode,
    TOMORI_ASPECT_RATIO: options.aspectRatio ?? (options.mode === "video" ? "16:9" : "1:1"),
    TOMORI_WIDTH: dimensions.width,
    TOMORI_HEIGHT: dimensions.height,
    TOMORI_SIZE: `${dimensions.width}x${dimensions.height}`,
    TOMORI_REFERENCE_IMAGE_COUNT: referencePayload.length,
    TOMORI_REFERENCE_IMAGES: referencePayload,
    TOMORI_REFERENCE_IMAGES_JSON: JSON.stringify(referencePayload),
    TOMORI_VIDEO_DURATION: options.durationSeconds ?? 0,
    TOMORI_DURATION_SECONDS: options.durationSeconds ?? 0,
    TOMORI_VIDEO_RESOLUTION: options.resolution ?? "",
    TOMORI_RESOLUTION: options.resolution ?? "",
    TOMORI_GENERATE_AUDIO: options.generateAudio ?? false,
  };

  for (const referenceImage of referencePayload) {
    const index = referenceImage.index as number;
    placeholderMap[`TOMORI_REFERENCE_IMAGE_${index}`] = referenceImage;
    placeholderMap[`TOMORI_REFERENCE_IMAGE_${index}_DATA_URL`] = referenceImage.dataUrl as string;
    placeholderMap[`TOMORI_REFERENCE_IMAGE_${index}_BASE64`] = referenceImage.data as string;
    placeholderMap[`TOMORI_REFERENCE_IMAGE_${index}_MIME_TYPE`] = referenceImage.mimeType as string;
    if (typeof referenceImage.url === "string") {
      placeholderMap[`TOMORI_REFERENCE_IMAGE_${index}_URL`] = referenceImage.url;
    }
  }

  return placeholderMap;
}

async function generateWithComfyUi(
  endpoint: CustomEndpointRow,
  apiKey: string,
  options: ComfyUiGenerationOptions,
): Promise<{ filename: string; subfolder?: string; type?: string }[]> {
  const savedWorkflow = endpoint.extra_config.workflow;
  if (!savedWorkflow || typeof savedWorkflow !== "object") {
    throw new Error("ComfyUI workflow JSON is missing.");
  }

  const dimensions = buildComfyUiDimensions(options);
  const referencePayload = buildComfyUiReferencePayload(options.referenceImages ?? []);
  const placeholders = buildComfyUiPlaceholderMap(endpoint, options, dimensions, referencePayload);
  const workflow = replaceWorkflowPlaceholders(savedWorkflow, placeholders);
  const postHeaders = buildCustomHeaders(apiKey);
  const getHeaders = { ...postHeaders };
  delete getHeaders["Content-Type"];

  const promptResponse = await fetchUserRemoteUrl(`${endpoint.endpoint_url.replace(/\/+$/, "")}/prompt`, {
    method: "POST",
    headers: postHeaders,
    body: JSON.stringify({
      prompt: workflow,
      client_id: `tomoribot-${Date.now()}`,
      extra_data: {
        extra_pnginfo: {
          tomori_prompt: options.prompt,
          tomori_model: endpoint.model_name ?? endpoint.display_name,
          tomori_mode: options.mode,
          tomori_aspect_ratio: placeholders.TOMORI_ASPECT_RATIO,
          tomori_width: dimensions.width,
          tomori_height: dimensions.height,
          tomori_size: `${dimensions.width}x${dimensions.height}`,
          tomori_reference_image_count: referencePayload.length,
          ...(options.mode === "video"
            ? {
                tomori_video_duration: options.durationSeconds ?? 0,
                tomori_video_resolution: options.resolution ?? "",
                tomori_generate_audio: options.generateAudio ?? false,
              }
            : {}),
        },
      },
    }),
  });

  if (!promptResponse.ok) {
    throw new Error(`ComfyUI prompt failed: ${promptResponse.status} ${promptResponse.statusText}`);
  }

  const promptPayload = (await promptResponse.json()) as { prompt_id?: string };
  if (!promptPayload.prompt_id) {
    throw new Error("ComfyUI did not return a prompt_id.");
  }

  const timeoutAt = Date.now() + getComfyUiTimeoutMs();
  while (Date.now() < timeoutAt) {
    const historyResponse = await fetchUserRemoteUrl(
      `${endpoint.endpoint_url.replace(/\/+$/, "")}/history/${encodeURIComponent(promptPayload.prompt_id)}`,
      { headers: getHeaders },
    );

    if (historyResponse.ok) {
      const historyPayload = (await historyResponse.json()) as Record<
        string,
        {
          outputs?: Record<
            string,
            {
              images?: Array<{ filename: string; subfolder?: string; type?: string }>;
              gifs?: Array<{ filename: string; subfolder?: string; type?: string }>;
              videos?: Array<{ filename: string; subfolder?: string; type?: string }>;
            }
          >;
        }
      >;

      const historyItem = historyPayload[promptPayload.prompt_id];
      const outputs = historyItem?.outputs ? Object.values(historyItem.outputs) : [];
      const files = outputs.flatMap((output) => [
        ...(output.images ?? []),
        ...(output.gifs ?? []),
        ...(output.videos ?? []),
      ]);
      if (files.length > 0) {
        return files;
      }
    }

    await Bun.sleep(1500);
  }

  throw new Error("ComfyUI generation timed out.");
}

async function downloadComfyUiAsset(
  endpoint: CustomEndpointRow,
  apiKey: string,
  asset: { filename: string; subfolder?: string; type?: string },
): Promise<Buffer> {
  const url = new URL(`${endpoint.endpoint_url.replace(/\/+$/, "")}/view`);
  url.searchParams.set("filename", asset.filename);
  if (asset.subfolder) {
    url.searchParams.set("subfolder", asset.subfolder);
  }
  if (asset.type) {
    url.searchParams.set("type", asset.type);
  }

  const headers = { ...buildCustomHeaders(apiKey) };
  delete headers["Content-Type"];

  const response = await fetchUserRemoteUrl(url.toString(), { headers });
  if (!response.ok) {
    throw new Error(`ComfyUI asset download failed: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function generateCustomImageViaEndpoint(params: {
  endpoint: CustomEndpointRow;
  apiKey: string;
  prompt: string;
  aspectRatio: string;
  referenceImages?: ProviderNativeImageGenerationRequest["referenceImages"];
}): Promise<ProviderNativeImageGenerationResult> {
  const { endpoint, apiKey, prompt, aspectRatio, referenceImages } = params;

  if (endpoint.api_style === "comfyui") {
    const files = await generateWithComfyUi(endpoint, apiKey, {
      mode: "image",
      prompt,
      aspectRatio,
      referenceImages,
    });
    const firstFile = files[0];
    const imageBuffer = await downloadComfyUiAsset(endpoint, apiKey, firstFile);
    return {
      imageData: imageBuffer.toString("base64"),
      mimeType: "image/png",
    };
  }

  const response = await fetchUserRemoteUrl(`${endpoint.endpoint_url.replace(/\/+$/, "")}/images/generations`, {
    method: "POST",
    headers: buildCustomHeaders(apiKey),
    body: JSON.stringify({
      model: endpoint.model_name,
      prompt,
      size: aspectRatio,
      ...(referenceImages?.length ? { reference_images: referenceImages } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Custom image generation failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ b64_json?: string }>;
  };

  return {
    imageData: payload.data?.[0]?.b64_json ?? null,
    mimeType: "image/png",
  };
}

export async function generateCustomVideoViaEndpoint(params: {
  endpoint: CustomEndpointRow;
  apiKey: string;
  prompt: string;
  aspectRatio?: string;
  durationSeconds?: number;
  resolution?: string;
  referenceImages?: ProviderNativeVideoGenerationRequest["referenceImages"];
  generateAudio?: boolean;
}): Promise<ProviderNativeVideoGenerationResult> {
  const { endpoint, apiKey, prompt, aspectRatio, durationSeconds, resolution, referenceImages, generateAudio } = params;

  if (endpoint.api_style === "comfyui") {
    const files = await generateWithComfyUi(endpoint, apiKey, {
      mode: "video",
      prompt,
      aspectRatio,
      durationSeconds,
      resolution,
      referenceImages,
      generateAudio,
    });
    const firstFile = files[0];
    const videoBuffer = await downloadComfyUiAsset(endpoint, apiKey, firstFile);
    return {
      videoData: videoBuffer,
      mimeType: "video/mp4",
    };
  }

  const response = await fetchUserRemoteUrl(`${endpoint.endpoint_url.replace(/\/+$/, "")}/videos/generations`, {
    method: "POST",
    headers: buildCustomHeaders(apiKey),
    body: JSON.stringify({
      model: endpoint.model_name,
      prompt,
      aspect_ratio: aspectRatio,
      duration: durationSeconds,
      resolution,
      ...(referenceImages?.length ? { reference_images: referenceImages } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Custom video generation failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ b64_json?: string }>;
  };
  const base64Data = payload.data?.[0]?.b64_json ?? null;

  return {
    videoData: base64Data ? Buffer.from(base64Data, "base64") : null,
    mimeType: "video/mp4",
  };
}
