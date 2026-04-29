import type { ButtonInteraction, ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags } from "discord.js";
import type { ErrorContext, UserRow } from "@/types/db/schema";
import { getCachedTomoriState, invalidateTomoriStateCache } from "@/utils/cache/tomoriStateCache";
import { sql } from "@/utils/db/client";
import { upsertSavedProviderConfig } from "@/utils/db/dbWrite";
import { createStandardEmbed } from "@/utils/discord/embedHelper";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { ColorCode, log } from "@/utils/misc/logger";
import { getProviderDisplayName } from "@/utils/provider/providerInfoRegistry";
import { loadSavedProvidersForCapability } from "@/utils/provider/savedProviderConfig";
import {
  formatStopStringForDisplay,
  MAX_STOP_STRING_LENGTH,
  MAX_STOP_STRINGS_PER_PROVIDER,
  mergeConfiguredStopStrings,
  parseCommaSeparatedStopStrings,
} from "@/utils/provider/stopStringConfig";
import { localizer } from "@/utils/text/localizer";
import { promptForSavedProvider } from "@/commands/config/model/providerPicker";

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("add")
    .setDescription(localizer("en-US", "commands.config.stop-strings.add.description"))
    .addStringOption((option) =>
      option
        .setName("strings")
        .setDescription(localizer("en-US", "commands.config.stop-strings.add.strings_description"))
        .setRequired(true)
        .setMaxLength(1000),
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

  const guildKey = interaction.guild?.id ?? interaction.user.id;
  const tomoriState = await getCachedTomoriState(guildKey);
  if (!tomoriState) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.tomori_not_setup_title",
      descriptionKey: "general.errors.tomori_not_setup_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const rawInput = interaction.options.getString("strings", true);
    const parsedStops = parseCommaSeparatedStopStrings(rawInput);
    const tooLongStop = parsedStops.find((stop) => stop.length > MAX_STOP_STRING_LENGTH);

    if (parsedStops.length === 0) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.config.stop-strings.add.invalid_title",
        descriptionKey: "commands.config.stop-strings.add.invalid_description",
        color: ColorCode.WARN,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (tooLongStop) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.config.stop-strings.add.too_long_title",
        descriptionKey: "commands.config.stop-strings.add.too_long_description",
        descriptionVars: {
          max_length: MAX_STOP_STRING_LENGTH.toString(),
          stop_string: formatStopStringForDisplay(tooLongStop).slice(0, 80),
        },
        color: ColorCode.WARN,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const savedProviders = await loadSavedProvidersForCapability(tomoriState.server_id, "text");
    const providerSelection = await promptForSavedProvider(interaction, locale, savedProviders, {
      descriptionKey: "commands.config.stop-strings.add.picker_description",
    });
    if (!providerSelection) return;

    const selectedProvider = providerSelection.provider;
    const responseInteraction = providerSelection.interaction;
    const savedConfig = savedProviders.find((provider) => provider.provider.toLowerCase() === selectedProvider) ?? null;
    if (!savedConfig) {
      await replyWithResult(interaction, responseInteraction, Boolean(providerSelection.pickerInteraction), locale, {
        titleKey: "general.errors.operation_failed_title",
        descriptionKey: "general.errors.unknown_error_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    const existingStops = savedConfig.llm_stop_strings ?? [];
    const mergedStops = mergeConfiguredStopStrings(existingStops, parsedStops);
    if (mergedStops.length > MAX_STOP_STRINGS_PER_PROVIDER) {
      await replyWithResult(interaction, responseInteraction, Boolean(providerSelection.pickerInteraction), locale, {
        titleKey: "commands.config.stop-strings.add.too_many_title",
        descriptionKey: "commands.config.stop-strings.add.too_many_description",
        descriptionVars: {
          max_count: MAX_STOP_STRINGS_PER_PROVIDER.toString(),
          current_count: existingStops.length.toString(),
          added_count: parsedStops.length.toString(),
        },
        color: ColorCode.WARN,
      });
      return;
    }

    const addedStops = mergedStops.filter((stop) => !existingStops.includes(stop));
    if (addedStops.length === 0) {
      await replyWithResult(interaction, responseInteraction, Boolean(providerSelection.pickerInteraction), locale, {
        titleKey: "commands.config.stop-strings.add.no_changes_title",
        descriptionKey: "commands.config.stop-strings.add.no_changes_description",
        color: ColorCode.WARN,
      });
      return;
    }

    const nextConfig = {
      ...savedConfig,
      llm_stop_strings: mergedStops,
    };
    const upserted = await upsertSavedProviderConfig(tomoriState.server_id, nextConfig);
    if (!upserted) {
      await replyWithResult(interaction, responseInteraction, Boolean(providerSelection.pickerInteraction), locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    if (selectedProvider === tomoriState.llm.llm_provider.toLowerCase()) {
      await sql`
        UPDATE tomori_configs
        SET llm_stop_strings = ${toPostgresTextArrayLiteral(mergedStops)}::text[]
        WHERE server_id = ${tomoriState.server_id}
      `;
    }

    invalidateTomoriStateCache(guildKey);

    await replyWithResult(interaction, responseInteraction, Boolean(providerSelection.pickerInteraction), locale, {
      titleKey: "commands.config.stop-strings.add.success_title",
      descriptionKey: "commands.config.stop-strings.add.success_description",
      descriptionVars: {
        provider: getProviderDisplayName(selectedProvider),
        added_count: addedStops.length.toString(),
        stop_strings: formatStopStringList(addedStops, locale),
      },
      color: ColorCode.SUCCESS,
    });
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      serverId: tomoriState.server_id,
      tomoriId: tomoriState.tomori_id,
      errorType: "CommandExecutionError",
      metadata: {
        command: "config stop-strings add",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error(
      `Error executing /config stop-strings add for user ${userData.user_disc_id}`,
      error as Error,
      context,
    );

    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}

function toPostgresTextArrayLiteral(values: readonly string[]): string {
  return `{${values.map((value) => `"${value.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;
}

function formatStopStringList(stops: readonly string[], locale: string): string {
  const visibleStops = stops.slice(0, 8).map((stop) => `\`${formatStopStringForDisplay(stop)}\``);
  if (stops.length > visibleStops.length) {
    visibleStops.push(
      localizer(locale, "commands.config.stop-strings.add.more_added", {
        count: stops.length - visibleStops.length,
      }),
    );
  }
  return visibleStops.join(", ");
}

async function replyWithResult(
  interaction: ChatInputCommandInteraction,
  responseInteraction: ChatInputCommandInteraction | ButtonInteraction,
  usedPicker: boolean,
  locale: string,
  options: Parameters<typeof replyInfoEmbed>[2],
): Promise<void> {
  if (usedPicker) {
    await (responseInteraction as ButtonInteraction).update({
      embeds: [createStandardEmbed(locale, options)],
      components: [],
    });
    return;
  }

  await replyInfoEmbed(interaction, locale, { ...options, flags: MessageFlags.Ephemeral });
}
