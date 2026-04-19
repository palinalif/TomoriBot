import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import { getCachedTomoriState, invalidateTomoriStateCache } from "@/utils/cache/tomoriStateCache";
import { localizer } from "@/utils/text/localizer";
import { log, ColorCode } from "@/utils/misc/logger";
import { replyInfoEmbed, promptWithRawModal } from "@/utils/discord/interactionHelper";
import { type UserRow, type ErrorContext, tomoriConfigSchema } from "@/types/db/schema";
import type { RadioGroupOption } from "@/types/discord/modal";
import { sql } from "@/utils/db/client";
import { THINKING_LEVEL_VALUES, type ThinkingLevelValue, isThinkingLevelValue } from "@/constants/thinkingLevels";
import { getThinkingLevelLocalizerKey, resolveConfiguredThinkingLevel } from "@/utils/provider/thinkingControl";

const MODAL_CUSTOM_ID = "config_thinking_level_modal";
const THINKING_LEVEL_SELECT_ID = "thinking_level_select";

function createThinkingLevelOptions(locale: string): RadioGroupOption[] {
  return THINKING_LEVEL_VALUES.map((value) => ({
    label: localizer(locale, `commands.config.thinking-level.choice_${value}`),
    value,
    description: localizer(locale, `commands.config.thinking-level.desc_${value}`),
  }));
}

function getThinkingLevelLabel(locale: string, value: string | null | undefined): string {
  return localizer(locale, getThinkingLevelLocalizerKey(value));
}

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand.setName("thinking-level").setDescription(localizer("en-US", "commands.config.thinking-level.description"));

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

  try {
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

    const modalResult = await promptWithRawModal(interaction, locale, {
      modalCustomId: MODAL_CUSTOM_ID,
      modalTitleKey: "commands.config.thinking-level.modal_title",
      components: [
        {
          kind: "radioGroup" as const,
          customId: THINKING_LEVEL_SELECT_ID,
          labelKey: "commands.config.thinking-level.select_label",
          descriptionKey: "commands.config.thinking-level.select_description",
          required: true,
          options: createThinkingLevelOptions(locale),
        },
      ],
    });

    if (modalResult.outcome !== "submit") {
      log.info(`Thinking level selection modal ${modalResult.outcome} for user ${userData.user_id}`);
      return;
    }

    // biome-ignore lint/style/noNonNullAssertion: Modal submission outcome "submit" guarantees these values exist
    const modalSubmitInteraction = modalResult.interaction!;
    await modalSubmitInteraction.deferReply({ flags: MessageFlags.Ephemeral });

    // biome-ignore lint/style/noNonNullAssertion: Modal submission outcome "submit" guarantees these values exist
    const selectedValue = modalResult.values![THINKING_LEVEL_SELECT_ID];
    if (!isThinkingLevelValue(selectedValue)) {
      await replyInfoEmbed(modalSubmitInteraction, locale, {
        titleKey: "general.errors.operation_failed_title",
        descriptionKey: "commands.config.thinking-level.invalid_value_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    const thinkingLevel = selectedValue as ThinkingLevelValue;
    const currentThinkingLevel = resolveConfiguredThinkingLevel(tomoriState.config.thinking_level);
    if (thinkingLevel === currentThinkingLevel) {
      await replyInfoEmbed(modalSubmitInteraction, locale, {
        titleKey: "commands.config.thinking-level.already_set_title",
        descriptionKey: "commands.config.thinking-level.already_set_description",
        descriptionVars: {
          value: getThinkingLevelLabel(locale, thinkingLevel),
        },
        color: ColorCode.WARN,
      });
      return;
    }

    const [updatedRow] = await sql`
      UPDATE tomori_configs
      SET thinking_level = ${thinkingLevel}
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
          command: "config thinking-level",
          guildId: interaction.guild?.id ?? interaction.user.id,
          thinkingLevel,
          validationErrors: validatedConfig.success ? null : validatedConfig.error.flatten(),
        },
      };
      await log.error(
        "Failed to update or validate thinking_level config",
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

    invalidateTomoriStateCache(interaction.guild?.id ?? interaction.user.id);

    await replyInfoEmbed(modalSubmitInteraction, locale, {
      titleKey: "commands.config.thinking-level.success_title",
      descriptionKey: "commands.config.thinking-level.success_description",
      descriptionVars: {
        value: getThinkingLevelLabel(locale, thinkingLevel),
        previous_value: getThinkingLevelLabel(locale, currentThinkingLevel),
      },
      color: ColorCode.SUCCESS,
    });
  } catch (error) {
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
        command: "config thinking-level",
        guildId: interaction.guild?.id ?? interaction.user.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error(
      `Error executing /config thinking-level for user ${userData.user_disc_id}`,
      error as Error,
      context,
    );

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: localizer(locale, "general.errors.unknown_error_description"),
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.followUp({
        content: localizer(locale, "general.errors.unknown_error_description"),
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
