import type { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags } from "discord.js";
import type { ErrorContext, UserRow } from "@/types/db/schema";
import { commandRegistry } from "@/utils/discord/commandRegistry";
import { replySummaryEmbed } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { localizer } from "@/utils/text/localizer";

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand.setName("custom-models").setDescription(localizer("en-US", "commands.help.custom_models.description"));

export async function execute(
  _client: Client,
  interaction: ChatInputCommandInteraction,
  userData: UserRow,
  locale: string,
): Promise<void> {
  try {
    await replySummaryEmbed(interaction, locale, {
      titleKey: "commands.help.custom_models.title",
      descriptionKey: "commands.help.custom_models.description_body",
      color: ColorCode.INFO,
      fields: [
        {
          nameKey: "commands.help.custom_models.server_field",
          value: localizer(locale, "commands.help.custom_models.server_value", {
            add_command: commandRegistry.getCommandMention("config", "custom-models", "add"),
            remove_command: commandRegistry.getCommandMention("config", "custom-models", "remove"),
          }),
          inline: false,
        },
        {
          nameKey: "commands.help.custom_models.personal_field",
          value: localizer(locale, "commands.help.custom_models.personal_value", {
            add_command: commandRegistry.getCommandMention("personal", "custom-models", "add"),
            remove_command: commandRegistry.getCommandMention("personal", "custom-models", "remove"),
          }),
          inline: false,
        },
        {
          nameKey: "commands.help.custom_models.selection_field",
          value: localizer(locale, "commands.help.custom_models.selection_value", {
            text_command: commandRegistry.getCommandMention("config", "model", "text"),
            image_command: commandRegistry.getCommandMention("config", "model", "image"),
            video_command: commandRegistry.getCommandMention("config", "model", "video"),
          }),
          inline: false,
        },
      ],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      errorType: "CommandExecutionError",
      metadata: {
        command: "help custom-models",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error("Error executing /help custom-models", error as Error, context);
    await interaction.reply({
      content: localizer(locale, "general.errors.unknown_error_description"),
      flags: MessageFlags.Ephemeral,
    });
  }
}
