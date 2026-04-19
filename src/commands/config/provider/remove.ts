import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import { loadSavedProviderConfigs } from "@/utils/db/dbRead";
import { deleteSavedProviderConfig } from "@/utils/db/dbWrite";
import { getCachedTomoriState, invalidateTomoriStateCache } from "@/utils/cache/tomoriStateCache";
import { localizer } from "@/utils/text/localizer";
import { log, ColorCode } from "@/utils/misc/logger";
import { replyInfoEmbed, promptWithRawModal } from "@/utils/discord/interactionHelper";
import type { UserRow, ErrorContext } from "@/types/db/schema";
import type { SelectOption, ModalComponent } from "@/types/discord/modal";
import { getProviderDisplayName } from "@/utils/provider/providerInfoRegistry";
import { isCustomProvider, deleteCustomLLMEntry } from "@/utils/discord/customProviderModal";
import { sql } from "@/utils/db/client";
import { loadProviderDefaultSelectionIds } from "@/utils/provider/savedProviderConfig";

async function resolveLlmProvider(llmId: number | null | undefined): Promise<string | null> {
  if (!llmId) return null;
  const [row] = await sql`
    SELECT llm_provider
    FROM llms
    WHERE llm_id = ${llmId}
    LIMIT 1
  `;
  return row?.llm_provider ? String(row.llm_provider).toLowerCase() : null;
}

async function resolveDiffusionProvider(diffusionModelId: number | null | undefined): Promise<string | null> {
  if (!diffusionModelId) return null;
  const [row] = await sql`
    SELECT provider
    FROM image_diffusion_models
    WHERE diffusion_model_id = ${diffusionModelId}
    LIMIT 1
  `;
  return row?.provider ? String(row.provider).toLowerCase() : null;
}

async function resolveEmbeddingProvider(embeddingModelId: number | null | undefined): Promise<string | null> {
  if (!embeddingModelId) return null;
  const [row] = await sql`
    SELECT provider
    FROM embedding_models
    WHERE embedding_model_id = ${embeddingModelId}
    LIMIT 1
  `;
  return row?.provider ? String(row.provider).toLowerCase() : null;
}

async function resolveVideoProvider(videoModelId: number | null | undefined): Promise<string | null> {
  if (!videoModelId) return null;
  const [row] = await sql`
    SELECT provider
    FROM video_generation_models
    WHERE video_model_id = ${videoModelId}
    LIMIT 1
  `;
  return row?.provider ? String(row.provider).toLowerCase() : null;
}

// Modal configuration constants
const MODAL_CUSTOM_ID = "config_provider_remove_modal";
const PROVIDER_SELECT_ID = "provider_remove_select";

// Configure the subcommand
export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand.setName("remove").setDescription(localizer("en-US", "commands.config.provider.remove.description"));

/**
 * Removes a saved provider configuration from the database.
 * Only shows providers that have saved configs (excluding the active provider).
 * @param _client - Discord client instance
 * @param interaction - Command interaction
 * @param userData - User data from database
 * @param locale - Locale of the interaction
 */
export async function execute(
  _client: Client,
  interaction: ChatInputCommandInteraction,
  userData: UserRow,
  locale: string,
): Promise<void> {
  // 1. Ensure command is run in a channel context
  if (!interaction.channel) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.channel_only_title",
      descriptionKey: "general.errors.channel_only_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 2. Load the Tomori state for this server/user
  const serverId = interaction.guild?.id ?? interaction.user.id;
  const tomoriState = await getCachedTomoriState(serverId);
  if (!tomoriState) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.tomori_not_setup_title",
      descriptionKey: "general.errors.tomori_not_setup_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Track modal submit interaction for error handling in catch block
  let modalSubmitInteraction: import("discord.js").ModalSubmitInteraction | undefined;

  try {
    // 3. Load saved provider configs, excluding the currently active provider
    const allSavedConfigs = await loadSavedProviderConfigs(tomoriState.server_id);
    const currentProvider = tomoriState.llm.llm_provider.toLowerCase();
    const removableConfigs = allSavedConfigs.filter((c) => c.provider.toLowerCase() !== currentProvider);

    // 4. If no saved configs to remove, show error
    if (removableConfigs.length === 0) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.config.provider.remove.no_saved_title",
        descriptionKey: "commands.config.provider.remove.no_saved_description",
        color: ColorCode.WARN,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // 5. Build select options from removable saved configs
    const selectOptions: SelectOption[] = removableConfigs.map((config) => ({
      label: getProviderDisplayName(config.provider),
      value: config.provider.toLowerCase(),
      description: undefined,
    }));

    // 6. Show modal with provider selection
    const modalComponents: ModalComponent[] = [
      {
        customId: PROVIDER_SELECT_ID,
        labelKey: "commands.config.provider.remove.confirm_title",
        descriptionKey: "commands.config.provider.remove.confirm_description",
        placeholder: "commands.config.provider.remove.select_placeholder",
        required: true,
        options: selectOptions,
      },
    ];

    const modalResult = await promptWithRawModal(
      interaction,
      locale,
      {
        modalCustomId: MODAL_CUSTOM_ID,
        modalTitleKey: "commands.config.provider.remove.confirm_title",
        components: modalComponents,
      },
      MessageFlags.Ephemeral,
    );

    // 7. Handle modal outcome
    if (modalResult.outcome !== "submit") {
      log.info(`Provider remove modal ${modalResult.outcome} for user ${userData.user_id}`);
      return;
    }

    modalSubmitInteraction = modalResult.interaction;
    const selectedProvider = modalResult.values?.[PROVIDER_SELECT_ID];

    if (!modalSubmitInteraction || !selectedProvider) {
      log.error("Provider remove modal result unexpectedly missing interaction or values");
      return;
    }

    // 8. Delete the saved config
    const activeProvider = tomoriState.llm.llm_provider.toLowerCase();
    const activeDefaults = await loadProviderDefaultSelectionIds(activeProvider);
    const reassignmentLines: string[] = [];

    const [embeddingProvider, standardImageProvider, naiImageProvider, videoProvider, visionProvider] =
      await Promise.all([
        resolveEmbeddingProvider(tomoriState.config.embedding_model_id),
        resolveDiffusionProvider(tomoriState.config.diffusion_model_id),
        resolveDiffusionProvider(tomoriState.config.nai_diffusion_model_id),
        resolveVideoProvider(tomoriState.config.video_model_id),
        resolveLlmProvider(tomoriState.config.vision_llm_id),
      ]);

    const nextEmbeddingModelId =
      embeddingProvider === selectedProvider.toLowerCase()
        ? activeDefaults.embedding_model_id
        : tomoriState.config.embedding_model_id;
    const nextDiffusionModelId =
      standardImageProvider === selectedProvider.toLowerCase()
        ? activeDefaults.diffusion_model_id
        : tomoriState.config.diffusion_model_id;
    const nextNaiDiffusionModelId =
      naiImageProvider === selectedProvider.toLowerCase()
        ? activeDefaults.nai_diffusion_model_id
        : tomoriState.config.nai_diffusion_model_id;
    const nextVideoModelId =
      videoProvider === selectedProvider.toLowerCase()
        ? activeDefaults.video_model_id
        : tomoriState.config.video_model_id;
    const nextVisionLlmId =
      visionProvider === selectedProvider.toLowerCase()
        ? activeDefaults.vision_llm_id
        : tomoriState.config.vision_llm_id;

    const fallbackRows =
      tomoriState.config.fallback_llm_ids && tomoriState.config.fallback_llm_ids.length > 0
        ? await sql<Array<{ llm_id: number; llm_provider: string }>>`
            SELECT llm_id, llm_provider
            FROM llms
            WHERE llm_id = ANY(${tomoriState.config.fallback_llm_ids})
          `
        : [];
    const nextFallbackIds = fallbackRows
      .filter((row) => row.llm_provider.toLowerCase() !== selectedProvider.toLowerCase())
      .map((row) => row.llm_id);

    if (nextEmbeddingModelId !== tomoriState.config.embedding_model_id) {
      reassignmentLines.push(
        `- Embedding model -> ${nextEmbeddingModelId ? `\`${nextEmbeddingModelId}\`` : "*cleared*"}`,
      );
    }
    if (nextDiffusionModelId !== tomoriState.config.diffusion_model_id) {
      reassignmentLines.push(
        `- Standard image model -> ${nextDiffusionModelId ? `\`${nextDiffusionModelId}\`` : "*cleared*"}`,
      );
    }
    if (nextNaiDiffusionModelId !== tomoriState.config.nai_diffusion_model_id) {
      reassignmentLines.push(
        `- NovelAI image model -> ${nextNaiDiffusionModelId ? `\`${nextNaiDiffusionModelId}\`` : "*cleared*"}`,
      );
    }
    if (nextVideoModelId !== tomoriState.config.video_model_id) {
      reassignmentLines.push(`- Video model -> ${nextVideoModelId ? `\`${nextVideoModelId}\`` : "*cleared*"}`);
    }
    if (nextVisionLlmId !== tomoriState.config.vision_llm_id) {
      reassignmentLines.push(`- Vision model -> ${nextVisionLlmId ? `\`${nextVisionLlmId}\`` : "*cleared*"}`);
    }
    if (nextFallbackIds.length !== (tomoriState.config.fallback_llm_ids ?? []).length) {
      reassignmentLines.push("- Fallback models -> removed entries from the deleted provider");
    }

    await sql`
      UPDATE tomori_configs
      SET embedding_model_id = ${nextEmbeddingModelId},
          diffusion_model_id = ${nextDiffusionModelId},
          nai_diffusion_model_id = ${nextNaiDiffusionModelId},
          video_model_id = ${nextVideoModelId},
          vision_llm_id = ${nextVisionLlmId},
          fallback_llm_ids = ${JSON.stringify(nextFallbackIds)}::jsonb
      WHERE server_id = ${tomoriState.server_id}
    `;

    if (activeProvider === tomoriState.llm.llm_provider.toLowerCase()) {
      await sql`
        UPDATE saved_provider_configs
        SET fallback_llm_ids = ${JSON.stringify(nextFallbackIds)}::jsonb
        WHERE server_id = ${tomoriState.server_id}
          AND provider = ${activeProvider}
      `;
    }

    const deleted = await deleteSavedProviderConfig(tomoriState.server_id, selectedProvider);

    if (!deleted) {
      await replyInfoEmbed(modalSubmitInteraction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    // 9. Also purge rotation keys for that provider (clean break)
    const { purgeRotationKeysForProvider } = await import("../../../utils/security/keyRotation");
    const purgedCount = await purgeRotationKeysForProvider(tomoriState.server_id, selectedProvider);
    if (purgedCount > 0) {
      log.info(`Purged ${purgedCount} rotation key(s) for removed provider ${selectedProvider}`);
    }

    // 10. If removing custom provider's saved config, clean up the custom LLM entry
    // (only if the custom provider is NOT currently active)
    if (isCustomProvider(selectedProvider)) {
      log.info(`Removing saved custom provider config — cleaning up custom LLM entry`);
      await deleteCustomLLMEntry(serverId);
    }

    invalidateTomoriStateCache(serverId);

    // 11. Success message
    await replyInfoEmbed(modalSubmitInteraction, locale, {
      titleKey: "commands.config.provider.remove.success_title",
      descriptionKey:
        reassignmentLines.length > 0
          ? "commands.config.provider.remove.auto_reassigned_description"
          : "commands.config.provider.remove.success_description",
      descriptionVars: {
        provider: getProviderDisplayName(selectedProvider),
        reassignments: reassignmentLines.join("\n"),
      },
      color: ColorCode.SUCCESS,
    });
  } catch (error) {
    let serverIdForError: number | null = null;
    let tomoriIdForError: number | null = null;
    const errorServerId = interaction.guild?.id ?? interaction.user.id;
    const state = await getCachedTomoriState(errorServerId);
    serverIdForError = state?.server_id ?? null;
    tomoriIdForError = state?.tomori_id ?? null;

    const context: ErrorContext = {
      userId: userData.user_id,
      serverId: serverIdForError,
      tomoriId: tomoriIdForError,
      errorType: "CommandExecutionError",
      metadata: {
        command: "config provider remove",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error(
      `Error executing /config provider remove for user ${userData.user_disc_id}`,
      error as Error,
      context,
    );

    const replyTarget = modalSubmitInteraction ?? interaction;
    await replyInfoEmbed(replyTarget, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
