/**
 * /config randomtrigger remove
 * Removes an existing random trigger from the server.
 * Presents a paginated select of all current triggers for the invoker to choose from.
 */

import {
	EmbedBuilder,
	MessageFlags,
	type ChatInputCommandInteraction,
	type Client,
	type SlashCommandSubcommandBuilder,
} from "discord.js";
import { localizer } from "@/utils/text/localizer";
import { log, ColorCode } from "@/utils/misc/logger";
import {
	replyInfoEmbed,
	promptWithPaginatedModal,
	safeSelectOptionText,
} from "@/utils/discord/interactionHelper";
import {
	getCachedTomoriState,
	getCachedAllPersonas,
} from "@/utils/cache/tomoriStateCache";
import { getServerRandomTriggers } from "@/utils/db/dbRead";
import { deleteRandomTrigger } from "@/utils/db/dbWrite";
import type { UserRow, ErrorContext } from "@/types/db/schema";
import type { SelectOption } from "@/types/discord/modal";

// ─── Constants ────────────────────────────────────────────────────────────────

const MODAL_CUSTOM_ID = "config_randomtrigger_remove_modal";
const TRIGGER_SELECT_ID = "trigger_select";

// ─── Subcommand Configuration ─────────────────────────────────────────────────

/**
 * Configures the 'remove' subcommand for /config randomtrigger.
 * No slash options — selection is done via modal.
 */
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("remove")
		.setDescription(
			localizer(
				"en-US",
				"commands.config.randomtrigger.remove.description",
			),
		);

// ─── Execute ──────────────────────────────────────────────────────────────────

/**
 * Executes the /config randomtrigger remove command.
 * Flow:
 *   1. Load all random triggers for this server
 *   2. If none exist, reply with info embed
 *   3. Build a select showing channel + persona + timer/chance info
 *   4. Show modal with the trigger selector
 *   5. Delete the selected trigger and confirm
 *
 * @param _client - Discord client instance
 * @param interaction - Slash command interaction
 * @param userData - Invoking user's data
 * @param locale - User's preferred locale
 */
export async function execute(
	_client: Client,
	interaction: ChatInputCommandInteraction,
	userData: UserRow,
	locale: string,
): Promise<void> {
	// 1. Ensure command is run in a guild
	if (!interaction.guild) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.guild_only_title",
			descriptionKey: "general.errors.guild_only_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// NOTE: No deferReply here — promptWithPaginatedModal must be the first
	// acknowledgment. Pre-modal checks are cache-backed and complete within 3 seconds.

	try {
		// 2. Load Tomori state to get database server_id
		const tomoriState = await getCachedTomoriState(interaction.guild.id);
		if (!tomoriState) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.errors.tomori_not_setup_title",
				descriptionKey: "general.errors.tomori_not_setup_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 3. Fetch all triggers for this server
		const triggers = await getServerRandomTriggers(tomoriState.server_id);

		if (triggers.length === 0) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.config.randomtrigger.remove.none_title",
				descriptionKey:
					"commands.config.randomtrigger.remove.none_description",
				color: ColorCode.WARN,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 4. Fetch channel/persona names from Discord for readable labels
		// Labels: "#channel-name | PersonaName | Xh / Y%"
		const randomLabel = localizer(
			locale,
			"commands.config.randomtrigger.add.persona_random_label",
		);
		const allPersonas = await getCachedAllPersonas(interaction.guild.id);
		const personaNameById = new Map<number, string>();
		for (const persona of allPersonas) {
			if (persona.tomori_id !== null && persona.tomori_id !== undefined) {
				personaNameById.set(persona.tomori_id, persona.tomori_nickname);
			}
		}

		const triggerOptions: SelectOption[] = triggers.map((trigger, index) => {
			// Attempt to resolve channel name from the guild cache
			const guildChannel = interaction.guild?.channels.cache.get(
				trigger.channel_disc_id,
			);
			const channelName = guildChannel
				? `#${guildChannel.name}`
				: `<#${trigger.channel_disc_id}>`;

			// Persona name: NULL tomori_id = "Random"
			const personaName =
				trigger.tomori_id === null || trigger.tomori_id === undefined
					? randomLabel
					: (personaNameById.get(trigger.tomori_id) ??
						`ID:${trigger.tomori_id}`);
			const offsetSegment =
				trigger.random_offset_range !== null &&
				trigger.random_offset_range !== undefined &&
				trigger.random_offset_range > 0
					? ` +/-${trigger.random_offset_range}h`
					: "";

			const label = safeSelectOptionText(
				`${channelName} | ${personaName} | ${trigger.timer_hours}h${offsetSegment} / ${trigger.chance_percent}%`,
			);

			return {
				// Use array index as select value to avoid truncation of large IDs
				value: index.toString(),
				label,
			};
		});

		// 5. Show modal with trigger selection
		// (This is the first interaction acknowledgement — no deferReply before this)
		const modalResult = await promptWithPaginatedModal(interaction, locale, {
			modalCustomId: MODAL_CUSTOM_ID,
			modalTitleKey: "commands.config.randomtrigger.remove.modal_title",
			components: [
				{
					customId: TRIGGER_SELECT_ID,
					labelKey: "commands.config.randomtrigger.remove.select_label",
					placeholder:
						"commands.config.randomtrigger.remove.select_placeholder",
					required: true,
					options: triggerOptions,
				},
			],
		});

		// 6. Handle modal cancellation or timeout
		if (modalResult.outcome !== "submit") {
			log.info(
				`Randomtrigger remove modal ${modalResult.outcome} for user ${interaction.user.id}`,
			);
			return;
		}

		// biome-ignore lint/style/noNonNullAssertion: "submit" outcome guarantees interaction and values exist
		const modalInteraction = modalResult.interaction!;
		// biome-ignore lint/style/noNonNullAssertion: "submit" outcome guarantees interaction and values exist
		const values = modalResult.values!;

		// Defer the modal submit interaction
		if (!modalInteraction.deferred && !modalInteraction.replied) {
			await modalInteraction.deferReply({ flags: MessageFlags.Ephemeral });
		}

		// 7. Parse selected trigger index and resolve to actual trigger row
		const selectedIndexRaw = values[TRIGGER_SELECT_ID] ?? "0";
		const selectedIndex = Number.parseInt(selectedIndexRaw, 10);
		const selectedTrigger = triggers[selectedIndex];

		if (!selectedTrigger?.trigger_id) {
			await replyInfoEmbed(modalInteraction, locale, {
				titleKey: "general.errors.unknown_error_title",
				descriptionKey: "general.errors.unknown_error_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		// 8. Delete the selected trigger
		const deleted = await deleteRandomTrigger(selectedTrigger.trigger_id);

		if (!deleted) {
			const context: ErrorContext = {
				serverId: tomoriState.server_id,
				errorType: "DatabaseDeleteError",
				metadata: {
					operation: "deleteRandomTrigger",
					triggerId: selectedTrigger.trigger_id,
				},
			};
			await log.error(
				"Failed to delete random trigger",
				new Error("deleteRandomTrigger returned false"),
				context,
			);
			await replyInfoEmbed(modalInteraction, locale, {
				titleKey: "general.errors.update_failed_title",
				descriptionKey: "general.errors.update_failed_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		// 9. Reply with success
		await replyInfoEmbed(modalInteraction, locale, {
			titleKey: "commands.config.randomtrigger.remove.success_title",
			descriptionKey:
				"commands.config.randomtrigger.remove.success_description",
			descriptionVars: {
				channel: `<#${selectedTrigger.channel_disc_id}>`,
			},
			color: ColorCode.SUCCESS,
		});

		log.success(
			`Random trigger ${selectedTrigger.trigger_id} deleted from server ${interaction.guild.id}`,
		);
	} catch (error) {
		const context: ErrorContext = {
			userId: userData.user_id,
			errorType: "CommandExecutionError",
			metadata: { command: "config randomtrigger remove" },
		};
		await log.error(
			"Error in /config randomtrigger remove",
			error as Error,
			context,
		);

		if (!interaction.replied && !interaction.deferred) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.errors.unknown_error_title",
				descriptionKey: "general.errors.unknown_error_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
		} else {
			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle(
							localizer(locale, "general.errors.unknown_error_title"),
						)
						.setDescription(
							localizer(locale, "general.errors.unknown_error_description"),
						)
						.setColor(ColorCode.ERROR),
				],
			});
		}
	}
}
