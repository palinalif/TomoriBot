import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import type { SavedProviderConfigRow, UserRow, ErrorContext } from "@/types/db/schema";
import { loadUserSavedProviderConfigs } from "@/utils/db/dbRead";
import { deleteUserSavedProviderConfig } from "@/utils/db/dbWrite";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { getProviderDisplayName } from "@/utils/provider/providerInfoRegistry";
import { localizer } from "@/utils/text/localizer";
import { promptForSavedProvider } from "@/commands/config/model/providerPicker";

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand.setName("remove").setDescription(localizer("en-US", "commands.personal.provider.remove.description"));

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
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const savedProviders = await loadUserSavedProviderConfigs(userData.user_id);
    if (savedProviders.length === 0) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.personal.provider.remove.no_saved_title",
        descriptionKey: "commands.personal.provider.remove.no_saved_description",
        color: ColorCode.WARN,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const selection = await promptForSavedProvider(
      interaction,
      locale,
      savedProviders as unknown as SavedProviderConfigRow[],
      {
        titleKey: "commands.personal.provider.remove.picker_title",
        descriptionKey: "commands.personal.provider.remove.picker_description",
      },
    );
    if (!selection) {
      return;
    }

    const deleted = await deleteUserSavedProviderConfig(userData.user_id, selection.provider);
    if (!deleted) {
      await replyInfoEmbed(selection.interaction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    await replyInfoEmbed(selection.interaction, locale, {
      titleKey: "commands.personal.provider.remove.success_title",
      descriptionKey: "commands.personal.provider.remove.success_description",
      descriptionVars: {
        provider: getProviderDisplayName(selection.provider),
      },
      color: ColorCode.SUCCESS,
    });
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      errorType: "CommandExecutionError",
      metadata: {
        command: "personal provider remove",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error("Error executing /personal provider remove", error as Error, context);

    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
