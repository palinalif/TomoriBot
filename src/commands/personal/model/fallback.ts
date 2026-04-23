import type { ChatInputCommandInteraction, ButtonInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { createStandardEmbed } from "@/utils/discord/embedHelper";
import { replyInfoEmbed, promptWithRawModal, safeSelectOptionText } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { localizer } from "@/utils/text/localizer";
import { loadAvailableModelsForProvider } from "@/utils/db/dbRead";
import type { ErrorContext, LlmRow, UserRow } from "@/types/db/schema";
import type { SelectOption } from "@/types/discord/modal";
import { loadActivePersonalTextProvider } from "@/utils/provider/personalProviderHelpers";
import { upsertUserSavedProviderConfig } from "@/utils/db/dbWrite";
import { getProviderDisplayName } from "@/utils/provider/providerInfoRegistry";
import { replyLegacyOpenRouterOtherModelMoved } from "@/utils/discord/openrouterModelMigrationNotice";

const SLOT_IDS = [
  "fallback_slot_1",
  "fallback_slot_2",
  "fallback_slot_3",
  "fallback_slot_4",
  "fallback_slot_5",
] as const;
const SLOT_LABEL_KEYS = [
  "commands.config.model.fallback.slot_1_label",
  "commands.config.model.fallback.slot_2_label",
  "commands.config.model.fallback.slot_3_label",
  "commands.config.model.fallback.slot_4_label",
  "commands.config.model.fallback.slot_5_label",
] as const;
// One select option is reserved for the explicit "None" / clear choice.
const ITEMS_PER_PAGE = 24;
const CLEAR_SLOT_VALUE = "__none__";

function getLocalizedDescription(model: LlmRow, locale: string): string {
  const normalizedLocale = locale.toLowerCase().split("-")[0];
  const description = normalizedLocale === "ja" ? model.ja_description : model.llm_description;
  const baseDescription = description || model.llm_description || `${model.llm_provider} model`;
  const flags: string[] = [];
  if (model.is_free) flags.push("FREE");
  if (model.has_tools) flags.push("TOOLS");
  if (model.sees_images) flags.push("IMG");
  if (model.sees_videos) flags.push("VID");
  if (model.supports_structoutput) flags.push("STRUCT");
  return flags.length > 0 ? `(${flags.join("+")}) ${baseDescription}` : baseDescription;
}

function truncatePlaceholderValue(value: string): string {
  return value.length > 90 ? `${value.slice(0, 87)}...` : value;
}

function buildCurrentFallbackPlaceholder(
  locale: string,
  model: LlmRow | null,
  rawLlmId: number | null,
  otherModelCodename?: string | null,
): string {
  let modelLabel = localizer(locale, "general.none");

  if (model) {
    modelLabel =
      model.llm_codename === "other-model" && otherModelCodename
        ? `other-model -> ${otherModelCodename}`
        : model.llm_codename;
  } else if (rawLlmId !== null) {
    modelLabel = `${localizer(locale, "general.unknown")} (#${rawLlmId})`;
  }

  return localizer(locale, "commands.config.model.fallback.current_placeholder", {
    model: truncatePlaceholderValue(modelLabel),
  });
}

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand.setName("fallback").setDescription(localizer("en-US", "commands.personal.model.fallback.description"));

export async function execute(
  _client: Client,
  interaction: ChatInputCommandInteraction,
  userData: UserRow,
  locale: string,
): Promise<void> {
  if (!interaction.channel) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.channel_only_title",
      descriptionKey: "general.errors.channel_only_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!userData.user_id) {
    return;
  }

  try {
    const activeProvider = await loadActivePersonalTextProvider(userData.user_id);
    if (!activeProvider?.llm_id) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.personal.model.fallback.no_provider_title",
        descriptionKey: "commands.personal.model.fallback.no_provider_description",
        color: ColorCode.WARN,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const availableModels = await loadAvailableModelsForProvider(activeProvider.provider, false, {
      kind: "personal",
      ownerId: userData.user_id,
    });
    if (!availableModels?.length) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.config.model.fallback.no_models_title",
        descriptionKey: "commands.config.model.fallback.no_models_description",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const allModelOptions: SelectOption[] = availableModels.map((model) => ({
      label: safeSelectOptionText(model.llm_codename),
      value: safeSelectOptionText(model.llm_codename),
      description: safeSelectOptionText(getLocalizedDescription(model, userData.language_pref)),
    }));
    const clearOption: SelectOption = {
      label: safeSelectOptionText(localizer(locale, "commands.config.model.fallback.clear_option_label")),
      value: CLEAR_SLOT_VALUE,
      description: safeSelectOptionText(localizer(locale, "commands.config.model.fallback.clear_option_description")),
    };

    let optionsForModal = allModelOptions;
    let modalInteraction: ChatInputCommandInteraction | ButtonInteraction = interaction;

    if (allModelOptions.length > ITEMS_PER_PAGE) {
      const totalPages = Math.ceil(allModelOptions.length / ITEMS_PER_PAGE);
      const pageButtons = Array.from({ length: Math.min(totalPages, 9) }, (_, index) =>
        new ButtonBuilder()
          .setCustomId(`personal_fallback_page_${index + 1}`)
          .setLabel((index + 1).toString())
          .setStyle(ButtonStyle.Primary),
      );

      const pageSelectMessage = await interaction.reply({
        embeds: [
          createStandardEmbed(locale, {
            titleKey: "general.pagination.select_page_title",
            descriptionKey: "general.pagination.select_page_description",
            descriptionVars: {
              totalItems: allModelOptions.length,
              totalPages,
            },
            color: ColorCode.INFO,
          }),
        ],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...pageButtons)],
        flags: MessageFlags.Ephemeral,
      });

      try {
        const pageButtonInteraction = await pageSelectMessage.awaitMessageComponent({
          filter: (componentInteraction) =>
            componentInteraction.user.id === interaction.user.id &&
            componentInteraction.customId.startsWith("personal_fallback_page_"),
          time: 300000,
        });
        const selectedPage = Number.parseInt(pageButtonInteraction.customId.replace("personal_fallback_page_", ""), 10);
        const startIndex = (selectedPage - 1) * ITEMS_PER_PAGE;
        optionsForModal = [clearOption, ...allModelOptions.slice(startIndex, startIndex + ITEMS_PER_PAGE)];
        modalInteraction = pageButtonInteraction as ButtonInteraction;
      } catch {
        await interaction.editReply({ embeds: [], components: [] }).catch(() => {});
        return;
      }
    }

    if (allModelOptions.length <= ITEMS_PER_PAGE) {
      optionsForModal = [clearOption, ...allModelOptions];
    }

    const currentFallbackPlaceholders = SLOT_IDS.map((_, index) => {
      const rawLlmId = activeProvider.fallback_llm_ids[index] ?? null;
      const resolvedModel = rawLlmId ? (availableModels.find((model) => model.llm_id === rawLlmId) ?? null) : null;
      return buildCurrentFallbackPlaceholder(locale, resolvedModel, rawLlmId);
    });

    const modalResult = await promptWithRawModal(
      modalInteraction,
      locale,
      {
        modalCustomId: `personal_model_fallback_modal_${interaction.id}`,
        modalTitleKey: "commands.config.model.fallback.modal_title",
        components: SLOT_IDS.map((customId, index) => ({
          customId,
          labelKey: SLOT_LABEL_KEYS[index],
          placeholder: currentFallbackPlaceholders[index],
          required: false,
          options: optionsForModal,
        })),
      },
      MessageFlags.Ephemeral,
    );

    if (modalResult.outcome !== "submit" || !modalResult.interaction) {
      return;
    }

    const rawSlots = SLOT_IDS.map((id) => {
      const value = (modalResult.values?.[id] ?? "").trim();
      return value === CLEAR_SLOT_VALUE ? "" : value;
    }).filter((value) => value !== "");
    const deduplicatedCodenames = Array.from(new Set(rawSlots));

    if (activeProvider.provider === "openrouter" && deduplicatedCodenames.includes("other-model")) {
      await replyLegacyOpenRouterOtherModelMoved(modalResult.interaction, locale, "personal");
      return;
    }

    const primaryCodename =
      availableModels.find((model) => model.llm_id === activeProvider.llm_id)?.llm_codename ?? null;

    if (primaryCodename && deduplicatedCodenames.some((codename) => codename === primaryCodename)) {
      await replyInfoEmbed(modalResult.interaction, locale, {
        titleKey: "commands.config.model.fallback.primary_conflict_title",
        descriptionKey: "commands.config.model.fallback.primary_conflict_description",
        descriptionVars: { model: primaryCodename },
        color: ColorCode.ERROR,
      });
      return;
    }

    const resolvedModels = deduplicatedCodenames
      .map((codename) => availableModels.find((model) => model.llm_codename === codename) ?? null)
      .filter((model): model is LlmRow => model?.llm_id !== undefined);
    const resolvedIds = resolvedModels
      .map((model) => model.llm_id)
      .filter((llmId): llmId is number => llmId !== undefined);

    const writeOk = await upsertUserSavedProviderConfig(userData.user_id, {
      ...activeProvider,
      fallback_llm_ids: resolvedIds,
    });
    if (!writeOk) {
      await replyInfoEmbed(modalResult.interaction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    if (resolvedIds.length === 0) {
      await replyInfoEmbed(modalResult.interaction, locale, {
        titleKey: "commands.personal.model.fallback.cleared_title",
        descriptionKey: "commands.personal.model.fallback.cleared_description",
        descriptionVars: {
          provider: getProviderDisplayName(activeProvider.provider),
        },
        color: ColorCode.SUCCESS,
      });
      return;
    }

    await replyInfoEmbed(modalResult.interaction, locale, {
      titleKey: "commands.personal.model.fallback.success_title",
      descriptionKey: "commands.personal.model.fallback.success_description",
      descriptionVars: {
        model_list: resolvedModels.map((model, index) => `${index + 1}. \`${model.llm_codename}\``).join("\n"),
        provider: getProviderDisplayName(activeProvider.provider),
      },
      color: ColorCode.SUCCESS,
    });
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      errorType: "CommandExecutionError",
      metadata: {
        command: "personal model fallback",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error("Error executing /personal model fallback", error as Error, context);
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
