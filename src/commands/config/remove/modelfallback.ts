/**
 * /config remove modelfallback
 * Removes a single model from the server's fallback chain.
 * Presents a select of all configured fallbacks and drops the chosen one.
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
	invalidateTomoriStateCache,
} from "@/utils/cache/tomoriStateCache";
import { setFallbackLlms } from "@/utils/db/dbWrite";
import type { UserRow, ErrorContext } from "@/types/db/schema";
import type { SelectOption } from "@/types/discord/modal";

// ─── Constants ────────────────────────────────────────────────────────────────

const MODAL_CUSTOM_ID = "config_remove_modelfallback_modal";
const FALLBACK_SELECT_ID = "fallback_select";

// ─── Subcommand Configuration ─────────────────────────────────────────────────

/**
 * Configures the 'modelfallback' subcommand for /config remove.
 */
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("modelfallback")
		.setDescription(
			localizer("en-US", "commands.config.remove.modelfallback.description"),
		);

// ─── Execute ──────────────────────────────────────────────────────────────────

/**
 * Executes the /config remove modelfallback command.
 * Flow:
 *   1. Load TomoriState and read the current fallback_llms chain
 *   2. If empty, reply with "none configured"
 *   3. Show a select with each fallback slot (index → codename label)
 *   4. Remove the chosen entry and write the remaining list back
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
		// 2. Load TomoriState to get fallback chain and server_id
		const serverDiscId = interaction.guild.id;
		const tomoriState = await getCachedTomoriState(serverDiscId);
		if (!tomoriState) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.errors.tomori_not_setup_title",
				descriptionKey: "general.errors.tomori_not_setup_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 3. Check there are fallbacks to remove
		const currentFallbacks = tomoriState.fallback_llms ?? [];
		if (currentFallbacks.length === 0) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.config.remove.modelfallback.none_title",
				descriptionKey:
					"commands.config.remove.modelfallback.none_description",
				color: ColorCode.WARN,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 4. Build select options: "N. `codename` (provider)"
		//    Value is the array index to avoid any ID truncation issues
		const fallbackOptions: SelectOption[] = currentFallbacks.map(
			(llm, index) => ({
				value: index.toString(),
				label: safeSelectOptionText(
					`${index + 1}. ${llm.llm_codename} (${llm.llm_provider})`,
				),
			}),
		);

		// 5. Show modal — first interaction acknowledgment
		const modalResult = await promptWithPaginatedModal(interaction, locale, {
			modalCustomId: MODAL_CUSTOM_ID,
			modalTitleKey: "commands.config.remove.modelfallback.modal_title",
			components: [
				{
					customId: FALLBACK_SELECT_ID,
					labelKey: "commands.config.remove.modelfallback.select_label",
					placeholder:
						"commands.config.remove.modelfallback.select_placeholder",
					required: true,
					options: fallbackOptions,
				},
			],
		});

		if (modalResult.outcome !== "submit") return;

		// biome-ignore lint/style/noNonNullAssertion: "submit" outcome guarantees interaction and values exist
		const modalInteraction = modalResult.interaction!;
		// biome-ignore lint/style/noNonNullAssertion: "submit" outcome guarantees interaction and values exist
		const values = modalResult.values!;

		// 6. Defer the modal submit reply
		if (!modalInteraction.deferred && !modalInteraction.replied) {
			await modalInteraction.deferReply({ flags: MessageFlags.Ephemeral });
		}

		// 7. Resolve selected fallback from index
		const selectedIndex = Number.parseInt(
			values[FALLBACK_SELECT_ID] ?? "0",
			10,
		);
		const removedLlm = currentFallbacks[selectedIndex];

		if (!removedLlm) {
			await replyInfoEmbed(modalInteraction, locale, {
				titleKey: "general.errors.unknown_error_title",
				descriptionKey: "general.errors.unknown_error_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		// 8. Build the new chain without the removed entry, preserving order
		const remainingFallbacks = currentFallbacks.filter(
			(_, i) => i !== selectedIndex,
		);
		const remainingIds = remainingFallbacks
			.map((llm) => llm.llm_id)
			.filter((id): id is number => id !== undefined);

		// 9. Write the updated chain to the database
		const writeOk = await setFallbackLlms(tomoriState.server_id, remainingIds);
		if (!writeOk) {
			const context: ErrorContext = {
				serverId: tomoriState.server_id,
				errorType: "DatabaseUpdateError",
				metadata: {
					operation: "setFallbackLlms",
					removedCodename: removedLlm.llm_codename,
					remainingIds,
				},
			};
			await log.error(
				"Failed to update fallback LLM chain after removal",
				new Error("setFallbackLlms returned false"),
				context,
			);
			await replyInfoEmbed(modalInteraction, locale, {
				titleKey: "general.errors.update_failed_title",
				descriptionKey: "general.errors.update_failed_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		// 10. Invalidate cache so next generation uses the updated fallback chain
		invalidateTomoriStateCache(serverDiscId);

		// 11. Reply success
		await replyInfoEmbed(modalInteraction, locale, {
			titleKey: "commands.config.remove.modelfallback.success_title",
			descriptionKey: "commands.config.remove.modelfallback.success_description",
			descriptionVars: {
				model: removedLlm.llm_codename,
				remaining_count: remainingIds.length,
			},
			color: ColorCode.SUCCESS,
		});

		log.success(
			`Fallback model ${removedLlm.llm_codename} removed from server ${serverDiscId}. ` +
				`${remainingIds.length} fallback(s) remaining.`,
		);
	} catch (error) {
		const context: ErrorContext = {
			userId: userData.user_id,
			errorType: "CommandExecutionError",
			metadata: { command: "config remove modelfallback" },
		};
		await log.error(
			"Error in /config remove modelfallback",
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
