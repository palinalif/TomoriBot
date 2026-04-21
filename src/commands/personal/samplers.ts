import type { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags } from "discord.js";
import { THINKING_LEVEL_VALUES, type ThinkingLevelValue, isThinkingLevelValue } from "@/constants/thinkingLevels";
import type { ErrorContext, UserRow } from "@/types/db/schema";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { getAllProviderChoices, getProviderDisplayName } from "@/utils/provider/providerInfoRegistry";
import { localizer } from "@/utils/text/localizer";
import { loadActivePersonalTextProvider, loadPersonalProviderOrNull } from "@/utils/provider/personalProviderHelpers";
import { upsertUserSavedProviderConfig } from "@/utils/db/dbWrite";

function formatChangedSettings(locale: string, settings: Array<{ label: string; value: string }>): string {
  return (
    settings.map((setting) => `${setting.label}=\`${setting.value}\``).join(", ") || localizer(locale, "general.none")
  );
}

function getChangedSettingLabel(locale: string, setting: string): string {
  const labelKeys: Record<string, string> = {
    temperature: "commands.config.samplers.sampler_temperature_label",
    top_p: "commands.config.samplers.sampler_top_p_label",
    top_k: "commands.config.samplers.sampler_top_k_label",
    frequency_penalty: "commands.config.samplers.sampler_frequency_penalty_label",
    presence_penalty: "commands.config.samplers.sampler_presence_penalty_label",
    min_p: "commands.config.samplers.sampler_min_p_label",
    thinking_level: "commands.config.thinking-level.select_label",
  };

  return localizer(locale, labelKeys[setting] ?? "general.unknown");
}

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("samplers")
    .setDescription(localizer("en-US", "commands.personal.samplers.description"))
    .addStringOption((option) =>
      option
        .setName("provider")
        .setDescription(localizer("en-US", "commands.personal.samplers.provider_description"))
        .setRequired(false)
        .addChoices(...getAllProviderChoices()),
    )
    .addNumberOption((option) =>
      option
        .setName("temperature")
        .setDescription(localizer("en-US", "commands.config.samplers.temperature_description"))
        .setMinValue(0)
        .setMaxValue(2)
        .setRequired(false),
    )
    .addNumberOption((option) =>
      option
        .setName("top_p")
        .setDescription(localizer("en-US", "commands.config.samplers.top_p_description"))
        .setMinValue(0)
        .setMaxValue(1)
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName("top_k")
        .setDescription(localizer("en-US", "commands.config.samplers.top_k_description"))
        .setMinValue(0)
        .setMaxValue(40)
        .setRequired(false),
    )
    .addNumberOption((option) =>
      option
        .setName("frequency_penalty")
        .setDescription(localizer("en-US", "commands.config.samplers.frequency_penalty_description"))
        .setMinValue(-2)
        .setMaxValue(2)
        .setRequired(false),
    )
    .addNumberOption((option) =>
      option
        .setName("presence_penalty")
        .setDescription(localizer("en-US", "commands.config.samplers.presence_penalty_description"))
        .setMinValue(-2)
        .setMaxValue(2)
        .setRequired(false),
    )
    .addNumberOption((option) =>
      option
        .setName("min_p")
        .setDescription(localizer("en-US", "commands.config.samplers.min_p_description"))
        .setMinValue(0)
        .setMaxValue(1)
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("thinking_level")
        .setDescription(localizer("en-US", "commands.config.samplers.thinking_level_description"))
        .setRequired(false)
        .addChoices(
          ...THINKING_LEVEL_VALUES.map((value) => ({
            name: localizer("en-US", `commands.config.thinking-level.choice_${value}`),
            value,
          })),
        ),
    );

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
    const requestedProvider = interaction.options.getString("provider")?.trim().toLowerCase() ?? null;
    const savedConfig = requestedProvider
      ? await loadPersonalProviderOrNull(userData.user_id, requestedProvider)
      : await loadActivePersonalTextProvider(userData.user_id);

    if (!savedConfig) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.personal.samplers.no_provider_title",
        descriptionKey: "commands.personal.samplers.no_provider_description",
        color: ColorCode.WARN,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const nextThinkingLevel = interaction.options.getString("thinking_level");
    if (nextThinkingLevel && !isThinkingLevelValue(nextThinkingLevel)) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.operation_failed_title",
        descriptionKey: "commands.config.thinking-level.invalid_value_description",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const nextConfig = {
      ...savedConfig,
      llm_temperature: interaction.options.getNumber("temperature") ?? savedConfig.llm_temperature,
      llm_top_p: interaction.options.getNumber("top_p") ?? savedConfig.llm_top_p,
      llm_top_k: interaction.options.getInteger("top_k") ?? savedConfig.llm_top_k,
      llm_frequency_penalty: interaction.options.getNumber("frequency_penalty") ?? savedConfig.llm_frequency_penalty,
      llm_presence_penalty: interaction.options.getNumber("presence_penalty") ?? savedConfig.llm_presence_penalty,
      llm_min_p: interaction.options.getNumber("min_p") ?? savedConfig.llm_min_p,
      thinking_level: (nextThinkingLevel as ThinkingLevelValue | null) ?? savedConfig.thinking_level,
    };

    const changedSettings: Array<{ label: string; value: string }> = [];
    if (interaction.options.getNumber("temperature") !== null) {
      changedSettings.push({
        label: getChangedSettingLabel(locale, "temperature"),
        value: String(nextConfig.llm_temperature),
      });
    }
    if (interaction.options.getNumber("top_p") !== null) {
      changedSettings.push({ label: getChangedSettingLabel(locale, "top_p"), value: String(nextConfig.llm_top_p) });
    }
    if (interaction.options.getInteger("top_k") !== null) {
      changedSettings.push({ label: getChangedSettingLabel(locale, "top_k"), value: String(nextConfig.llm_top_k) });
    }
    if (interaction.options.getNumber("frequency_penalty") !== null) {
      changedSettings.push({
        label: getChangedSettingLabel(locale, "frequency_penalty"),
        value: String(nextConfig.llm_frequency_penalty),
      });
    }
    if (interaction.options.getNumber("presence_penalty") !== null) {
      changedSettings.push({
        label: getChangedSettingLabel(locale, "presence_penalty"),
        value: String(nextConfig.llm_presence_penalty),
      });
    }
    if (interaction.options.getNumber("min_p") !== null) {
      changedSettings.push({ label: getChangedSettingLabel(locale, "min_p"), value: String(nextConfig.llm_min_p) });
    }
    if (nextThinkingLevel) {
      changedSettings.push({
        label: getChangedSettingLabel(locale, "thinking_level"),
        value: nextConfig.thinking_level,
      });
    }

    if (changedSettings.length === 0) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.config.samplers.no_changes_title",
        descriptionKey: "commands.config.samplers.no_changes_description",
        color: ColorCode.WARN,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const writeOk = await upsertUserSavedProviderConfig(userData.user_id, nextConfig);
    if (!writeOk) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await replyInfoEmbed(interaction, locale, {
      titleKey: "commands.personal.samplers.success_title",
      descriptionKey: "commands.personal.samplers.success_description",
      descriptionVars: {
        provider: getProviderDisplayName(savedConfig.provider),
        settings: formatChangedSettings(locale, changedSettings),
      },
      color: ColorCode.SUCCESS,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      errorType: "CommandExecutionError",
      metadata: {
        command: "personal samplers",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error("Error executing /personal samplers", error as Error, context);
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
