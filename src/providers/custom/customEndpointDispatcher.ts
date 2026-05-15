import type { CustomEndpointRow } from "@/types/db/schema";
import type {
  ProviderNativeImageGenerationRequest,
  ProviderNativeImageGenerationResult,
  ProviderNativeVideoGenerationRequest,
  ProviderNativeVideoGenerationResult,
} from "@/types/provider/featureInterfaces";
import { buildCustomHeaders } from "@/providers/custom/customOpenAICompatibleUtils";
import { log } from "@/utils/misc/logger";
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
  referenceImageDataUrl?: string | null;
  inpaint?: boolean;
  maskPrompt?: string | null;
  maskThreshold?: number | null;
  maskGrow?: number | null;
  maskFeather?: number | null;
  cfg?: number | null;
  denoise?: number | null;
  referenceDenoise?: number | null;
  seed?: number | null;
}

type WorkflowPlaceholderValue = string | number | boolean | null | Record<string, unknown> | Array<unknown>;
type ComfyUiWorkflow = Record<string, unknown>;
type ComfyUiAsset = { filename: string; subfolder?: string; type?: string };
type ComfyUiWorkflowSupports = {
  txt2img: boolean;
  img2img: boolean;
  inpaint: boolean;
};

const DEFAULT_COMFYUI_WORKFLOW_SUPPORTS: ComfyUiWorkflowSupports = {
  txt2img: true,
  img2img: true,
  inpaint: false,
};

type ComfyUiInpaintSettings = {
  maskThreshold: number;
  maskGrow: number;
  maskFeather: number;
  cfg: number;
  referenceDenoise: number;
};

const COMFYUI_IMAGE_TARGET_AREA = (() => {
  const parsed = Number.parseInt(process.env.COMFYUI_IMAGE_TARGET_AREA || "1048576", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1024 * 1024;
})();
const COMFYUI_DIMENSION_MULTIPLE = 64;
const DEFAULT_COMFYUI_REFERENCE_DENOISE = 0.4;
const DEFAULT_COMFYUI_INPAINT_SETTINGS: ComfyUiInpaintSettings = {
  maskThreshold: 0.45,
  maskGrow: 8,
  maskFeather: 8,
  cfg: 8,
  referenceDenoise: DEFAULT_COMFYUI_REFERENCE_DENOISE,
};
const COMFYUI_INPAINT_MASK_FILENAME_PREFIX = "tomoribot_inpaint_mask";
const COMFYUI_INPAINT_RESULT_DEBUG_FILENAME_PREFIX = "tomoribot_inpaint_result_debug";

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readOptionalNumberEnv(name: string): number | null {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue.trim() === "") {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveComfyUiInpaintSettings(options: ComfyUiGenerationOptions): ComfyUiInpaintSettings {
  return {
    maskThreshold: clampNumber(
      options.maskThreshold ??
        readOptionalNumberEnv("COMFYUI_INPAINT_MASK_THRESHOLD") ??
        readOptionalNumberEnv("ANIMA3_INPAINT_MASK_THRESHOLD") ??
        DEFAULT_COMFYUI_INPAINT_SETTINGS.maskThreshold,
      0,
      10,
    ),
    maskGrow: clampNumber(
      options.maskGrow ??
        readOptionalNumberEnv("COMFYUI_INPAINT_MASK_GROW") ??
        readOptionalNumberEnv("ANIMA3_INPAINT_MASK_GROW") ??
        DEFAULT_COMFYUI_INPAINT_SETTINGS.maskGrow,
      0,
      128,
    ),
    maskFeather: clampNumber(
      options.maskFeather ??
        readOptionalNumberEnv("COMFYUI_INPAINT_MASK_FEATHER") ??
        readOptionalNumberEnv("ANIMA3_INPAINT_MASK_FEATHER") ??
        DEFAULT_COMFYUI_INPAINT_SETTINGS.maskFeather,
      0,
      100,
    ),
    cfg: clampNumber(
      options.cfg ??
        readOptionalNumberEnv("COMFYUI_INPAINT_CFG") ??
        readOptionalNumberEnv("ANIMA3_INPAINT_CFG") ??
        DEFAULT_COMFYUI_INPAINT_SETTINGS.cfg,
      0,
      30,
    ),
    referenceDenoise: clampNumber(
      options.referenceDenoise ??
        options.denoise ??
        readOptionalNumberEnv("COMFYUI_INPAINT_DENOISE") ??
        readOptionalNumberEnv("ANIMA3_INPAINT_DENOISE") ??
        DEFAULT_COMFYUI_INPAINT_SETTINGS.referenceDenoise,
      0,
      1,
    ),
  };
}

function resolveComfyUiDenoise(options: ComfyUiGenerationOptions): number {
  if (!buildReferenceImageDataUrl(options)) {
    return 1;
  }

  const rawDenoise = options.denoise ?? options.referenceDenoise ?? null;
  if (rawDenoise !== null) {
    return Number.isFinite(rawDenoise) ? clampNumber(rawDenoise, 0, 1) : DEFAULT_COMFYUI_REFERENCE_DENOISE;
  }

  if (options.inpaint === true) {
    return resolveComfyUiInpaintSettings(options).referenceDenoise;
  }

  const envDenoise = readOptionalNumberEnv("COMFYUI_REFERENCE_DENOISE");
  if (envDenoise !== null) {
    return clampNumber(envDenoise, 0, 1);
  }

  return DEFAULT_COMFYUI_REFERENCE_DENOISE;
}

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

function isComfyUiInpaintMaskAsset(asset: ComfyUiAsset): boolean {
  return asset.filename.toLowerCase().startsWith(COMFYUI_INPAINT_MASK_FILENAME_PREFIX);
}

function isComfyUiInpaintResultDebugAsset(asset: ComfyUiAsset): boolean {
  return asset.filename.toLowerCase().startsWith(COMFYUI_INPAINT_RESULT_DEBUG_FILENAME_PREFIX);
}

function isComfyUiDiagnosticAsset(asset: ComfyUiAsset): boolean {
  return isComfyUiInpaintMaskAsset(asset) || isComfyUiInpaintResultDebugAsset(asset);
}

function describeComfyUiAssets(files: ComfyUiAsset[]): string {
  return files
    .slice(0, 10)
    .map((file) => [file.subfolder, file.filename].filter(Boolean).join("/"))
    .join(", ");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepCloneWorkflow(workflow: Record<string, unknown>): ComfyUiWorkflow {
  return structuredClone(workflow) as ComfyUiWorkflow;
}

function hasComfyUiVisualWorkflowShape(workflow: ComfyUiWorkflow): boolean {
  return Array.isArray(workflow.nodes) || Array.isArray(workflow.links) || Array.isArray(workflow.groups);
}

function buildReferenceImageDataUrl(options: ComfyUiGenerationOptions): string | null {
  if (options.referenceImageDataUrl) {
    return options.referenceImageDataUrl;
  }

  const firstReferenceImage = options.referenceImages?.[0];
  if (!firstReferenceImage) {
    return null;
  }

  return `data:${firstReferenceImage.mimeType};base64,${firstReferenceImage.data}`;
}

function readComfyUiWorkflowSupports(endpoint: CustomEndpointRow): ComfyUiWorkflowSupports {
  const rawSupports = endpoint.extra_config.workflow_supports;
  if (!isRecord(rawSupports)) {
    return DEFAULT_COMFYUI_WORKFLOW_SUPPORTS;
  }

  return {
    txt2img: typeof rawSupports.txt2img === "boolean" ? rawSupports.txt2img : DEFAULT_COMFYUI_WORKFLOW_SUPPORTS.txt2img,
    img2img: typeof rawSupports.img2img === "boolean" ? rawSupports.img2img : DEFAULT_COMFYUI_WORKFLOW_SUPPORTS.img2img,
    inpaint: typeof rawSupports.inpaint === "boolean" ? rawSupports.inpaint : DEFAULT_COMFYUI_WORKFLOW_SUPPORTS.inpaint,
  };
}

function assertComfyUiWorkflowSupportsRequest(
  options: ComfyUiGenerationOptions,
  supports: ComfyUiWorkflowSupports,
): void {
  const hasReference = !!buildReferenceImageDataUrl(options);
  if (options.inpaint === true && !hasReference) {
    throw new Error("Inpaint requires a reference image.");
  }
  if (options.inpaint === true && !options.maskPrompt?.trim()) {
    throw new Error("Inpaint requires a mask_prompt describing the region to edit.");
  }
  if (options.inpaint === true && !supports.inpaint) {
    throw new Error("This ComfyUI workflow is not configured to support inpaint requests.");
  }
  if (hasReference && options.inpaint !== true && !supports.img2img) {
    throw new Error("This ComfyUI workflow is not configured to support reference-image requests.");
  }
  if (!hasReference && !supports.txt2img) {
    throw new Error("This ComfyUI workflow is not configured to support text-to-image requests.");
  }
}

function applyComfyUiImageInputDefaults(workflow: ComfyUiWorkflow, options: ComfyUiGenerationOptions): number {
  const inpaintSettings = resolveComfyUiInpaintSettings(options);
  const referenceDenoise = resolveComfyUiDenoise(options);
  let defaultsApplied = 0;

  for (const node of Object.values(workflow)) {
    if (!isRecord(node) || !isRecord(node.inputs)) {
      continue;
    }

    const classType = typeof node.class_type === "string" ? node.class_type.toLowerCase() : "";
    const inputs = node.inputs;

    if (classType.includes("clipseg") && inputs.threshold == null) {
      inputs.threshold = inpaintSettings.maskThreshold;
      defaultsApplied += 1;
    }

    if (classType.includes("growmask")) {
      if (inputs.expand == null) {
        inputs.expand = inpaintSettings.maskGrow;
        defaultsApplied += 1;
      }
      if (inputs.blur_radius == null) {
        inputs.blur_radius = inpaintSettings.maskFeather;
        defaultsApplied += 1;
      }
    }

    const looksLikeSampler = classType.includes("ksampler") || ("sampler_name" in inputs && "latent_image" in inputs);
    if (looksLikeSampler && inputs.denoise == null) {
      inputs.denoise = referenceDenoise;
      defaultsApplied += 1;
    }
    if (looksLikeSampler && inputs.cfg == null && options.inpaint === true) {
      inputs.cfg = inpaintSettings.cfg;
      defaultsApplied += 1;
    }
  }

  return defaultsApplied;
}

function buildComfyUiPlaceholderMap(
  endpoint: CustomEndpointRow,
  options: ComfyUiGenerationOptions,
  dimensions: { width: number; height: number },
  referencePayload: Array<Record<string, unknown>>,
): Record<string, WorkflowPlaceholderValue> {
  const referenceImageDataUrl = buildReferenceImageDataUrl(options);
  const hasReference = !!referenceImageDataUrl;
  const inpaint = hasReference && options.inpaint === true;
  const maskPrompt = options.maskPrompt?.trim() || options.prompt;
  const seed = options.seed ?? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  const inpaintSettings = resolveComfyUiInpaintSettings(options);
  const denoise = resolveComfyUiDenoise(options);
  const firstReferenceImage = referencePayload[0];
  const placeholderMap: Record<string, WorkflowPlaceholderValue> = {
    TOMORI_PROMPT: options.prompt,
    TOMORI_MODEL: endpoint.model_name ?? endpoint.display_name,
    TOMORI_MODEL_NAME: endpoint.model_name ?? endpoint.display_name,
    TOMORI_MODE: options.mode,
    TOMORI_IMAGE_MODE: inpaint ? "inpaint" : hasReference ? "img2img" : "txt2img",
    TOMORI_ASPECT_RATIO: options.aspectRatio ?? (options.mode === "video" ? "16:9" : "1:1"),
    TOMORI_WIDTH: dimensions.width,
    TOMORI_HEIGHT: dimensions.height,
    TOMORI_SIZE: `${dimensions.width}x${dimensions.height}`,
    TOMORI_SEED: seed,
    TOMORI_HAS_REFERENCE_IMAGE: hasReference,
    TOMORI_REFERENCE_IMAGE_DATA_URL: referenceImageDataUrl ?? "",
    TOMORI_REFERENCE_IMAGE_BASE64:
      firstReferenceImage && typeof firstReferenceImage.data === "string" ? firstReferenceImage.data : "",
    TOMORI_REFERENCE_IMAGE_MIME_TYPE:
      firstReferenceImage && typeof firstReferenceImage.mimeType === "string" ? firstReferenceImage.mimeType : "",
    TOMORI_INPAINT: inpaint,
    TOMORI_MASK_PROMPT: maskPrompt,
    TOMORI_INPAINT_MASK_THRESHOLD: inpaintSettings.maskThreshold,
    TOMORI_INPAINT_MASK_GROW: inpaintSettings.maskGrow,
    TOMORI_INPAINT_MASK_FEATHER: inpaintSettings.maskFeather,
    TOMORI_CFG: inpaint ? inpaintSettings.cfg : 0,
    TOMORI_INPAINT_CFG: inpaintSettings.cfg,
    TOMORI_DENOISE: denoise,
    TOMORI_IMG2IMG_DENOISE: denoise,
    TOMORI_INPAINT_DENOISE: denoise,
    TOMORI_INPAINT_MASK_FILENAME_PREFIX: COMFYUI_INPAINT_MASK_FILENAME_PREFIX,
    TOMORI_INPAINT_RESULT_DEBUG_FILENAME_PREFIX: COMFYUI_INPAINT_RESULT_DEBUG_FILENAME_PREFIX,
    TOMORI_REFERENCE_IMAGE_COUNT: referencePayload.length,
    TOMORI_REFERENCE_IMAGES: referencePayload,
    TOMORI_REFERENCE_IMAGES_JSON: JSON.stringify(referencePayload),
    TOMORI_VIDEO_DURATION: options.durationSeconds ?? 0,
    TOMORI_DURATION_SECONDS: options.durationSeconds ?? 0,
    TOMORI_VIDEO_RESOLUTION: options.resolution ?? "",
    TOMORI_RESOLUTION: options.resolution ?? "",
    TOMORI_GENERATE_AUDIO: options.generateAudio ?? false,
  };

  placeholderMap.TOMORI_REFERENCE_IMAGE_1_DATA_URL = placeholderMap.TOMORI_REFERENCE_IMAGE_DATA_URL;
  placeholderMap.TOMORI_REFERENCE_IMAGE_1_BASE64 = placeholderMap.TOMORI_REFERENCE_IMAGE_BASE64;
  placeholderMap.TOMORI_REFERENCE_IMAGE_1_MIME_TYPE = placeholderMap.TOMORI_REFERENCE_IMAGE_MIME_TYPE;

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
): Promise<ComfyUiAsset[]> {
  const savedWorkflow = endpoint.extra_config.workflow;
  if (!savedWorkflow || typeof savedWorkflow !== "object") {
    throw new Error("ComfyUI workflow JSON is missing.");
  }

  const seed = options.seed ?? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  const generationOptions = { ...options, seed };
  const dimensions = buildComfyUiDimensions(generationOptions);
  const referencePayload = buildComfyUiReferencePayload(generationOptions.referenceImages ?? []);
  const placeholders = buildComfyUiPlaceholderMap(endpoint, generationOptions, dimensions, referencePayload);
  const workflowSupports = readComfyUiWorkflowSupports(endpoint);
  const workflow = deepCloneWorkflow(savedWorkflow as Record<string, unknown>);
  if (hasComfyUiVisualWorkflowShape(workflow)) {
    throw new Error("ComfyUI workflow must be exported in API prompt format, not visual workflow format.");
  }
  if (generationOptions.mode === "image") {
    assertComfyUiWorkflowSupportsRequest(generationOptions, workflowSupports);
  }

  const preparedWorkflow = replaceWorkflowPlaceholders(workflow, placeholders) as ComfyUiWorkflow;
  const defaultsApplied =
    generationOptions.mode === "image" ? applyComfyUiImageInputDefaults(preparedWorkflow, generationOptions) : 0;
  if (generationOptions.mode === "image") {
    const referenceImageDataUrl = buildReferenceImageDataUrl(generationOptions);
    const hasReference = !!referenceImageDataUrl;
    const inpaint = hasReference && generationOptions.inpaint === true;
    const inpaintSettings = resolveComfyUiInpaintSettings(generationOptions);
    const denoise = resolveComfyUiDenoise(generationOptions);
    log.info(
      `Prepared ComfyUI image generation payload ${JSON.stringify({
        hasReference,
        inpaint,
        maskPrompt: generationOptions.maskPrompt?.trim() ?? null,
        seed,
        denoise,
        maskThreshold: inpaintSettings.maskThreshold,
        maskGrow: inpaintSettings.maskGrow,
        maskFeather: inpaintSettings.maskFeather,
        cfg: inpaintSettings.cfg,
        referenceDenoise: denoise,
        defaultsApplied,
      })}`,
    );
  }

  const postHeaders = buildCustomHeaders(apiKey);
  const getHeaders = { ...postHeaders };
  delete getHeaders["Content-Type"];
  const clientId = `tomoribot-${Date.now()}`;

  const promptResponse = await fetchUserRemoteUrl(`${endpoint.endpoint_url.replace(/\/+$/, "")}/prompt`, {
    method: "POST",
    headers: postHeaders,
    body: JSON.stringify({
      prompt: preparedWorkflow,
      client_id: clientId,
    }),
  });

  if (!promptResponse.ok) {
    const errorBody = await promptResponse.text().catch(() => "");
    const errorDetail = errorBody.trim() ? `: ${errorBody.trim().slice(0, 2000)}` : "";
    throw new Error(`ComfyUI prompt failed: ${promptResponse.status} ${promptResponse.statusText}${errorDetail}`);
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

async function downloadComfyUiAsset(endpoint: CustomEndpointRow, apiKey: string, asset: ComfyUiAsset): Promise<Buffer> {
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
  referenceImageDataUrl?: string | null;
  inpaint?: boolean;
  maskPrompt?: string | null;
  maskThreshold?: number | null;
  maskGrow?: number | null;
  maskFeather?: number | null;
  cfg?: number | null;
  denoise?: number | null;
  referenceDenoise?: number | null;
  seed?: number | null;
}): Promise<ProviderNativeImageGenerationResult> {
  const {
    endpoint,
    apiKey,
    prompt,
    aspectRatio,
    referenceImages,
    referenceImageDataUrl,
    inpaint,
    maskPrompt,
    maskThreshold,
    maskGrow,
    maskFeather,
    cfg,
    denoise,
    referenceDenoise,
    seed,
  } = params;

  if (endpoint.api_style === "comfyui") {
    const files = await generateWithComfyUi(endpoint, apiKey, {
      mode: "image",
      prompt,
      aspectRatio,
      referenceImages,
      referenceImageDataUrl,
      inpaint,
      maskPrompt,
      maskThreshold,
      maskGrow,
      maskFeather,
      cfg,
      denoise,
      referenceDenoise,
      seed,
    });
    const diagnosticFiles = files.filter(isComfyUiDiagnosticAsset);
    const imageFiles = files.filter((file) => !isComfyUiDiagnosticAsset(file));
    const firstFile = imageFiles[0];
    if (!firstFile) {
      const outputList = describeComfyUiAssets(files);
      throw new Error(
        `ComfyUI workflow returned only diagnostic image outputs and no final image output.${
          outputList ? ` Returned files: ${outputList}` : ""
        }`,
      );
    }
    const imageBuffer = await downloadComfyUiAsset(endpoint, apiKey, firstFile);
    const diagnosticOptions = {
      mode: "image" as const,
      prompt,
      aspectRatio,
      referenceImages,
      referenceImageDataUrl,
      inpaint,
      maskPrompt,
      maskThreshold,
      maskGrow,
      maskFeather,
      cfg,
      denoise,
      referenceDenoise,
      seed,
    };
    const diagnosticInpaintSettings = resolveComfyUiInpaintSettings(diagnosticOptions);
    const diagnosticReferenceDenoise = resolveComfyUiDenoise(diagnosticOptions);
    const diagnosticMaskPrompt = maskPrompt?.trim() || prompt;
    const diagnosticDetails = [
      `mask_prompt=${JSON.stringify(diagnosticMaskPrompt)}`,
      `threshold=${diagnosticInpaintSettings.maskThreshold}`,
      `grow=${diagnosticInpaintSettings.maskGrow}`,
      `feather=${diagnosticInpaintSettings.maskFeather}`,
      `cfg=${diagnosticInpaintSettings.cfg}`,
      `denoise=${diagnosticReferenceDenoise}`,
    ].join(", ");
    const diagnosticImages = await Promise.all(
      diagnosticFiles.map(async (file) => {
        const diagnosticBuffer = await downloadComfyUiAsset(endpoint, apiKey, file);
        const label = isComfyUiInpaintResultDebugAsset(file) ? "Inpaint result debug" : "Inpaint mask";
        return {
          label,
          imageData: diagnosticBuffer.toString("base64"),
          mimeType: "image/png",
          filename: file.filename,
          details: diagnosticDetails,
        };
      }),
    );
    return {
      imageData: imageBuffer.toString("base64"),
      mimeType: "image/png",
      ...(diagnosticImages.length > 0 ? { diagnosticImages } : {}),
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
