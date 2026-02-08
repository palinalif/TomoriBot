import type {
	ChatInputCommandInteraction,
	ButtonInteraction,
	ModalSubmitInteraction,
	Client,
	SlashCommandSubcommandBuilder,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { sql } from "@/utils/db/client";
import {
	personalMemorySchema,
	type UserRow,
	type ErrorContext,
	type TomoriState,
} from "../../../types/db/schema";
import { localizer } from "../../../utils/text/localizer";
import { log, ColorCode } from "../../../utils/misc/logger";
import {
	replyInfoEmbed,
	replyPaginatedChoices,
	promptWithPaginatedModal,
	safeSelectOptionText,
} from "../../../utils/discord/interactionHelper";
import {
	loadTomoriState,
	loadAllPersonasForServer,
	loadPersonalMemoriesForUserLineage,
} from "../../../utils/db/dbRead";
import { invalidateUserCache } from "../../../utils/cache/userCache";
import type { SelectOption } from "../../../types/discord/modal";
import { createStandardEmbed } from "../../../utils/discord/embedHelper";

// Rule 20: Constants for static values at the top
const MODAL_CUSTOM_ID = "forget_personalmemory_modal";
const MEMORY_SELECT_ID = "memory_select";

/**
 * Helper function to perform personal memory removal from database
 * @param memoryToRemove - Memory string to remove
 * @param userData - User data
 * @param replyInteraction - Interaction to reply to (can be modal or pagination)
 * @param locale - User locale
 */
async function performPersonalMemoryRemoval(
	memoryToRemove: { personal_memory_id?: number; content: string },
	userData: UserRow,
	replyInteraction:
		| ChatInputCommandInteraction
		| ButtonInteraction
		| ModalSubmitInteraction,
	locale: string,
): Promise<void> {
	if (!memoryToRemove.personal_memory_id) {
		await replyInfoEmbed(replyInteraction, locale, {
			titleKey: "general.errors.update_failed_title",
			descriptionKey: "general.errors.update_failed_description",
			color: ColorCode.ERROR,
		});
		return;
	}

	// Delete selected memory row from personal_memories
	const [updatedUserResult] = await sql`
		DELETE FROM personal_memories
		WHERE personal_memory_id = ${memoryToRemove.personal_memory_id}
		  AND user_id = ${userData.user_id}
		RETURNING *
	`;

	// Validate the returned (updated) data
	const validationResult = personalMemorySchema.safeParse(updatedUserResult);

	if (!validationResult.success || !updatedUserResult) {
		// Log error specific to this update failure
		const context: ErrorContext = {
			userId: userData.user_id,
			serverId: null,
			tomoriId: null,
			errorType: "DatabaseUpdateError",
			metadata: {
				command: "forget personalmemory",
				table: "personal_memories",
				column: "content",
				operation: "DELETE",
				memoryToRemove,
				validationErrors: validationResult.success
					? null
					: validationResult.error.flatten(),
			},
		};

		await log.error(
			"Failed to update or validate user data after deleting personal memory",
			validationResult.success
				? new Error("Database update returned no rows or unexpected data")
				: new Error("Updated user data failed validation"),
			context,
		);

		await replyInfoEmbed(replyInteraction, locale, {
			titleKey: "general.errors.update_failed_title",
			descriptionKey: "general.errors.update_failed_description",
			color: ColorCode.ERROR,
		});
		return;
	}

	// Invalidate user cache so next message gets fresh data
	invalidateUserCache(userData.user_disc_id);

	// Log success and show success message
	log.success(
		`Deleted personal memory "${memoryToRemove.content.slice(0, 30)}..." for user ${userData.user_disc_id} (ID: ${userData.user_id})`,
	);

	await replyInfoEmbed(replyInteraction, locale, {
		titleKey: "commands.forget.memory.personal.success_title",
		descriptionKey: "commands.forget.memory.personal.success_description",
		descriptionVars: {
			memory:
				memoryToRemove.content.length > 50
					? `${memoryToRemove.content.slice(0, 50)}...`
					: memoryToRemove.content,
		},
		color: ColorCode.SUCCESS,
	});
}

// Rule 21: Configure the subcommand
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("personal")
		.setDescription(
			localizer("en-US", "commands.forget.memory.personal.description"),
		);

/**
 * Rule 1: JSDoc comment for exported function
 * Removes a personal memory from the user's record in the users table using a paginated embed.
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
	// 1. Ensure command is run in a valid channel context (Rule 17)
	if (!interaction.channel) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.channel_only_title",
			descriptionKey: "general.errors.channel_only_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// Define state and result variables outside try for catch block context
	let tomoriState: TomoriState | null = null;
	let selectedPersona: TomoriState | null = null;
	let personaSelectionInteraction: ButtonInteraction | null = null;
	let personalizationDisabledWarning = false; // Flag to check if warning needed

	try {
		// 2. Load server's Tomori state to check personalization setting (Rule 17)
		tomoriState = await loadTomoriState(
			interaction.guild?.id ?? interaction.user.id,
		);
		if (!tomoriState) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.errors.tomori_not_setup_title", // Corrected key
				descriptionKey: "general.errors.tomori_not_setup_description", // Corrected key
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// Check if personalization is disabled *before* showing choices
		// biome-ignore lint/style/noNonNullAssertion: tomoriState checked earlier
		if (!tomoriState!.config.personal_memories_enabled) {
			personalizationDisabledWarning = true;
		}

		// 4. Select target persona via paginated selector
		const allPersonas = await loadAllPersonasForServer(
			interaction.guild?.id ?? interaction.user.id,
		);
		if (allPersonas.length === 0) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.errors.tomori_not_setup_title",
				descriptionKey: "general.errors.tomori_not_setup_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const personaSelectionItems = allPersonas.map((persona) =>
			`${persona.tomori_nickname}${persona.is_alter ? " [Alter]" : " [Main]"}`,
		);
		const personaSelection = await replyPaginatedChoices(interaction, locale, {
			titleKey: "general.pagination.select_persona_title",
			descriptionKey: "general.pagination.select_persona_description",
			items: personaSelectionItems,
			color: ColorCode.INFO,
			preserveSelectedInteraction: true,
			onSelect: async () => {},
		});

		if (
			!personaSelection.success ||
			personaSelection.selectedIndex === undefined ||
			!personaSelection.interaction
		) {
			return;
		}

		personaSelectionInteraction = personaSelection.interaction;
		selectedPersona = allPersonas[personaSelection.selectedIndex] ?? null;
		if (!selectedPersona) {
			await replyInfoEmbed(personaSelectionInteraction, locale, {
				titleKey: "general.errors.invalid_option_title",
				descriptionKey: "general.errors.invalid_option_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		const targetLineageId = selectedPersona.persona_lineage_id ?? 0;

		// 5. Get current personal memories from lineage-scoped table
		const currentMemories = userData.user_id
			? await loadPersonalMemoriesForUserLineage(
					userData.user_id,
					targetLineageId,
					true,
				)
			: [];

		// 6. Check if there are any memories to remove
		if (currentMemories.length === 0) {
			await replyInfoEmbed(personaSelectionInteraction, locale, {
				titleKey: "commands.forget.memory.personal.no_memories_title",
				descriptionKey: "commands.forget.memory.personal.no_memories",
				color: ColorCode.WARN,
			});
			return;
		}

		// 7. Create memory select options for the modal
		const memorySelectOptions: SelectOption[] = currentMemories.map(
			(memory, index) => ({
				label: safeSelectOptionText(memory.content, 20),
				value: index.toString(), // Use index to avoid truncation issues
				description: safeSelectOptionText(memory.content),
			}),
		);

		// 8. Show the paginated modal with memory selection
		const modalResult = await promptWithPaginatedModal(
			personaSelectionInteraction,
			locale,
			{
			modalCustomId: MODAL_CUSTOM_ID,
			modalTitleKey: "commands.forget.memory.personal.modal_title",
			components: [
				{
					customId: MEMORY_SELECT_ID,
					labelKey: "commands.forget.memory.personal.select_label",
					descriptionKey: "commands.forget.memory.personal.select_description",
					placeholder: "commands.forget.memory.personal.select_placeholder",
					required: true,
					options: memorySelectOptions,
				},
			],
		});

		// 9. Handle modal outcome
		if (modalResult.outcome !== "submit") {
			log.info(
				`Personal memory deletion modal ${modalResult.outcome} for user ${userData.user_id}`,
			);
			return;
		}

		// 10. Extract values from the modal
		const modalSubmitInteraction = modalResult.interaction;
		const selectedIndex = modalResult.values?.[MEMORY_SELECT_ID];

		// Safety checks (should never be null after submit outcome)
		if (!modalSubmitInteraction || !selectedIndex) {
			log.error("Modal result unexpectedly missing interaction or values");
			return;
		}

		// Get the full memory row from the original array
		const selectedMemory = currentMemories[Number.parseInt(selectedIndex, 10)];
		if (!selectedMemory) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "general.errors.operation_failed_title",
				descriptionKey: "commands.forget.memory.personal.no_memories",
				color: ColorCode.ERROR,
			});
			return;
		}

		// 11. Perform the database update using the helper function
		await performPersonalMemoryRemoval(
			selectedMemory,
			userData,
			modalSubmitInteraction,
			locale,
		);

		// 12. If personalization is disabled, send a warning follow-up
		if (personalizationDisabledWarning) {
			await modalSubmitInteraction.followUp({
				embeds: [
					createStandardEmbed(locale, {
						titleKey: "commands.forget.memory.personal.warning_disabled_title",
						descriptionKey:
							"commands.forget.memory.personal.warning_disabled_description",
						color: ColorCode.WARN,
					}),
				],
				flags: MessageFlags.Ephemeral,
			});
		}
	} catch (error) {
		// 16. Catch unexpected errors
		const context: ErrorContext = {
			userId: userData.user_id,
			serverId: tomoriState?.server_id,
			tomoriId: tomoriState?.tomori_id,
			errorType: "CommandExecutionError",
			metadata: {
				command: "forget personalmemory",
				guildId: interaction.guild?.id,
				executorDiscordId: interaction.user.id,
			},
		};
		await log.error(
			`Unexpected error in /forget personalmemory for user ${userData.user_disc_id}`,
			error as Error,
			context,
		);

		// 17. Inform user of unknown error, prioritizing unacknowledged button interaction
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
