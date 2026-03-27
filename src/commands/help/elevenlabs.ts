import type {
  ChatInputCommandInteraction,
  Client,
  SlashCommandSubcommandBuilder,
} from "discord.js";
import { MessageFlags } from "discord.js";
import type { UserRow } from "@/types/db/schema";
import type { ErrorContext } from "@/types/db/schema";
import { localizer } from "@/utils/text/localizer";
import { log, ColorCode } from "@/utils/misc/logger";
import { replySummaryEmbed } from "@/utils/discord/interactionHelper";
import { commandRegistry } from "@/utils/discord/commandRegistry";

/**
 * Configure the /help elevenlabs subcommand
 * Instructions for setting up ElevenLabs text-to-speech
 */
export const configureSubcommand = (
  subcommand: SlashCommandSubcommandBuilder,
) =>
  subcommand
    .setName("elevenlabs")
    .setDescription(
      localizer("en-US", "commands.help.elevenlabs.description"),
    );

/**
 * Execute the /help elevenlabs command
 * Displays ElevenLabs TTS setup instructions
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
  try {
    // Get command mentions for cross-references
    const optionalkeyElevenlabsSetMention = commandRegistry.getCommandMention(
      "optionalkey",
      "elevenlabs",
      "set",
    );
    const configVoiceElevenlabsMention = commandRegistry.getCommandMention(
      "config",
      "voice",
      "elevenlabs",
    );
    const optionalkeyElevenlabsRemoveMention = commandRegistry.getCommandMention(
      "optionalkey",
      "elevenlabs",
      "remove",
    );

    // Use replySummaryEmbed to show ElevenLabs setup guide
    await replySummaryEmbed(
      interaction,
      locale,
      {
        titleKey: "commands.help.elevenlabs.title",
        descriptionKey: "commands.help.elevenlabs.description",
        color: ColorCode.INFO,
        fields: [
          {
            nameKey: "commands.help.elevenlabs.what_is_title",
            value: localizer(
              locale,
              "commands.help.elevenlabs.what_is_description",
            ),
            inline: false,
          },
          {
            nameKey: "commands.help.elevenlabs.getting_key_title",
            value: localizer(
              locale,
              "commands.help.elevenlabs.getting_key_description",
              {
                optionalkeyElevenlabsSet: optionalkeyElevenlabsSetMention,
              },
            ),
            inline: false,
          },
          {
            nameKey: "commands.help.elevenlabs.choosing_voice_title",
            value: localizer(
              locale,
              "commands.help.elevenlabs.choosing_voice_description",
              {
                configVoiceElevenlabs: configVoiceElevenlabsMention,
              },
            ),
            inline: false,
          },
          {
            nameKey: "commands.help.elevenlabs.important_notes_title",
            value: localizer(
              locale,
              "commands.help.elevenlabs.important_notes_description",
            ),
            inline: false,
          },
        ],
        footerKey: "commands.help.elevenlabs.footer",
        footerVars: {
          optionalkeyElevenlabsRemove: optionalkeyElevenlabsRemoveMention,
        },
      },
      MessageFlags.Ephemeral,
    );
  } catch (error) {
    // Log error with context
    const context: ErrorContext = {
      userId: userData.user_id,
      errorType: "CommandExecutionError",
      metadata: {
        commandName: "/help elevenlabs",
        guildDiscordId: interaction.guild?.id,
      },
    };
    await log.error(
      "Error executing /help elevenlabs command",
      error as Error,
      context,
    );

    // Inform user of error (ephemeral)
    const errorMessage = localizer(
      locale,
      "general.errors.unknown_error_description",
    );
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (replyError) {
      // Log if even the error reply fails
      log.error(
        "Failed to send error reply for /help elevenlabs",
        replyError,
        context,
      );
    }
  }
}
