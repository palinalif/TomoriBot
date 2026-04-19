import type { SavedProviderConfigRow, TomoriConfigRow } from "@/types/db/schema";
import { tomoriConfigSchema } from "@/types/db/schema";
import { sql } from "@/utils/db/client";
import { loadSavedProviderConfig } from "@/utils/db/dbRead";
import { log } from "@/utils/misc/logger";
import { decryptApiKey } from "@/utils/security/crypto";
import { CUSTOM_ENDPOINT_PLACEHOLDER_KEY } from "@/utils/discord/customProviderModal";

export type Capability = "text" | "embedding" | "image-standard" | "image-nai" | "video" | "vision";

export interface ResolvedCredentials {
  provider: string;
  apiKey: string;
  keyVersion: number;
  savedConfig: SavedProviderConfigRow;
}

type ConfigCapabilityColumns = Pick<
  TomoriConfigRow,
  "llm_id" | "embedding_model_id" | "diffusion_model_id" | "nai_diffusion_model_id" | "video_model_id" | "vision_llm_id"
>;

export class CredentialUnavailableError extends Error {
  constructor(
    public provider: string,
    public capability: Capability,
    public reason: "no_saved_config" | "decryption_failed" | "placeholder_key" | "missing_model_id",
  ) {
    super(`No usable credentials for ${provider} (${capability}): ${reason}`);
    this.name = "CredentialUnavailableError";
  }
}

async function loadCapabilityConfig(serverId: number): Promise<ConfigCapabilityColumns | null> {
  const [row] = await sql`
		SELECT
			llm_id,
			embedding_model_id,
			diffusion_model_id,
			nai_diffusion_model_id,
			video_model_id,
			vision_llm_id
		FROM tomori_configs
		WHERE server_id = ${serverId}
		LIMIT 1
	`;

  if (!row) {
    return null;
  }

  const parsed = tomoriConfigSchema
    .pick({
      llm_id: true,
      embedding_model_id: true,
      diffusion_model_id: true,
      nai_diffusion_model_id: true,
      video_model_id: true,
      vision_llm_id: true,
    })
    .safeParse(row);

  if (!parsed.success) {
    log.warn(`Failed to validate capability config for server ${serverId}: ${parsed.error.message}`);
    return null;
  }

  return parsed.data;
}

async function resolveProviderForCapability(serverId: number, capability: Capability): Promise<string> {
  const config = await loadCapabilityConfig(serverId);
  if (!config) {
    throw new CredentialUnavailableError("unknown", capability, "missing_model_id");
  }

  switch (capability) {
    case "text": {
      if (!config.llm_id) {
        throw new CredentialUnavailableError("unknown", capability, "missing_model_id");
      }
      const [row] = await sql`
				SELECT llm_provider
				FROM llms
				WHERE llm_id = ${config.llm_id}
				LIMIT 1
			`;
      if (!row?.llm_provider) {
        throw new CredentialUnavailableError("unknown", capability, "missing_model_id");
      }
      return String(row.llm_provider).toLowerCase();
    }
    case "embedding": {
      if (!config.embedding_model_id) {
        throw new CredentialUnavailableError("unknown", capability, "missing_model_id");
      }
      const [row] = await sql`
				SELECT provider
				FROM embedding_models
				WHERE embedding_model_id = ${config.embedding_model_id}
				LIMIT 1
			`;
      if (!row?.provider) {
        throw new CredentialUnavailableError("unknown", capability, "missing_model_id");
      }
      return String(row.provider).toLowerCase();
    }
    case "image-standard": {
      if (!config.diffusion_model_id) {
        throw new CredentialUnavailableError("unknown", capability, "missing_model_id");
      }
      const [row] = await sql`
				SELECT provider
				FROM image_diffusion_models
				WHERE diffusion_model_id = ${config.diffusion_model_id}
				LIMIT 1
			`;
      if (!row?.provider) {
        throw new CredentialUnavailableError("unknown", capability, "missing_model_id");
      }
      return String(row.provider).toLowerCase();
    }
    case "image-nai": {
      if (!config.nai_diffusion_model_id) {
        throw new CredentialUnavailableError("unknown", capability, "missing_model_id");
      }
      const [row] = await sql`
				SELECT provider
				FROM image_diffusion_models
				WHERE diffusion_model_id = ${config.nai_diffusion_model_id}
				LIMIT 1
			`;
      if (!row?.provider) {
        throw new CredentialUnavailableError("unknown", capability, "missing_model_id");
      }
      return String(row.provider).toLowerCase();
    }
    case "video": {
      if (!config.video_model_id) {
        throw new CredentialUnavailableError("unknown", capability, "missing_model_id");
      }
      const [row] = await sql`
				SELECT provider
				FROM video_generation_models
				WHERE video_model_id = ${config.video_model_id}
				LIMIT 1
			`;
      if (!row?.provider) {
        throw new CredentialUnavailableError("unknown", capability, "missing_model_id");
      }
      return String(row.provider).toLowerCase();
    }
    case "vision": {
      if (!config.vision_llm_id) {
        throw new CredentialUnavailableError("unknown", capability, "missing_model_id");
      }
      const [row] = await sql`
				SELECT llm_provider
				FROM llms
				WHERE llm_id = ${config.vision_llm_id}
				LIMIT 1
			`;
      if (!row?.llm_provider) {
        throw new CredentialUnavailableError("unknown", capability, "missing_model_id");
      }
      return String(row.llm_provider).toLowerCase();
    }
    default: {
      throw new CredentialUnavailableError("unknown", capability, "missing_model_id");
    }
  }
}

export async function resolveCapabilityCredentials(
  serverId: number,
  capability: Capability,
): Promise<ResolvedCredentials> {
  const provider = await resolveProviderForCapability(serverId, capability);
  const savedConfig = await loadSavedProviderConfig(serverId, provider);

  if (!savedConfig?.api_key) {
    throw new CredentialUnavailableError(provider, capability, "no_saved_config");
  }

  let decryptedKey: string;
  try {
    decryptedKey = await decryptApiKey(savedConfig.api_key, savedConfig.key_version || 1);
  } catch (error) {
    log.warn(`Failed to decrypt credentials for provider ${provider} (${capability}) on server ${serverId}`, error);
    throw new CredentialUnavailableError(provider, capability, "decryption_failed");
  }

  if (!decryptedKey || decryptedKey === CUSTOM_ENDPOINT_PLACEHOLDER_KEY) {
    throw new CredentialUnavailableError(provider, capability, "placeholder_key");
  }

  return {
    provider,
    apiKey: decryptedKey,
    keyVersion: savedConfig.key_version || 1,
    savedConfig,
  };
}
