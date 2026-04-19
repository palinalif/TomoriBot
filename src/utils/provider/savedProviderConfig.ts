import type {
  SavedProviderConfigRow,
  SavedProviderConfigUpsert,
  TomoriConfigRow,
  TomoriState,
} from "@/types/db/schema";
import {
  loadDefaultDiffusionModelForProvider,
  loadDefaultEmbeddingModelForProvider,
  loadDefaultModelForProvider,
  loadDefaultVideoGenerationModelForProvider,
  loadDefaultVisionModelForProvider,
  loadSavedProviderConfigs,
} from "@/utils/db/dbRead";
import { isCustomProvider } from "@/utils/discord/customProviderModal";
import {
  getStaticProviderInfo,
  supportsEmbeddingCapability,
  supportsImageCapability,
  supportsVideoCapability,
  supportsVisionCapability,
} from "@/utils/provider/providerInfoRegistry";

export type SavedProviderCapability = "text" | "embedding" | "image" | "video" | "vision";

export interface ProviderDefaultSelectionIds {
  llm_id: number | null;
  diffusion_model_id: number | null;
  embedding_model_id: number | null;
  nai_diffusion_model_id: number | null;
  video_model_id: number | null;
  vision_llm_id: number | null;
}

export function buildSavedProviderSnapshotFromTomoriState(tomoriState: TomoriState): SavedProviderConfigUpsert {
  return {
    server_id: tomoriState.server_id,
    provider: tomoriState.llm.llm_provider.toLowerCase(),
    api_key: tomoriState.config.api_key,
    key_version: tomoriState.config.key_version ?? 1,
    llm_id: tomoriState.config.llm_id,
    diffusion_model_id: tomoriState.config.diffusion_model_id ?? null,
    embedding_model_id: tomoriState.config.embedding_model_id ?? null,
    nai_diffusion_model_id: tomoriState.config.nai_diffusion_model_id ?? null,
    video_model_id: tomoriState.config.video_model_id ?? null,
    vision_llm_id: tomoriState.config.vision_llm_id ?? null,
    nai_preset_name: tomoriState.config.nai_preset_name ?? null,
    llm_temperature: tomoriState.config.llm_temperature,
    llm_top_p: tomoriState.config.llm_top_p,
    llm_top_k: tomoriState.config.llm_top_k,
    llm_frequency_penalty: tomoriState.config.llm_frequency_penalty,
    llm_presence_penalty: tomoriState.config.llm_presence_penalty,
    llm_min_p: tomoriState.config.llm_min_p,
    llm_disabled_params: tomoriState.config.llm_disabled_params ?? [],
    llm_logit_biases: tomoriState.config.llm_logit_biases ?? [],
    custom_endpoint_url: tomoriState.config.custom_endpoint_url ?? null,
    custom_model_name: tomoriState.config.custom_model_name ?? null,
    custom_num_ctx: tomoriState.config.custom_num_ctx ?? null,
    thinking_level: tomoriState.config.thinking_level,
    fallback_llm_ids: tomoriState.config.fallback_llm_ids ?? [],
    channel_llm_overrides: [],
    persona_llm_overrides: [],
  };
}

export async function loadProviderDefaultSelectionIds(provider: string): Promise<ProviderDefaultSelectionIds> {
  const normalizedProvider = provider.toLowerCase();

  if (isCustomProvider(normalizedProvider)) {
    return {
      llm_id: null,
      diffusion_model_id: null,
      embedding_model_id: null,
      nai_diffusion_model_id: null,
      video_model_id: null,
      vision_llm_id: null,
    };
  }

  const [defaultTextModel, defaultEmbeddingModel, defaultDiffusionModel, defaultVideoModel, defaultVisionModel] =
    await Promise.all([
      loadDefaultModelForProvider(normalizedProvider),
      loadDefaultEmbeddingModelForProvider(normalizedProvider),
      loadDefaultDiffusionModelForProvider(normalizedProvider),
      loadDefaultVideoGenerationModelForProvider(normalizedProvider),
      loadDefaultVisionModelForProvider(normalizedProvider),
    ]);

  const imageGenerationStyle = getStaticProviderInfo(normalizedProvider)?.featureSupport.imageGeneration ?? "none";

  return {
    llm_id: defaultTextModel?.llm_id ?? null,
    diffusion_model_id:
      imageGenerationStyle === "chat-completion" ? (defaultDiffusionModel?.diffusion_model_id ?? null) : null,
    embedding_model_id: defaultEmbeddingModel?.embedding_model_id ?? null,
    nai_diffusion_model_id:
      imageGenerationStyle === "nai-pipeline" ? (defaultDiffusionModel?.diffusion_model_id ?? null) : null,
    video_model_id: defaultVideoModel?.video_model_id ?? null,
    vision_llm_id: defaultVisionModel?.llm_id ?? null,
  };
}

export async function buildSavedProviderConfigFromExistingOrDefaults(params: {
  serverId: number;
  provider: string;
  apiKey: Buffer | null;
  keyVersion: number;
  baseConfig: TomoriConfigRow;
  existingConfig?: SavedProviderConfigRow | null;
  llmId?: number | null;
  customEndpointUrl?: string | null;
  customModelName?: string | null;
  customNumCtx?: number | null;
}): Promise<SavedProviderConfigUpsert> {
  const normalizedProvider = params.provider.toLowerCase();
  const existingConfig = params.existingConfig ?? null;
  const defaults = existingConfig ? null : await loadProviderDefaultSelectionIds(normalizedProvider);

  return {
    server_id: params.serverId,
    provider: normalizedProvider,
    api_key: params.apiKey,
    key_version: params.keyVersion,
    llm_id: params.llmId ?? existingConfig?.llm_id ?? defaults?.llm_id ?? null,
    diffusion_model_id: existingConfig?.diffusion_model_id ?? defaults?.diffusion_model_id ?? null,
    embedding_model_id: existingConfig?.embedding_model_id ?? defaults?.embedding_model_id ?? null,
    nai_diffusion_model_id: existingConfig?.nai_diffusion_model_id ?? defaults?.nai_diffusion_model_id ?? null,
    video_model_id: existingConfig?.video_model_id ?? defaults?.video_model_id ?? null,
    vision_llm_id: existingConfig?.vision_llm_id ?? defaults?.vision_llm_id ?? null,
    nai_preset_name: existingConfig?.nai_preset_name ?? null,
    llm_temperature: existingConfig?.llm_temperature ?? params.baseConfig.llm_temperature,
    llm_top_p: existingConfig?.llm_top_p ?? params.baseConfig.llm_top_p,
    llm_top_k: existingConfig?.llm_top_k ?? params.baseConfig.llm_top_k,
    llm_frequency_penalty: existingConfig?.llm_frequency_penalty ?? params.baseConfig.llm_frequency_penalty,
    llm_presence_penalty: existingConfig?.llm_presence_penalty ?? params.baseConfig.llm_presence_penalty,
    llm_min_p: existingConfig?.llm_min_p ?? params.baseConfig.llm_min_p,
    llm_disabled_params: existingConfig?.llm_disabled_params ?? params.baseConfig.llm_disabled_params ?? [],
    llm_logit_biases: existingConfig?.llm_logit_biases ?? params.baseConfig.llm_logit_biases ?? [],
    custom_endpoint_url: params.customEndpointUrl ?? existingConfig?.custom_endpoint_url ?? null,
    custom_model_name: params.customModelName ?? existingConfig?.custom_model_name ?? null,
    custom_num_ctx: params.customNumCtx ?? existingConfig?.custom_num_ctx ?? null,
    thinking_level: existingConfig?.thinking_level ?? params.baseConfig.thinking_level,
    fallback_llm_ids: existingConfig?.fallback_llm_ids ?? [],
    channel_llm_overrides: existingConfig?.channel_llm_overrides ?? [],
    persona_llm_overrides: existingConfig?.persona_llm_overrides ?? [],
  };
}

export async function loadSavedProvidersForCapability(
  serverId: number,
  capability: SavedProviderCapability,
): Promise<SavedProviderConfigRow[]> {
  const savedConfigs = await loadSavedProviderConfigs(serverId);

  return savedConfigs.filter((config) => {
    switch (capability) {
      case "text":
        return true;
      case "embedding":
        return supportsEmbeddingCapability(config.provider);
      case "image":
        return supportsImageCapability(config.provider);
      case "video":
        return supportsVideoCapability(config.provider);
      case "vision":
        return supportsVisionCapability(config.provider);
      default:
        return false;
    }
  });
}
