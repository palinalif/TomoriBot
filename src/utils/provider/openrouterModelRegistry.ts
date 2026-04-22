import type { LlmRow, SavedProviderConfigUpsert, UserSavedProviderConfigUpsert } from "@/types/db/schema";
import { sql } from "@/utils/db/client";
import {
  loadLlmByProviderAndCodename,
  loadSavedProviderConfig,
  loadScopedOpenRouterModels,
  loadUserSavedProviderConfig,
} from "@/utils/db/dbRead";
import {
  deleteOpenRouterModelRegistration,
  upsertOpenRouterModelRegistration,
  upsertSavedProviderConfig,
  upsertUserSavedProviderConfig,
} from "@/utils/db/dbWrite";
import { getOrFetchOpenRouterCapabilities } from "@/utils/cache/openrouterCapabilityCache";
import { log } from "@/utils/misc/logger";
import { isOpenRouterGeminiModelCodename } from "@/utils/provider/openrouterModelCapabilities";

export type OpenRouterModelRegistryScope =
  | {
      kind: "server";
      ownerId: number;
    }
  | {
      kind: "personal";
      ownerId: number;
    };

export type RegisterOpenRouterModelResult =
  | {
      status: "registered";
      llm: LlmRow;
    }
  | {
      status: "already_registered";
      llm: LlmRow;
    }
  | {
      status: "already_available";
      llm: LlmRow;
    }
  | {
      status: "invalid_model";
    };

export type RemoveOpenRouterModelResult =
  | {
      status: "removed";
      stillReferenced: boolean;
    }
  | {
      status: "not_found";
    }
  | {
      status: "already_available";
    };

function normalizeModelCodename(modelName: string): string {
  return modelName.trim().toLowerCase();
}

async function upsertScopedOpenRouterLlm(modelCodename: string): Promise<LlmRow | null> {
  const capabilities = await getOrFetchOpenRouterCapabilities(modelCodename);
  if (!capabilities) {
    return null;
  }

  const rows = await sql`
		INSERT INTO llms (
			llm_provider,
			llm_codename,
			is_scoped_registration,
			is_smartest,
			is_default,
			is_reasoning,
			is_deprecated,
			is_free,
			has_tools,
			sees_images,
			sees_videos,
			sees_youtube,
			is_uncensored,
			supports_structoutput,
			llm_description,
			ja_description
		) VALUES (
			'openrouter',
			${modelCodename},
			true,
			false,
			false,
			false,
			false,
			false,
			${capabilities.hasTools},
			${capabilities.seesImages},
			${capabilities.seesVideos},
			${isOpenRouterGeminiModelCodename(modelCodename)},
			false,
			${capabilities.supportsStructuredOutput},
			${modelCodename},
			${modelCodename}
		)
		ON CONFLICT (llm_provider, llm_codename) DO UPDATE SET
			is_scoped_registration = true,
			is_deprecated = false,
			has_tools = EXCLUDED.has_tools,
			sees_images = EXCLUDED.sees_images,
			sees_videos = EXCLUDED.sees_videos,
			sees_youtube = EXCLUDED.sees_youtube,
			supports_structoutput = EXCLUDED.supports_structoutput,
			llm_description = EXCLUDED.llm_description,
			ja_description = EXCLUDED.ja_description,
			updated_at = CURRENT_TIMESTAMP
		RETURNING llm_id
	`;

  const llmId = Number(rows[0]?.llm_id);
  return Number.isInteger(llmId) ? await loadLlmByProviderAndCodename("openrouter", modelCodename) : null;
}

async function pruneServerFallbacks(serverId: number, llmId: number): Promise<void> {
  const llmIdJson = JSON.stringify(llmId);

  await sql`
		UPDATE tomori_configs
		SET fallback_llm_ids = COALESCE((
		      SELECT jsonb_agg(entry.value ORDER BY entry.ordinality)
		      FROM jsonb_array_elements(
		        CASE
		          WHEN jsonb_typeof(COALESCE(tomori_configs.fallback_llm_ids, '[]'::JSONB)) = 'array'
		            THEN COALESCE(tomori_configs.fallback_llm_ids, '[]'::JSONB)
		          ELSE '[]'::JSONB
		        END
		      ) WITH ORDINALITY AS entry(value, ordinality)
		      WHERE entry.value <> ${llmIdJson}::jsonb
		    ), '[]'::JSONB),
		    fallback_model_refs = COALESCE((
		      SELECT jsonb_agg(entry.value ORDER BY entry.ordinality)
		      FROM jsonb_array_elements(
		        CASE
		          WHEN jsonb_typeof(COALESCE(tomori_configs.fallback_model_refs, '[]'::JSONB)) = 'array'
		            THEN COALESCE(tomori_configs.fallback_model_refs, '[]'::JSONB)
		          ELSE '[]'::JSONB
		        END
		      ) WITH ORDINALITY AS entry(value, ordinality)
		      WHERE NOT (
		        entry.value ->> 'type' = 'llm'
		        AND entry.value ->> 'id' = ${String(llmId)}
		      )
		    ), '[]'::JSONB)
		WHERE server_id = ${serverId}
	`;

  const savedConfig = await loadSavedProviderConfig(serverId, "openrouter");
  if (!savedConfig) {
    return;
  }

  const nextConfig: SavedProviderConfigUpsert = {
    ...savedConfig,
    fallback_llm_ids: savedConfig.fallback_llm_ids.filter((id) => id !== llmId),
    fallback_model_refs: savedConfig.fallback_model_refs.filter((ref) => !(ref.type === "llm" && ref.id === llmId)),
  };
  await upsertSavedProviderConfig(serverId, nextConfig);
}

async function prunePersonalFallbacks(userId: number, llmId: number): Promise<void> {
  const savedConfig = await loadUserSavedProviderConfig(userId, "openrouter");
  if (!savedConfig) {
    return;
  }

  const nextConfig: UserSavedProviderConfigUpsert = {
    ...savedConfig,
    fallback_llm_ids: savedConfig.fallback_llm_ids.filter((id) => id !== llmId),
    fallback_model_refs: savedConfig.fallback_model_refs.filter((ref) => !(ref.type === "llm" && ref.id === llmId)),
  };
  await upsertUserSavedProviderConfig(userId, nextConfig);
}

async function isLlmStillReferenced(llmId: number): Promise<boolean> {
  const [row] = await sql<Array<{ in_use: boolean }>>`
		SELECT EXISTS (
		  SELECT 1
		  FROM tomori_configs
		  WHERE llm_id = ${llmId}
		     OR vision_llm_id = ${llmId}
		     OR COALESCE(fallback_llm_ids, '[]'::JSONB) @> jsonb_build_array(${llmId})
		     OR EXISTS (
		        SELECT 1
		        FROM jsonb_array_elements(
		          CASE
		            WHEN jsonb_typeof(COALESCE(tomori_configs.fallback_model_refs, '[]'::JSONB)) = 'array'
		              THEN COALESCE(tomori_configs.fallback_model_refs, '[]'::JSONB)
		            ELSE '[]'::JSONB
		          END
		        ) AS ref
		        WHERE ref ->> 'type' = 'llm'
		          AND ref ->> 'id' = ${String(llmId)}
		     )
		  UNION ALL
		  SELECT 1
		  FROM persona_configs
		  WHERE llm_id = ${llmId}
		  UNION ALL
		  SELECT 1
		  FROM channel_llm_overrides
		  WHERE llm_id = ${llmId}
		  UNION ALL
		  SELECT 1
		  FROM saved_provider_configs
		  WHERE llm_id = ${llmId}
		     OR vision_llm_id = ${llmId}
		     OR COALESCE(fallback_llm_ids, '[]'::JSONB) @> jsonb_build_array(${llmId})
		     OR EXISTS (
		        SELECT 1
		        FROM jsonb_array_elements(
		          CASE
		            WHEN jsonb_typeof(COALESCE(saved_provider_configs.fallback_model_refs, '[]'::JSONB)) = 'array'
		              THEN COALESCE(saved_provider_configs.fallback_model_refs, '[]'::JSONB)
		            ELSE '[]'::JSONB
		          END
		        ) AS ref
		        WHERE ref ->> 'type' = 'llm'
		          AND ref ->> 'id' = ${String(llmId)}
		     )
		  UNION ALL
		  SELECT 1
		  FROM user_saved_provider_configs
		  WHERE llm_id = ${llmId}
		     OR vision_llm_id = ${llmId}
		     OR COALESCE(fallback_llm_ids, '[]'::JSONB) @> jsonb_build_array(${llmId})
		     OR EXISTS (
		        SELECT 1
		        FROM jsonb_array_elements(
		          CASE
		            WHEN jsonb_typeof(COALESCE(user_saved_provider_configs.fallback_model_refs, '[]'::JSONB)) = 'array'
		              THEN COALESCE(user_saved_provider_configs.fallback_model_refs, '[]'::JSONB)
		            ELSE '[]'::JSONB
		          END
		        ) AS ref
		        WHERE ref ->> 'type' = 'llm'
		          AND ref ->> 'id' = ${String(llmId)}
		     )
		) AS in_use
	`;

  return Boolean(row?.in_use);
}

export async function registerOpenRouterModelForScope(
  scope: OpenRouterModelRegistryScope,
  modelName: string,
): Promise<RegisterOpenRouterModelResult> {
  const normalizedModelName = normalizeModelCodename(modelName);
  if (!normalizedModelName) {
    return { status: "invalid_model" };
  }

  if (!(await getOrFetchOpenRouterCapabilities(normalizedModelName))) {
    return { status: "invalid_model" };
  }

  const existingModel = await loadLlmByProviderAndCodename("openrouter", normalizedModelName);
  if (existingModel && !existingModel.is_scoped_registration) {
    return {
      status: "already_available",
      llm: existingModel,
    };
  }

  const visibleModels = await loadScopedOpenRouterModels(scope, true);
  const alreadyRegistered = visibleModels.find(
    (model) => model.llm_codename === normalizedModelName && model.is_scoped_registration,
  );
  if (alreadyRegistered) {
    return {
      status: "already_registered",
      llm: alreadyRegistered,
    };
  }

  const llm = await upsertScopedOpenRouterLlm(normalizedModelName);
  if (!llm) {
    return { status: "invalid_model" };
  }

  const registration =
    scope.kind === "server"
      ? await upsertOpenRouterModelRegistration({
          serverId: scope.ownerId,
          llmId: llm.llm_id ?? 0,
        })
      : await upsertOpenRouterModelRegistration({
          userId: scope.ownerId,
          llmId: llm.llm_id ?? 0,
        });

  if (!registration) {
    throw new Error(`Failed to register scoped OpenRouter model ${normalizedModelName}`);
  }

  return {
    status: "registered",
    llm,
  };
}

export async function removeOpenRouterModelForScope(
  scope: OpenRouterModelRegistryScope,
  modelName: string,
): Promise<RemoveOpenRouterModelResult> {
  const normalizedModelName = normalizeModelCodename(modelName);
  if (!normalizedModelName) {
    return { status: "not_found" };
  }

  const model = await loadLlmByProviderAndCodename("openrouter", normalizedModelName);
  if (!model) {
    return { status: "not_found" };
  }
  if (!model.is_scoped_registration) {
    return { status: "already_available" };
  }
  if (!model.llm_id) {
    return { status: "not_found" };
  }

  const deleted =
    scope.kind === "server"
      ? await deleteOpenRouterModelRegistration({
          serverId: scope.ownerId,
          llmId: model.llm_id,
        })
      : await deleteOpenRouterModelRegistration({
          userId: scope.ownerId,
          llmId: model.llm_id,
        });

  if (!deleted) {
    return { status: "not_found" };
  }

  if (scope.kind === "server") {
    await pruneServerFallbacks(scope.ownerId, model.llm_id);
  } else {
    await prunePersonalFallbacks(scope.ownerId, model.llm_id);
  }

  const [remainingRegistrationCountRow] = await sql<Array<{ count: string | number }>>`
		SELECT COUNT(*) AS count
		FROM openrouter_model_registrations
		WHERE llm_id = ${model.llm_id}
	`;
  const remainingRegistrationCount = Number(remainingRegistrationCountRow?.count ?? 0);
  const stillReferenced = await isLlmStillReferenced(model.llm_id);

  if (remainingRegistrationCount === 0 && !stillReferenced) {
    await sql`
			DELETE FROM llms
			WHERE llm_id = ${model.llm_id}
			  AND llm_provider = 'openrouter'
			  AND COALESCE(is_scoped_registration, false) = true
		`;
  }

  return {
    status: "removed",
    stillReferenced,
  };
}

export async function loadRegisteredOpenRouterModelsForScope(scope: OpenRouterModelRegistryScope): Promise<LlmRow[]> {
  const models = await loadScopedOpenRouterModels(scope, true);
  return models.filter((model) => model.is_scoped_registration);
}

export function formatScopedOpenRouterCommand(scope: OpenRouterModelRegistryScope, action: "add" | "remove"): string {
  return scope.kind === "server" ? `/openrouter models ${action}` : `/personal openrouter-models ${action}`;
}

export async function logOpenRouterRegistryError(context: string, error: unknown): Promise<void> {
  await log.error(context, error as Error);
}
