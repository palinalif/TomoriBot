import type { CustomEndpointRow } from "@/types/db/schema";
import type {
  ProviderNativeImageGenerationRequest,
  ProviderNativeImageGenerationResult,
  ProviderNativeVideoGenerationRequest,
  ProviderNativeVideoGenerationResult,
} from "@/types/provider/featureInterfaces";
import { buildCustomHeaders } from "@/providers/custom/customOpenAICompatibleUtils";
import { fetchUserRemoteUrl } from "@/utils/security/userRemoteFetch";

function getComfyUiTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.COMFYUI_POLL_TIMEOUT_MS ?? "300000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300000;
}

async function generateWithComfyUi(
  endpoint: CustomEndpointRow,
  prompt: string,
): Promise<{ filename: string; subfolder?: string; type?: string }[]> {
  const workflow = endpoint.extra_config.workflow;
  if (!workflow || typeof workflow !== "object") {
    throw new Error("ComfyUI workflow JSON is missing.");
  }

  const promptResponse = await fetchUserRemoteUrl(`${endpoint.endpoint_url.replace(/\/+$/, "")}/prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: workflow,
      client_id: `tomoribot-${Date.now()}`,
      extra_data: {
        extra_pnginfo: {
          tomori_prompt: prompt,
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

  const response = await fetchUserRemoteUrl(url.toString());
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
    const files = await generateWithComfyUi(endpoint, prompt);
    const firstFile = files[0];
    const imageBuffer = await downloadComfyUiAsset(endpoint, firstFile);
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
}): Promise<ProviderNativeVideoGenerationResult> {
  const { endpoint, apiKey, prompt, aspectRatio, durationSeconds, resolution, referenceImages } = params;

  if (endpoint.api_style === "comfyui") {
    const files = await generateWithComfyUi(endpoint, prompt);
    const firstFile = files[0];
    const videoBuffer = await downloadComfyUiAsset(endpoint, firstFile);
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
