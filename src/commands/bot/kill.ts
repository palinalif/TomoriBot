import { MessageFlags, type SlashCommandSubcommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, Client } from "discord.js";
import {
	clearChannelProcessingQueue,
	isChannelProcessingLocked,
} from "../../events/messageCreate/tomoriChat";
import type { UserRow } from "../../types/db/schema";
import { replyInfoEmbed } from "../../utils/discord/interactionHelper";
import { StreamOrchestrator } from "../../utils/discord/streamOrchestrator";
import { ColorCode, log } from "../../utils/misc/logger";
import { localizer } from "../../utils/text/localizer";

/**
 * Configure the kill subcommand
 * @param subcommand - The slash command subcommand builder
 * @returns The configured subcommand
 */
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("kill")
		.setDescription(localizer("en-US", "commands.bot.kill.description"));

/**
 * Execute the kill command - stop active stream in this channel without follow-up response
 * @param _client - Discord client instance (unused)
 * @param interaction - Command interaction
 * @param _userData - User data from database (unused)
 * @param locale - Locale of the interaction
 */
export async function execute(
	_client: Client,
	interaction: ChatInputCommandInteraction,
	_userData: UserRow,
	locale: string,
): Promise<void> {
	if (!interaction.channel) {
		await replyInfoEmbed(
			interaction,
			locale,
			{
				titleKey: "general.errors.channel_only_title",
				descriptionKey: "general.errors.channel_only_description",
				color: ColorCode.ERROR,
			},
			MessageFlags.Ephemeral,
		);
		return;
	}

	if (!isChannelProcessingLocked(interaction.channel.id)) {
		await replyInfoEmbed(
			interaction,
			locale,
			{
				titleKey: "commands.bot.kill.nothing_to_stop_title",
				descriptionKey: "commands.bot.kill.nothing_to_stop_description",
				color: ColorCode.WARN,
			},
			MessageFlags.Ephemeral,
		);
		return;
	}

	StreamOrchestrator.requestStop(interaction.channel.id, interaction.user.id);
	const clearedQueueCount = clearChannelProcessingQueue(interaction.channel.id);
	log.info(
		`Silent stop requested via /bot kill by user ${interaction.user.id} in channel ${interaction.channel.id}. Cleared ${clearedQueueCount} queued message(s).`,
	);

	await replyInfoEmbed(
		interaction,
		locale,
		{
			titleKey: "commands.bot.kill.success_title",
			descriptionKey: "commands.bot.kill.success_description",
			color: ColorCode.SUCCESS,
		},
		MessageFlags.Ephemeral,
	);
}
