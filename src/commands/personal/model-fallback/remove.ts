import type { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags } from "discord.js";
import type { ErrorContext, UserRow } from "@/types/db/schema";
import { replyInfoEmbed, promptWithRawModal } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { localizer } from "@/utils/text/localizer";
import { loadActivePersonalTextProvider } from "@/utils/provider/personalProviderHelpers";
import { upsertUserSavedProviderConfig } from "@/utils/db/dbWrite";
import type { CheckboxGroupOption } from "@/types/discord/modal";

const FALLBACK_CHECKBOX_ID = "personal_fallback_checkbox_group";

function buildFallbackOptions(currentFallbacks: number[]): CheckboxGroupOption[] {
  return currentFallbacks.map((llmId, index) => ({
    value: index.toString(),
    label: `${index + 1}. ${llmId}`,
    description: `${llmId}`,
    default: true,
  }));
}

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("remove")
    .setDescription(localizer("en-US", "commands.personal.model-fallback.remove.description"));

export async function execute(
  _client: Client,
  interaction: ChatInputCommandInteraction,
  userData: UserRow,
  locale: string,
): Promise<void> {
  if (!userData.user_id) {
    return;
  }

  try {
    const activeProvider = await loadActivePersonalTextProvider(userData.user_id);
    const currentFallbacks = activeProvider?.fallback_llm_ids ?? [];

    if (!activeProvider || currentFallbacks.length === 0) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.personal.model-fallback.remove.none_title",
        descriptionKey: "commands.personal.model-fallback.remove.none_description",
        color: ColorCode.WARN,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modalResult = await promptWithRawModal(
      interaction,
      locale,
      {
        modalCustomId: `personal_model_fallback_remove_${interaction.id}`,
        modalTitleKey: "commands.personal.model-fallback.remove.modal_title",
        components: [
          {
            kind: "checkboxGroup",
            customId: FALLBACK_CHECKBOX_ID,
            labelKey: "commands.personal.model-fallback.remove.checkbox_label",
            descriptionKey: "commands.personal.model-fallback.remove.checkbox_description",
            required: false,
            minValues: 0,
            options: buildFallbackOptions(currentFallbacks),
          },
        ],
      },
      MessageFlags.Ephemeral,
    );

    if (modalResult.outcome !== "submit" || !modalResult.interaction) {
      return;
    }

    const checked = new Set(
      (modalResult.multiValues?.[FALLBACK_CHECKBOX_ID] ?? []).map((value) => Number.parseInt(value, 10)),
    );
    const nextFallbacks = currentFallbacks.filter((_llmId, index) => checked.has(index));

    const writeOk = await upsertUserSavedProviderConfig(userData.user_id, {
      ...activeProvider,
      fallback_llm_ids: nextFallbacks,
    });

    if (!writeOk) {
      await replyInfoEmbed(modalResult.interaction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    await replyInfoEmbed(modalResult.interaction, locale, {
      titleKey: "commands.personal.model-fallback.remove.success_title",
      descriptionKey: "commands.personal.model-fallback.remove.success_description",
      descriptionVars: {
        remaining_count: nextFallbacks.length,
      },
      color: ColorCode.SUCCESS,
    });
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      errorType: "CommandExecutionError",
      metadata: {
        command: "personal model-fallback remove",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error("Error executing /personal model-fallback remove", error as Error, context);
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
