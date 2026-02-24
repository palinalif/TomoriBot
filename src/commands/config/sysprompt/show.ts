/**
 * Command: /config sysprompt show
 * Displays the current custom system prompt, or the default if none is set.
 */

import type { ChatInputCommandInteraction, Client } from "discord.js";
import { MessageFlags, SlashCommandSubcommandBuilder } from "discord.js";
import type { UserRow } from "@/types/db/schema";
import { getCachedTomoriState } from "@/utils/cache/tomoriStateCache";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { DEFAULT_SYSTEM_PROMPT } from "@/utils/text/contextBuilder";
import { localizer } from "@/utils/text/localizer";

/** Maximum characters to show inline before truncating with an ellipsis */
const MAX_PROMPT_PREVIEW = Number.parseInt(
	process.env.SYSPROMPT_SHOW_MAX_PREVIEW || "3800",
	10,
);

/**
 * Configure the slash command subcommand metadata
 * @returns Configured SlashCommandSubcommandBuilder
 */
export function configureSubcommand(): SlashCommandSubcommandBuilder {
	return new SlashCommandSubcommandBuilder()
		.setName("show")
		.setDescription(
			localizer("en-US", "commands.config.sysprompt.show.description"),
		);
}

/**
 * Execute the /config sysprompt show command.
 * Shows the active system prompt (custom or default) in an ephemeral embed.
 * @param _client - Discord client (unused)
 * @param interaction - Chat input command interaction
 * @param _userData - User data from database (unused)
 * @param locale - User's locale for localization
 */
export async function execute(
	_client: Client,
	interaction: ChatInputCommandInteraction,
	_userData: UserRow,
	locale: string,
): Promise<void> {
	// 1. Defer before async work to prevent interaction timeout
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	try {
		// 2. Resolve server context (guild or DM)
		const serverId = interaction.guildId ?? interaction.user.id;
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

		const customPrompt = tomoriState.config.system_prompt;

		if (customPrompt) {
			// 3a. Truncate if prompt exceeds embed description limit
			const preview =
				customPrompt.length > MAX_PROMPT_PREVIEW
					? `${customPrompt.slice(0, MAX_PROMPT_PREVIEW)}...`
					: customPrompt;

			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.config.prompt.show.custom_title",
				descriptionKey: "commands.config.prompt.show.custom_description",
				descriptionVars: { prompt: preview },
				color: ColorCode.INFO,
				flags: MessageFlags.Ephemeral,
			});
		} else {
			// 3b. No custom prompt — show the default
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.config.prompt.show.default_title",
				descriptionKey: "commands.config.prompt.show.default_description",
				descriptionVars: { defaultPrompt: DEFAULT_SYSTEM_PROMPT.trim() },
				color: ColorCode.INFO,
				flags: MessageFlags.Ephemeral,
			});
		}
	} catch (error) {
		log.error("Failed to show system prompt", error as Error);

		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.unknown_error_title",
			descriptionKey: "general.errors.unknown_error_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
	}
}
