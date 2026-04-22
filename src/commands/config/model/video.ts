/**
 * Video Model Configuration Command (/config model video)
 * Allows server admins to select which video generation model Tomori uses.
 * Queries available models filtered by the current LLM provider.
 * Mirrors the /config model image command pattern.
 */

import type { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags } from "discord.js";
import { sql } from "@/utils/db/client";
import { getCachedTomoriState, invalidateTomoriStateCache } from "../../../utils/cache/tomoriStateCache";
import { localizer } from "../../../utils/text/localizer";
import { log, ColorCode } from "../../../utils/misc/logger";
import { replyInfoEmbed, promptWithRawModal, safeSelectOptionText } from "../../../utils/discord/interactionHelper";
import { type UserRow, type ErrorContext, tomoriConfigSchema } from "../../../types/db/schema";
import type { SelectOption } from "../../../types/discord/modal";
import { promptForSavedProvider, replaceProviderPickerWithInfo } from "@/commands/config/model/providerPicker";
import { loadAvailableVideoGenerationModelsForProvider } from "@/utils/db/dbRead";
import { loadSavedProvidersForCapability } from "@/utils/provider/savedProviderConfig";
import { getProviderDisplayName } from "@/utils/provider/providerInfoRegistry";
import { isCustomProvider } from "@/utils/provider/customProviderUtils";

// Modal configuration constants
const MODAL_CUSTOM_ID = "config_model_video_modal";
const MODEL_SELECT_ID = "model_select";

/**
 * Type definition for video generation model row from the database.
 * Mirrors ImageDiffusionModelRow but without is_uncensored.
 */
interface VideoGenerationModelRow {
  video_model_id?: number;
  provider: string;
  codename: string;
  model_description?: string | null;
  ja_description?: string | null;
  is_default: boolean;
  is_deprecated: boolean;
  is_free: boolean;
  is_scoped_registration?: boolean;
}

/**
 * Get localized video model description based on user's locale.
 * @param model - Video generation model row from database
 * @param locale - User's preferred locale (e.g., "ja", "en-US")
 * @returns Localized description with flags prepended (e.g., "(FREE) Description")
 */
function getLocalizedDescription(model: VideoGenerationModelRow, locale: string): string {
  // 1. Normalize locale to handle variations (e.g., "ja-JP" -> "ja")
  const normalizedLocale = locale.toLowerCase().split("-")[0];

  // 2. Select description based on locale
  let description: string | null | undefined;
  if (normalizedLocale === "ja") {
    description = model.ja_description;
  } else {
    description = model.model_description;
  }

  // 3. Fallback chain: locale-specific -> default -> provider fallback
  const baseDescription = description || model.model_description || `${model.provider} model`;

  // 4. Build flags array based on model capabilities
  const flags: string[] = [];
  if (model.is_free) flags.push("FREE");

  // 5. Prepend flags with connector if any exist
  const flagPrefix = flags.length > 0 ? `(${flags.join("+")}) ` : "";
  return `${flagPrefix}${baseDescription}`;
}

// Configure the subcommand
export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand.setName("video").setDescription(localizer("en-US", "commands.config.model.video.description"));

/**
 * Changes Tomori's video generation model.
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
  // 1. Ensure command is run in a channel
  if (!interaction.channel) {
    await replyInfoEmbed(interaction, userData.language_pref, {
      titleKey: "general.errors.channel_only_title",
      descriptionKey: "general.errors.channel_only_description",
      color: ColorCode.ERROR,
    });
    return;
  }

  // 2. Load the Tomori state for this server
  const tomoriState = await getCachedTomoriState(interaction.guild?.id ?? interaction.user.id);
  if (!tomoriState) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.tomori_not_setup_title",
      descriptionKey: "general.errors.tomori_not_setup_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Track modal submit interaction and selected model for error handling in catch block
  let modalSubmitInteraction: import("discord.js").ModalSubmitInteraction | undefined;
  let selectedModel: VideoGenerationModelRow | null = null;
  let responseInteraction: ChatInputCommandInteraction | import("discord.js").ButtonInteraction = interaction;
  let providerSelection: Awaited<ReturnType<typeof promptForSavedProvider>> = null;

  try {
    const savedProviders = await loadSavedProvidersForCapability(tomoriState.server_id, "video");
    providerSelection = await promptForSavedProvider(interaction, locale, savedProviders);

    if (!providerSelection) {
      return;
    }
    const selectedProvider = providerSelection.provider;
    responseInteraction = providerSelection.interaction;

    if (isCustomProvider(selectedProvider)) {
      const selectedSavedConfig = savedProviders.find((row) => row.provider.toLowerCase() === selectedProvider) ?? null;
      if (!selectedSavedConfig?.video_model_id) {
        await replyInfoEmbed(responseInteraction, locale, {
          titleKey: "commands.config.model.video.no_models_title",
          descriptionKey: "commands.config.model.video.no_models_description",
          descriptionVars: {
            provider: getProviderDisplayName(selectedProvider),
          },
          color: ColorCode.ERROR,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const [updatedRow] = await sql`
        UPDATE tomori_configs
        SET video_model_id = ${selectedSavedConfig.video_model_id}
        WHERE server_id = ${tomoriState.server_id}
        RETURNING *
      `;

      const validatedConfig = tomoriConfigSchema.safeParse(updatedRow);
      if (!validatedConfig.success || !updatedRow) {
        await replyInfoEmbed(responseInteraction, locale, {
          titleKey: "general.errors.update_failed_title",
          descriptionKey: "general.errors.update_failed_description",
          color: ColorCode.ERROR,
        });
        return;
      }

      invalidateTomoriStateCache(interaction.guild?.id ?? interaction.user.id);
      await replyInfoEmbed(responseInteraction, locale, {
        titleKey: "commands.config.model.video.success_title",
        descriptionKey: "commands.config.model.video.success_description",
        descriptionVars: {
          model_name: selectedSavedConfig.custom_model_name ?? getProviderDisplayName(selectedProvider),
          previous_model: localizer(locale, "commands.config.model.video.current_none"),
          provider: getProviderDisplayName(selectedProvider),
        },
        color: ColorCode.SUCCESS,
      });
      return;
    }

    const availableModels =
      (await loadAvailableVideoGenerationModelsForProvider(selectedProvider, false, {
        kind: "server",
        ownerId: tomoriState.server_id,
      })) ?? [];

    if (!availableModels.length) {
      await replyInfoEmbed(responseInteraction, locale, {
        titleKey: "commands.config.model.video.no_models_title",
        descriptionKey: "commands.config.model.video.no_models_description",
        descriptionVars: {
          provider: getProviderDisplayName(selectedProvider),
        },
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // 6. Create model options for the select menu using localized descriptions
    const modelSelectOptions: SelectOption[] = availableModels
      .filter((model) => model.video_model_id !== undefined && model.video_model_id !== null)
      .map((model) => ({
        label: safeSelectOptionText(model.codename),
        value: safeSelectOptionText((model.video_model_id ?? 0).toString()),
        description: safeSelectOptionText(getLocalizedDescription(model, userData.language_pref)),
      }));

    // 7. Show the modal with model selection
    const modalResult = await promptWithRawModal(
      responseInteraction,
      locale,
      {
        modalCustomId: MODAL_CUSTOM_ID,
        modalTitleKey: "commands.config.model.video.modal_title",
        components: [
          {
            customId: MODEL_SELECT_ID,
            labelKey: "commands.config.model.video.select_label",
            descriptionKey: "commands.config.model.video.select_description",
            placeholder: "commands.config.model.video.select_placeholder",
            required: true,
            options: modelSelectOptions,
          },
        ],
      },
      MessageFlags.Ephemeral,
    );

    // 8. Handle modal outcome
    if (modalResult.outcome !== "submit") {
      log.info(`Video model selection modal ${modalResult.outcome} for user ${userData.user_id}`);
      return;
    }

    // Extract values from the modal
    // biome-ignore lint/style/noNonNullAssertion: Modal submission outcome "submit" guarantees these values exist
    modalSubmitInteraction = modalResult.interaction!;
    // biome-ignore lint/style/noNonNullAssertion: Modal submission outcome "submit" guarantees these values exist
    const selectedModelIdStr = modalResult.values![MODEL_SELECT_ID];

    // 9. Find the selected model details by video_model_id
    const selectedModelId = Number.parseInt(selectedModelIdStr, 10);
    selectedModel = availableModels.find((model) => model.video_model_id === selectedModelId) ?? null;

    if (!selectedModel?.video_model_id) {
      const context: ErrorContext = {
        tomoriId: tomoriState.tomori_id,
        serverId: tomoriState.server_id,
        userId: userData.user_id,
        errorType: "CommandExecutionError",
        metadata: {
          command: "config model video",
          guildId: interaction.guild?.id ?? interaction.user.id,
          requestedModelId: selectedModelIdStr,
          availableModels: availableModels.map((m) => m.video_model_id),
        },
      };
      await log.error(
        "Selected model ID not found in available video models from DB",
        new Error("Invalid model selection despite modal choices"),
        context,
      );

      await modalSubmitInteraction.editReply({
        content: localizer(locale, "commands.config.model.video.invalid_model_description"),
      });
      return;
    }

    // 10. Check if this is the same as the current model
    if (selectedModel.video_model_id === tomoriState.config.video_model_id) {
      await replyInfoEmbed(modalSubmitInteraction, locale, {
        titleKey: "commands.config.model.video.already_selected_title",
        descriptionKey: "commands.config.model.video.already_selected_description",
        descriptionVars: {
          model_name: selectedModel.codename,
        },
        color: ColorCode.WARN,
      });
      return;
    }

    // 11. Update the config in the database
    const [updatedRow] = await sql`
      UPDATE tomori_configs
      SET video_model_id = ${selectedModel.video_model_id}
      WHERE server_id = ${tomoriState.server_id}
      RETURNING *
    `;

    // 12. Validate the returned data
    const validatedConfig = tomoriConfigSchema.safeParse(updatedRow);

    if (!validatedConfig.success || !updatedRow) {
      const context: ErrorContext = {
        tomoriId: tomoriState.tomori_id,
        serverId: tomoriState.server_id,
        userId: userData.user_id,
        errorType: "DatabaseUpdateError",
        metadata: {
          command: "config model video",
          guildId: interaction.guild?.id ?? interaction.user.id,
          selectedModelCodename: selectedModel.codename,
          targetVideoModelId: selectedModel.video_model_id,
          validationErrors: validatedConfig.success ? null : validatedConfig.error.flatten(),
        },
      };
      await log.error(
        "Failed to update or validate video model config after DB update",
        validatedConfig.success
          ? new Error("Database update returned no rows or unexpected data")
          : new Error("Updated config data failed validation"),
        context,
      );

      await replyInfoEmbed(modalSubmitInteraction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    // 13. Invalidate cache so next message gets fresh config
    invalidateTomoriStateCache(interaction.guild?.id ?? interaction.user.id);

    // 14. Success message with previous model name
    const previousModel = availableModels.find((model) => model.video_model_id === tomoriState.config.video_model_id);

    const successOptions = {
      titleKey: "commands.config.model.video.success_title",
      descriptionKey: "commands.config.model.video.success_description",
      descriptionVars: {
        model_name: selectedModel.codename,
        previous_model: previousModel?.codename || localizer(locale, "commands.config.model.video.current_none"),
        provider: getProviderDisplayName(selectedProvider),
      },
      color: ColorCode.SUCCESS,
    } as const;

    const replacedPicker =
      modalSubmitInteraction &&
      (await replaceProviderPickerWithInfo(providerSelection, modalSubmitInteraction, locale, successOptions));

    if (!replacedPicker) {
      await replyInfoEmbed(modalSubmitInteraction, locale, successOptions);
    }
  } catch (error) {
    // 15. Log error with context
    let serverIdForError: number | null = null;
    let tomoriIdForError: number | null = null;
    if (interaction.guild?.id) {
      const state = await getCachedTomoriState(interaction.guild.id);
      serverIdForError = state?.server_id ?? null;
      tomoriIdForError = state?.tomori_id ?? null;
    }

    const context: ErrorContext = {
      userId: userData.user_id,
      serverId: serverIdForError,
      tomoriId: tomoriIdForError,
      errorType: "CommandExecutionError",
      metadata: {
        command: "config model video",
        guildId: interaction.guild?.id ?? interaction.user.id,
        executorDiscordId: interaction.user.id,
        targetVideoModelIdAttempted: selectedModel?.video_model_id,
      },
    };
    await log.error(`Error executing /config model video for user ${userData.user_disc_id}`, error as Error, context);

    // 16. Inform user of unknown error
    const replyTarget = modalSubmitInteraction ?? responseInteraction;
    await replyInfoEmbed(replyTarget, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
