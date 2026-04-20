import type { ChatInputCommandInteraction, ButtonInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags } from "discord.js";
import { sql } from "@/utils/db/client";
import { loadAvailableModelsForProvider, loadNaiPresetsForModel } from "../../../utils/db/dbRead";
import { setChannelLlmOverride, setPersonaLlmOverride, applyNaiPreset } from "../../../utils/db/dbWrite";
import {
  getCachedTomoriState,
  getCachedAllPersonas,
  invalidateTomoriStateCache,
} from "../../../utils/cache/tomoriStateCache";
import { setChannelLlmCache } from "../../../utils/cache/channelLlmCache";
import { localizer } from "../../../utils/text/localizer";
import { log, ColorCode } from "../../../utils/misc/logger";
import {
  acknowledgeModalSubmitForRefresh,
  replyInfoEmbed,
  replyComponentsV2Status,
  promptWithPaginatedModal,
  safeSelectOptionText,
  replyPaginatedPersonaChoicesV2,
} from "../../../utils/discord/interactionHelper";
import { type UserRow, type ErrorContext, tomoriConfigSchema, type LlmRow } from "../../../types/db/schema";
import type { SelectOption } from "../../../types/discord/modal";
import {
  isCustomProvider,
  promptCustomCapabilities,
  DEFAULT_CUSTOM_MODEL_NAME,
} from "../../../utils/discord/customProviderModal";
import { resolveLogitBiasEntriesForLlm } from "@/utils/provider/logitBiasResolver";
import { promptForSavedProvider, replaceProviderPickerWithInfo } from "@/commands/config/model/providerPicker";
import { loadSavedProvidersForCapability } from "@/utils/provider/savedProviderConfig";
import { getProviderDisplayName } from "@/utils/provider/providerInfoRegistry";

const MODAL_CUSTOM_ID = "config_model_text_modal";
const MODEL_SELECT_ID = "model_select";

/**
 * Returns a localized description with capability flags prepended (e.g. "(FREE+TOOLS+IMG) Description").
 */
function getLocalizedDescription(model: LlmRow, locale: string): string {
  const normalizedLocale = locale.toLowerCase().split("-")[0];
  const description = normalizedLocale === "ja" ? model.ja_description : model.llm_description;
  const baseDescription = description || model.llm_description || `${model.llm_provider} model`;

  if (model.llm_codename === "other-model") {
    return baseDescription;
  }

  const flags: string[] = [];
  if (model.is_free) flags.push("FREE");
  if (model.has_tools) flags.push("TOOLS");
  if (model.sees_images) flags.push("IMG");
  if (model.sees_videos) flags.push("VID");
  if (model.supports_structoutput) flags.push("STRUCT");

  const flagPrefix = flags.length > 0 ? `(${flags.join("+")}) ` : "";
  return `${flagPrefix}${baseDescription}`;
}

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("text")
    .setDescription(localizer("en-US", "commands.config.model.text.description"))
    .addStringOption((option) =>
      option
        .setName("scope")
        .setDescription(localizer("en-US", "commands.config.model.text.scope_description"))
        .setRequired(false)
        .addChoices(
          { name: localizer("en-US", "commands.config.model.text.scope_global"), value: "global" },
          { name: localizer("en-US", "commands.config.model.text.scope_channel"), value: "channel" },
          { name: localizer("en-US", "commands.config.model.text.scope_persona"), value: "persona" },
        ),
    );

export async function execute(
  _client: Client,
  interaction: ChatInputCommandInteraction,
  userData: UserRow,
  locale: string,
): Promise<void> {
  if (!interaction.channel) {
    await replyInfoEmbed(interaction, userData.language_pref, {
      titleKey: "general.errors.channel_only_title",
      descriptionKey: "general.errors.channel_only_description",
      color: ColorCode.ERROR,
    });
    return;
  }

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

  const savedProviders = await loadSavedProvidersForCapability(tomoriState.server_id, "text");
  const scope = interaction.options.getString("scope") ?? "global";

  let modalSubmitInteraction: import("discord.js").ModalSubmitInteraction | undefined;
  let selectedModel: LlmRow | null = null;
  let providerSelection: Awaited<ReturnType<typeof promptForSavedProvider>> = null;

  try {
    // 1. Channel scope: provider picker → model picker → channel override
    if (scope === "channel") {
      providerSelection = await promptForSavedProvider(interaction, locale, savedProviders);
      if (!providerSelection) return;

      const selectedProvider = providerSelection.provider;
      const responseInteraction = providerSelection.interaction;

      const availableModels = await loadAvailableModelsForProvider(selectedProvider);
      if (!availableModels?.length) {
        await replyInfoEmbed(responseInteraction, locale, {
          titleKey: "commands.config.model.text.no_models_title",
          descriptionKey: "commands.config.model.text.no_models_description",
          color: ColorCode.ERROR,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const modelOptions: SelectOption[] = availableModels.map((m) => ({
        label: safeSelectOptionText(m.llm_codename),
        value: safeSelectOptionText(m.llm_codename),
        description: safeSelectOptionText(getLocalizedDescription(m, userData.language_pref)),
      }));

      const channelModalResult = await promptWithPaginatedModal(responseInteraction, locale, {
        modalCustomId: "config_model_text_channel_modal",
        modalTitleKey: "commands.config.model.text.modal_title",
        components: [
          {
            customId: MODEL_SELECT_ID,
            labelKey: "commands.config.model.text.select_label",
            descriptionKey: "commands.config.model.text.select_description",
            placeholder: "commands.config.model.text.select_placeholder",
            required: true,
            options: modelOptions,
          },
        ],
      });

      if (channelModalResult.outcome !== "submit") return;
      // biome-ignore lint/style/noNonNullAssertion: submit outcome guarantees values
      modalSubmitInteraction = channelModalResult.interaction!;
      // biome-ignore lint/style/noNonNullAssertion: submit outcome guarantees values
      const selectedCodename = channelModalResult.values![MODEL_SELECT_ID];
      const selectedChannelModel = availableModels.find((m) => m.llm_codename === selectedCodename) ?? null;

      if (!selectedChannelModel?.llm_id) {
        await replyInfoEmbed(modalSubmitInteraction, locale, {
          titleKey: "commands.config.model.text.invalid_model_title",
          descriptionKey: "commands.config.model.text.invalid_model_description",
          color: ColorCode.ERROR,
        });
        return;
      }

      const channelWriteOk = await setChannelLlmOverride(
        tomoriState.server_id,
        interaction.channelId,
        selectedChannelModel.llm_id,
      );
      if (!channelWriteOk) {
        await replyInfoEmbed(modalSubmitInteraction, locale, {
          titleKey: "general.errors.update_failed_title",
          descriptionKey: "general.errors.update_failed_description",
          color: ColorCode.ERROR,
        });
        return;
      }

      setChannelLlmCache(tomoriState.server_id, interaction.channelId, selectedChannelModel);
      await replyInfoEmbed(modalSubmitInteraction, locale, {
        titleKey: "commands.config.model.text.success_title",
        descriptionKey: "commands.config.model.text.scope_set_channel_success",
        descriptionVars: {
          channel: interaction.channel?.toString() ?? interaction.channelId,
          model: selectedChannelModel.llm_codename,
        },
        color: ColorCode.SUCCESS,
      });
      return;
    }

    // 2. Persona scope: persona picker → provider picker → model picker → persona override
    if (scope === "persona") {
      const allPersonas = await getCachedAllPersonas(serverId);
      if (!allPersonas.length) {
        await replyInfoEmbed(interaction, locale, {
          titleKey: "general.errors.tomori_not_setup_title",
          descriptionKey: "general.errors.tomori_not_setup_description",
          color: ColorCode.ERROR,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      while (true) {
        const personaSelection = await replyPaginatedPersonaChoicesV2(interaction, locale, {
          personas: allPersonas,
          color: ColorCode.INFO,
          preserveSelectedInteraction: true,
          onSelect: async () => {},
        });

        if (!personaSelection.success) {
          if (personaSelection.reason === "cancelled" || personaSelection.reason === "fatal") return;
          continue;
        }
        if (personaSelection.selectedIndex === undefined || !personaSelection.interaction) return;

        const personaButtonInteraction: ButtonInteraction = personaSelection.interaction;
        const selectedPersona = allPersonas[personaSelection.selectedIndex] ?? null;
        if (!selectedPersona?.tomori_id) {
          await replyInfoEmbed(personaButtonInteraction, locale, {
            titleKey: "general.errors.invalid_option_title",
            descriptionKey: "general.errors.invalid_option_description",
            color: ColorCode.ERROR,
          });
          return;
        }

        providerSelection = await promptForSavedProvider(personaButtonInteraction, locale, savedProviders);
        if (!providerSelection) return;

        const selectedProvider = providerSelection.provider;
        const providerInteraction = providerSelection.interaction;

        const personaAvailableModels = await loadAvailableModelsForProvider(selectedProvider);
        if (!personaAvailableModels?.length) {
          await replyInfoEmbed(providerInteraction, locale, {
            titleKey: "commands.config.model.text.no_models_title",
            descriptionKey: "commands.config.model.text.no_models_description",
            color: ColorCode.ERROR,
          });
          return;
        }

        const personaModelOptions: SelectOption[] = personaAvailableModels.map((m) => ({
          label: safeSelectOptionText(m.llm_codename),
          value: safeSelectOptionText(m.llm_codename),
          description: safeSelectOptionText(getLocalizedDescription(m, userData.language_pref)),
        }));

        const personaModalResult = await promptWithPaginatedModal(providerInteraction, locale, {
          modalCustomId: "config_model_text_persona_modal",
          modalTitleKey: "commands.config.model.text.modal_title",
          components: [
            {
              customId: MODEL_SELECT_ID,
              labelKey: "commands.config.model.text.select_label",
              descriptionKey: "commands.config.model.text.select_description",
              placeholder: "commands.config.model.text.select_placeholder",
              required: true,
              options: personaModelOptions,
            },
          ],
        });

        if (personaModalResult.outcome !== "submit") {
          await replyComponentsV2Status(
            interaction,
            locale,
            "general.pagination.select_persona_title",
            "general.pagination.reloading_persona_picker",
            ColorCode.INFO,
          );
          continue;
        }

        // biome-ignore lint/style/noNonNullAssertion: submit outcome guarantees values
        const personaModalInteraction = personaModalResult.interaction!;
        const selectedPersonaCodename = personaModalResult.values?.[MODEL_SELECT_ID];
        const selectedPersonaModel =
          personaAvailableModels.find((m) => m.llm_codename === selectedPersonaCodename) ?? null;

        if (!selectedPersonaModel?.llm_id) {
          await replyInfoEmbed(personaModalInteraction, locale, {
            titleKey: "commands.config.model.text.invalid_model_title",
            descriptionKey: "commands.config.model.text.invalid_model_description",
            color: ColorCode.ERROR,
          });
          return;
        }

        const personaWriteOk = await setPersonaLlmOverride(selectedPersona.tomori_id, selectedPersonaModel.llm_id);
        if (!personaWriteOk) {
          await replyInfoEmbed(personaModalInteraction, locale, {
            titleKey: "general.errors.update_failed_title",
            descriptionKey: "general.errors.update_failed_description",
            color: ColorCode.ERROR,
          });
          return;
        }

        invalidateTomoriStateCache(serverId);
        await acknowledgeModalSubmitForRefresh(personaModalInteraction);
        await replyComponentsV2Status(
          interaction,
          locale,
          "commands.config.model.text.success_title",
          "commands.config.model.text.scope_set_persona_success",
          ColorCode.SUCCESS,
          {
            persona: selectedPersona.tomori_nickname,
            model: selectedPersonaModel.llm_codename,
          },
          "general.pagination.reloading_persona_picker",
        );
      }
    }

    // 3. Global scope: provider picker → (custom capabilities || model picker) → Phase A mirror write
    providerSelection = await promptForSavedProvider(interaction, locale, savedProviders);
    if (!providerSelection) return;

    const selectedProvider = providerSelection.provider;
    const responseInteraction = providerSelection.interaction;
    const selectedSavedConfig = savedProviders.find((p) => p.provider.toLowerCase() === selectedProvider) ?? null;

    // 3a. Custom provider: reconfigure capabilities for the saved custom endpoint
    if (isCustomProvider(selectedProvider)) {
      if (responseInteraction.isChatInputCommand()) {
        await responseInteraction.deferReply({ flags: MessageFlags.Ephemeral });
      } else if (!responseInteraction.deferred && !responseInteraction.replied) {
        // ButtonInteraction from the provider picker — acknowledge in-place so
        // promptCustomCapabilities can editReply() on it
        await (responseInteraction as ButtonInteraction).deferUpdate();
      }

      const capabilitiesResult = await promptCustomCapabilities(
        responseInteraction as unknown as import("discord.js").ModalSubmitInteraction,
        locale,
        serverId,
      );

      if (!capabilitiesResult.success) {
        await replyInfoEmbed(responseInteraction, locale, {
          titleKey: "general.errors.operation_failed_title",
          description: capabilitiesResult.error || localizer(locale, "commands.config.custom.capabilities_timeout"),
          color: ColorCode.ERROR,
        });
        return;
      }

      const llmIdToSet = capabilitiesResult.llmId ?? selectedSavedConfig?.llm_id ?? null;
      if (llmIdToSet) {
        const [updatedRow] = await sql`
          UPDATE tomori_configs
          SET llm_id = ${llmIdToSet},
              api_key = ${selectedSavedConfig?.api_key ?? null},
              key_version = ${selectedSavedConfig?.key_version ?? 1},
              custom_model_name = ${capabilitiesResult.modelName || null},
              custom_endpoint_url = ${selectedSavedConfig?.custom_endpoint_url ?? null},
              custom_num_ctx = ${capabilitiesResult.numCtx ?? null}
          WHERE server_id = ${tomoriState.server_id}
          RETURNING *
        `;

        if (!updatedRow) {
          await replyInfoEmbed(responseInteraction, locale, {
            titleKey: "general.errors.update_failed_title",
            descriptionKey: "general.errors.update_failed_description",
            color: ColorCode.ERROR,
          });
          return;
        }
      }

      log.info(
        `Custom model capabilities updated: tools=${capabilitiesResult.hasTools}, images=${capabilitiesResult.seesImages}, videos=${capabilitiesResult.seesVideos}, structOutput=${capabilitiesResult.supportsStructOutput}`,
      );
      invalidateTomoriStateCache(serverId);

      const enabledCapabilities: string[] = [];
      if (capabilitiesResult.hasTools)
        enabledCapabilities.push(localizer(locale, "commands.config.custom.capability_tools_label"));
      if (capabilitiesResult.seesImages)
        enabledCapabilities.push(localizer(locale, "commands.config.custom.capability_images_label"));
      if (capabilitiesResult.seesVideos)
        enabledCapabilities.push(localizer(locale, "commands.config.custom.capability_videos_label"));
      if (capabilitiesResult.supportsStructOutput)
        enabledCapabilities.push(localizer(locale, "commands.config.custom.capability_structoutput_label"));

      const capabilitiesDisplay =
        enabledCapabilities.length > 0 ? enabledCapabilities.join(", ") : localizer(locale, "general.none");

      await replyInfoEmbed(responseInteraction, locale, {
        titleKey: "commands.config.model.text.custom_updated_title",
        descriptionKey: "commands.config.model.text.custom_updated_description",
        descriptionVars: {
          model_name: capabilitiesResult.modelName || DEFAULT_CUSTOM_MODEL_NAME,
          capabilities: capabilitiesDisplay,
        },
        color: ColorCode.SUCCESS,
      });
      return;
    }

    // 3b. Regular provider: model picker
    const availableModels = await loadAvailableModelsForProvider(selectedProvider);
    if (!availableModels?.length) {
      await replyInfoEmbed(responseInteraction, locale, {
        titleKey: "commands.config.model.text.no_models_title",
        descriptionKey: "commands.config.model.text.no_models_description",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modelSelectOptions: SelectOption[] = availableModels.map((model) => ({
      label: safeSelectOptionText(model.llm_codename),
      value: safeSelectOptionText(model.llm_codename),
      description: safeSelectOptionText(getLocalizedDescription(model, userData.language_pref)),
    }));

    const modalResult = await promptWithPaginatedModal(responseInteraction, locale, {
      modalCustomId: MODAL_CUSTOM_ID,
      modalTitleKey: "commands.config.model.text.modal_title",
      components: [
        {
          customId: MODEL_SELECT_ID,
          labelKey: "commands.config.model.text.select_label",
          descriptionKey: "commands.config.model.text.select_description",
          placeholder: "commands.config.model.text.select_placeholder",
          required: true,
          options: modelSelectOptions,
        },
      ],
    });

    if (modalResult.outcome !== "submit") {
      log.info(`Model selection modal ${modalResult.outcome} for user ${userData.user_id}`);
      return;
    }

    // biome-ignore lint/style/noNonNullAssertion: submit outcome guarantees values
    modalSubmitInteraction = modalResult.interaction!;
    // biome-ignore lint/style/noNonNullAssertion: submit outcome guarantees values
    const selectedModelCodename = modalResult.values![MODEL_SELECT_ID];
    selectedModel = availableModels.find((model) => model.llm_codename === selectedModelCodename) ?? null;

    if (!selectedModel?.llm_id) {
      const context: ErrorContext = {
        tomoriId: tomoriState.tomori_id,
        serverId: tomoriState.server_id,
        userId: userData.user_id,
        errorType: "CommandExecutionError",
        metadata: {
          command: "config model text",
          guildId: interaction.guild?.id ?? interaction.user.id,
          requestedModel: selectedModelCodename,
          availableModels: availableModels.map((m) => m.llm_codename),
        },
      };
      await log.error(
        "Selected model codename not found in available LLMs from DB",
        new Error("Invalid model selection despite modal choices"),
        context,
      );
      await replyInfoEmbed(modalSubmitInteraction, locale, {
        titleKey: "commands.config.model.text.invalid_model_title",
        descriptionKey: "commands.config.model.text.invalid_model_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    // Special handling for other-model (OpenRouter custom model name entry)
    if (selectedModel.llm_codename === "other-model") {
      try {
        const { promptOtherModelConfig } = await import("../../../utils/discord/customProviderModal");
        const { getOrFetchOpenRouterCapabilities } = await import("../../../utils/cache/openrouterCapabilityCache");

        await modalSubmitInteraction.deferReply({ flags: MessageFlags.Ephemeral });

        const promptResult = await promptOtherModelConfig(modalSubmitInteraction, locale);
        if (!promptResult.success || !promptResult.modelName) {
          await replyInfoEmbed(modalSubmitInteraction, locale, {
            titleKey: "general.interaction.timeout_title",
            descriptionKey: "general.interaction.timeout_description",
            color: ColorCode.ERROR,
          });
          return;
        }

        const enteredModelName = promptResult.modelName;

        await replyInfoEmbed(modalSubmitInteraction, locale, {
          titleKey: "commands.config.model.text.other_model_validating_title",
          descriptionKey: "commands.config.model.text.other_model_validating_description",
          descriptionVars: { model_name: enteredModelName },
          color: ColorCode.INFO,
        });

        const capabilities = await getOrFetchOpenRouterCapabilities(enteredModelName);
        if (!capabilities) {
          await replyInfoEmbed(modalSubmitInteraction, locale, {
            titleKey: "commands.config.model.text.other_model_validation_failed_title",
            descriptionKey: "commands.config.model.text.other_model_validation_failed_description",
            descriptionVars: { model_name: enteredModelName },
            color: ColorCode.ERROR,
          });
          return;
        }

        const now = new Date();
        await sql`
          UPDATE tomori_configs
          SET llm_id = ${selectedModel.llm_id},
              api_key = ${selectedSavedConfig?.api_key ?? null},
              key_version = ${selectedSavedConfig?.key_version ?? 1},
              other_model_codename = ${enteredModelName},
              other_model_capabilities = ${JSON.stringify(capabilities)}::jsonb,
              other_model_capabilities_fetched_at = ${now}
          WHERE server_id = ${tomoriState.server_id}
        `;

        invalidateTomoriStateCache(serverId);

        const capabilityFlags: string[] = [];
        if (capabilities.hasTools) capabilityFlags.push("TOOLS");
        if (capabilities.seesImages) capabilityFlags.push("IMG");
        if (capabilities.seesVideos) capabilityFlags.push("VID");
        if (capabilities.supportsStructuredOutput) capabilityFlags.push("STRUCT");
        const capabilitiesDisplay =
          capabilityFlags.length > 0 ? capabilityFlags.join(" + ") : localizer(locale, "general.none");

        await replyInfoEmbed(modalSubmitInteraction, locale, {
          titleKey: "commands.config.model.text.other_model_configured_title",
          descriptionKey: "commands.config.model.text.other_model_configured_description",
          descriptionVars: { model_name: enteredModelName, capabilities: capabilitiesDisplay },
          color: ColorCode.SUCCESS,
        });
        return;
      } catch (error) {
        await log.error(`Error configuring other-model for user ${userData.user_disc_id}`, error as Error);
        await replyInfoEmbed(modalSubmitInteraction, locale, {
          titleKey: "general.errors.unknown_error_title",
          descriptionKey: "general.errors.unknown_error_description",
          color: ColorCode.ERROR,
        });
        return;
      }
    }

    if (selectedModel.llm_id === tomoriState.config.llm_id) {
      await replyInfoEmbed(modalSubmitInteraction, locale, {
        titleKey: "commands.config.model.text.already_selected_title",
        descriptionKey: "commands.config.model.text.already_selected_description",
        descriptionVars: { model_name: selectedModel.llm_codename },
        color: ColorCode.WARN,
      });
      return;
    }

    // Phase A mirror write: copy credentials and samplers from saved_provider_configs into tomori_configs
    // so the existing runtime (which reads tomori_configs) continues to work without modification.
    const resolvedLogitBiases = resolveLogitBiasEntriesForLlm(
      selectedSavedConfig?.llm_logit_biases ?? tomoriState.config.llm_logit_biases ?? [],
      selectedModel,
    );
    const resolvedLogitBiasesJson = JSON.stringify(resolvedLogitBiases.entries);
    const clearFallbacks = tomoriState.llm?.llm_provider?.toLowerCase() !== selectedProvider;
    const fallbackLlmIdsJson = clearFallbacks ? "[]" : JSON.stringify(selectedSavedConfig?.fallback_llm_ids ?? []);
    const disabledParamsLiteral = `{${(selectedSavedConfig?.llm_disabled_params ?? []).map((param) => `"${param.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;

    const [updatedRow] = await sql`
      UPDATE tomori_configs
      SET llm_id = ${selectedModel.llm_id},
          api_key = ${selectedSavedConfig?.api_key ?? null},
          key_version = ${selectedSavedConfig?.key_version ?? 1},
          thinking_level = ${selectedSavedConfig?.thinking_level ?? "auto"},
          fallback_llm_ids = ${fallbackLlmIdsJson}::jsonb,
          llm_temperature = ${selectedSavedConfig?.llm_temperature ?? tomoriState.config.llm_temperature ?? 1.0},
          llm_top_p = ${selectedSavedConfig?.llm_top_p ?? tomoriState.config.llm_top_p ?? 0.95},
          llm_top_k = ${selectedSavedConfig?.llm_top_k ?? tomoriState.config.llm_top_k ?? 0},
          llm_frequency_penalty = ${selectedSavedConfig?.llm_frequency_penalty ?? tomoriState.config.llm_frequency_penalty ?? 0.0},
          llm_presence_penalty = ${selectedSavedConfig?.llm_presence_penalty ?? tomoriState.config.llm_presence_penalty ?? 0.0},
          llm_min_p = ${selectedSavedConfig?.llm_min_p ?? tomoriState.config.llm_min_p ?? 0.05},
          llm_disabled_params = ${disabledParamsLiteral}::text[],
          llm_logit_biases = ${resolvedLogitBiasesJson}::jsonb,
          custom_model_name = NULL,
          custom_endpoint_url = NULL,
          custom_num_ctx = NULL
      WHERE server_id = ${tomoriState.server_id}
      RETURNING *
    `;

    const validatedConfig = tomoriConfigSchema.safeParse(updatedRow);
    if (!validatedConfig.success || !updatedRow) {
      const context: ErrorContext = {
        tomoriId: tomoriState.tomori_id,
        serverId: tomoriState.server_id,
        userId: userData.user_id,
        errorType: "DatabaseUpdateError",
        metadata: {
          command: "config model text",
          guildId: interaction.guild?.id ?? interaction.user.id,
          selectedModelCodename,
          targetLlmId: selectedModel.llm_id,
          validationErrors: validatedConfig.success ? null : validatedConfig.error.flatten(),
        },
      };
      await log.error(
        "Failed to update or validate LLM config after DB update",
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

    invalidateTomoriStateCache(serverId);

    // Auto-apply default NAI sampling preset when switching to Kayra or Erato
    const naiDefaultPresets: Record<string, { name: string; target: "kayra" | "erato" }> = {
      "kayra-v1": { name: "Carefree-Kayra", target: "kayra" },
      "llama-3-erato-v1": { name: "Erato-Shosetsu", target: "erato" },
    };
    const defaultPresetEntry = naiDefaultPresets[selectedModel.llm_codename];
    if (defaultPresetEntry) {
      const naiPresets = await loadNaiPresetsForModel(defaultPresetEntry.target);
      const defaultPreset = naiPresets.find((p) => p.preset_name === defaultPresetEntry.name);
      if (defaultPreset) {
        await applyNaiPreset(tomoriState.server_id, defaultPreset, selectedModel.llm_codename);
      } else {
        log.warn(
          `Default NAI preset "${defaultPresetEntry.name}" not found in DB. Was seed.sql run? Skipping auto-apply.`,
        );
      }
    }

    const previousModel = tomoriState.llm;
    const successOptions = {
      titleKey: "commands.config.model.text.success_title",
      descriptionKey: "commands.config.model.text.success_description",
      descriptionVars: {
        model_name: selectedModel.llm_codename,
        previous_model: previousModel?.llm_codename ?? localizer(locale, "general.unknown"),
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
    const context: ErrorContext = {
      userId: userData.user_id,
      serverId: tomoriState.server_id,
      tomoriId: tomoriState.tomori_id,
      errorType: "CommandExecutionError",
      metadata: {
        command: "config model text",
        guildId: interaction.guild?.id ?? interaction.user.id,
        executorDiscordId: interaction.user.id,
        targetLlmIdAttempted: selectedModel?.llm_id,
      },
    };
    await log.error(`Error executing /config model text for user ${userData.user_disc_id}`, error as Error, context);

    const replyTarget = modalSubmitInteraction ?? interaction;
    await replyInfoEmbed(replyTarget, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
