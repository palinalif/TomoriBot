/**
 * Command: /config personaprompt show
 * Displays the persona-specific prompt for a selected persona, or indicates
 * that none is set.
 */

import type {
	ChatInputCommandInteraction,
	ButtonInteraction,
	Client,
} from "discord.js";
import { MessageFlags, type SlashCommandSubcommandBuilder } from "discord.js";
import type { UserRow, TomoriState } from "@/types/db/schema";
import { log, ColorCode } from "@/utils/misc/logger";
import {
	replyInfoEmbed,
	replyPaginatedPersonaChoicesV2,
} from "@/utils/discord/interactionHelper";
import { getCachedTomoriState } from "@/utils/cache/tomoriStateCache";
import { loadAllPersonasForServer } from "@/utils/db/dbRead";
import { localizer } from "@/utils/text/localizer";

/** Maximum characters to show inline before truncating with an ellipsis */
const MAX_PROMPT_PREVIEW = Number.parseInt(
	process.env.PERSONAPROMPT_SHOW_MAX_PREVIEW || "3800",
	10,
);

/**
 * Configure the slash command subcommand metadata
 * @returns Configured SlashCommandSubcommandBuilder
 */
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("show")
		.setDescription(
			localizer("en-US", "commands.config.personaprompt.show.description"),
		);

/**
 * Execute the /config personaprompt show command.
 * Uses paginated persona selection, then shows the selected persona's prompt.
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
	// 1. Paginated selection requires a channel context
	if (!interaction.channel) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.channel_only_title",
			descriptionKey: "general.errors.channel_only_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// 2. Require Manage Server permission in guilds
	if (interaction.guild) {
		const hasPermission =
			interaction.memberPermissions?.has("ManageGuild") ?? false;
		if (!hasPermission) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.config.personaprompt.show.no_permission_title",
				descriptionKey:
					"commands.config.personaprompt.show.no_permission_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
	}

	let tomoriState: TomoriState | null = null;
	let personaSelectionInteraction: ButtonInteraction | null = null;

	try {
		const serverDiscId = interaction.guild?.id ?? interaction.user.id;
		tomoriState = await getCachedTomoriState(serverDiscId);

		if (!tomoriState) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.errors.tomori_not_setup_title",
				descriptionKey: "general.errors.tomori_not_setup_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 3. Load all personas for the paginated selector
		const allPersonas = await loadAllPersonasForServer(serverDiscId);
		if (allPersonas.length === 0) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.errors.tomori_not_setup_title",
				descriptionKey: "general.errors.tomori_not_setup_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 4. Show persona selection — DO NOT defer before this (Pattern 4)
		const personaSelection = await replyPaginatedPersonaChoicesV2(
			interaction,
			locale,
			{
				personas: allPersonas,
				color: ColorCode.INFO,
				preserveSelectedInteraction: true,
				onSelect: async () => {},
			},
		);

		if (
			!personaSelection.success ||
			personaSelection.selectedIndex === undefined ||
			!personaSelection.interaction
		) {
			return;
		}

		personaSelectionInteraction = personaSelection.interaction;
		const selectedPersona = allPersonas[personaSelection.selectedIndex] ?? null;

		if (!selectedPersona?.tomori_id) {
			await replyInfoEmbed(personaSelectionInteraction, locale, {
				titleKey: "general.errors.invalid_option_title",
				descriptionKey: "general.errors.invalid_option_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		const personaPrompt = selectedPersona.persona_prompt;
		const personaName = selectedPersona.tomori_nickname;

		if (personaPrompt) {
			// 5a. Truncate if the prompt is very long
			const preview =
				personaPrompt.length > MAX_PROMPT_PREVIEW
					? `${personaPrompt.slice(0, MAX_PROMPT_PREVIEW)}...`
					: personaPrompt;

			await replyInfoEmbed(personaSelectionInteraction, locale, {
				titleKey: "commands.config.personaprompt.show.set_title",
				titleVars: { persona_name: personaName },
				descriptionKey: "commands.config.personaprompt.show.set_description",
				descriptionVars: { prompt: preview },
				color: ColorCode.INFO,
			});
		} else {
			// 5b. No persona prompt set — inform the user
			await replyInfoEmbed(personaSelectionInteraction, locale, {
				titleKey: "commands.config.personaprompt.show.empty_title",
				titleVars: { persona_name: personaName },
				descriptionKey: "commands.config.personaprompt.show.empty_description",
				descriptionVars: { persona_name: personaName },
				color: ColorCode.INFO,
			});
		}
	} catch (error) {
		await log.error("Error in /config personaprompt show command", error, {
			serverId: tomoriState?.server_id,
			tomoriId: tomoriState?.tomori_id,
			errorType: "CommandExecutionError",
			metadata: {
				command: "config personaprompt show",
				guildId: interaction.guild?.id,
				userId: interaction.user.id,
			},
		});

		// 6. Reply to whichever interaction is still open
		const errorReplyTarget =
			personaSelectionInteraction &&
			!personaSelectionInteraction.deferred &&
			!personaSelectionInteraction.replied
				? personaSelectionInteraction
				: interaction;

		await replyInfoEmbed(errorReplyTarget, locale, {
			titleKey: "general.errors.unknown_error_title",
			descriptionKey: "general.errors.unknown_error_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
	}
}
