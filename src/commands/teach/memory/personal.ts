import type {
	ChatInputCommandInteraction,
	Client,
	SlashCommandSubcommandBuilder,
	ModalSubmitInteraction,
} from "discord.js";
import { MessageFlags, TextInputStyle } from "discord.js";
import type {
	UserRow,
	ErrorContext,
	TomoriState,
} from "../../../types/db/schema";
import { localizer } from "../../../utils/text/localizer";
import { log, ColorCode } from "../../../utils/misc/logger";
import {
	replyInfoEmbed,
	promptWithRawModal,
} from "../../../utils/discord/interactionHelper";
import {
	loadTomoriState,
	isBlacklisted,
	loadAllPersonasForServer,
	loadPersonalMemoriesForUserLineage,
} from "../../../utils/db/dbRead";
import { invalidateUserCache } from "../../../utils/cache/userCache";
import type { ModalResult } from "../../../types/discord/modal";
import {
	validateMemoryContent,
	checkPersonalMemoryLimit,
	getMemoryLimits,
} from "../../../utils/db/memoryLimits";
import { addPersonalMemoryByTomori } from "../../../utils/db/dbWrite";

// Rule 20: Constants for modal and input IDs
const MODAL_CUSTOM_ID = "teach_personalmemory_add_modal";
const MEMORY_INPUT_ID = "personal_memory_input";

// Get memory limits from environment variables
const memoryLimits = getMemoryLimits();

// Rule 21: Configure the subcommand
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("personal")
		.setDescription(
			localizer("en-US", "commands.teach.memory.personal.description"),
		)
		.addStringOption((option) =>
			option
				.setName("persona")
				.setDescription("Target persona nickname (defaults to current main persona)")
				.setRequired(false),
		);

/**
 * Rule 1: JSDoc comment for exported function
 * Adds a personal memory to the user's record in the users table.
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
	// 1. Ensure command is run in a channel context (Rule 17)
	if (!interaction.channel) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.channel_only_title",
			descriptionKey: "general.errors.channel_only_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// Define state and modal result outside try for catch block
	let tomoriState: TomoriState | null = null;
	let selectedPersona: TomoriState | null = null;
	let modalResult: ModalResult | null = null;
	let modalSubmitInteraction: ModalSubmitInteraction | null = null;

	try {
		// 2. Load server's Tomori state to check personalization setting (Rule 17)
		// We need this even though we're updating the users table
		// Use user ID for DM context, guild ID for server context
		const serverId = interaction.guild?.id ?? interaction.user.id;
		tomoriState = await loadTomoriState(serverId);

		// 3. Check if Tomori is set up on the server (needed for config check)
		if (!tomoriState) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.errors.tomori_not_setup_title",
				descriptionKey: "general.errors.tomori_not_setup_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 4. Resolve target persona (default: current main persona)
		const personaNameInput = interaction.options.getString("persona");
		const allPersonas = await loadAllPersonasForServer(serverId);
		selectedPersona = personaNameInput
			? allPersonas.find(
					(persona) =>
						persona.tomori_nickname.toLowerCase() ===
						personaNameInput.toLowerCase(),
				) ?? null
			: allPersonas.find((persona) => !persona.is_alter) ?? null;

		if (!selectedPersona) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.errors.invalid_option_title",
				description: personaNameInput
					? `Unknown persona "${personaNameInput}".`
					: "No target persona available.",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const targetLineageId = selectedPersona.persona_lineage_id ?? 0;

		// 5. Check personal memory limit before showing modal (better UX)
		const personalLimitCheck = await checkPersonalMemoryLimit(
			// biome-ignore lint/style/noNonNullAssertion: userData validation ensures user_id exists
			userData.user_id!,
			targetLineageId,
			true,
		);
		if (!personalLimitCheck.isValid) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.teach.memory.personal.limit_exceeded_title",
				descriptionKey:
					"commands.teach.memory.personal.limit_exceeded_description",
				descriptionVars: {
					max_allowed:
						personalLimitCheck.maxAllowed || memoryLimits.maxPersonalMemories,
					current_count: personalLimitCheck.currentCount || 0,
				},
				color: ColorCode.ERROR,
			});
			return;
		}

		// 6. Prompt user with a modal with Component Type 18 support (Rule 10, 12, 19, 25)
		modalResult = await promptWithRawModal(interaction, locale, {
			modalCustomId: MODAL_CUSTOM_ID,
			modalTitleKey: "commands.teach.memory.personal.modal_title",
			components: [
				{
					customId: MEMORY_INPUT_ID,
					labelKey: "commands.teach.memory.personal.memory_input_label",
					descriptionKey: "commands.teach.memory.personal.modal_description",
					placeholder:
						"commands.teach.memory.personal.memory_input_placeholder",
					style: TextInputStyle.Paragraph,
					required: true,
					maxLength: memoryLimits.maxMemoryLength,
				},
			],
		});

		// 7. Handle modal outcome
		if (modalResult.outcome !== "submit") {
			log.info(
				`Personal memory add modal ${modalResult.outcome} for user ${userData.user_id}`,
			);
			return;
		}

		// 8. Capture and immediately defer the modal submission interaction (Rule 25)
		// biome-ignore lint/style/noNonNullAssertion: Outcome 'submit' guarantees interaction
		modalSubmitInteraction = modalResult.interaction!;

		// 9. Get input from modal - let helper functions manage interaction state
		// biome-ignore lint/style/noNonNullAssertion: Outcome 'submit' + required=true guarantees value
		const newMemory = modalResult.values![MEMORY_INPUT_ID];

		// 10. Validate memory content length
		const contentValidation = validateMemoryContent(newMemory);
		if (!contentValidation.isValid) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "commands.teach.memory.personal.content_too_long_title",
				descriptionKey:
					"commands.teach.memory.personal.content_too_long_description",
				descriptionVars: { max_length: memoryLimits.maxMemoryLength },
				color: ColorCode.ERROR,
			});
			return;
		}

		// 11. Check if user has opted out of personalization (privacy setting)
		const { getPrivacyLevel } = await import("../../../utils/db/dbRead");
		const { PrivacyLevel } = await import("../../../types/db/schema");
		const userPrivacyLevel = await getPrivacyLevel(interaction.user.id);

		// Only block FULL privacy level (MINIMAL and PARTIAL can manually teach)
		if (userPrivacyLevel === PrivacyLevel.FULL) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "commands.teach.memory.personal.opted_out_error_title",
				descriptionKey:
					"commands.teach.memory.personal.opted_out_error_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			log.info(
				`User ${interaction.user.id} (${userData.user_nickname}) attempted to use /teach personalmemory with privacy level ${userPrivacyLevel}`,
			);
			return;
		}

		// 12. Load existing memories for duplicate detection
		const currentMemories = userData.user_id
			? await loadPersonalMemoriesForUserLineage(
					userData.user_id,
					targetLineageId,
					true,
				)
			: [];

		// 13. Check for duplicates within the user's memories
		if (currentMemories.some((row) => row.content === newMemory)) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "commands.teach.memory.personal.duplicate_title",
				descriptionKey: "commands.teach.memory.personal.duplicate_description",
				descriptionVars: { memory: newMemory },
				color: ColorCode.WARN,
			});
			return;
		}

		// 14. Insert lineage-scoped memory row
		const insertedMemory = await addPersonalMemoryByTomori(
			// biome-ignore lint/style/noNonNullAssertion: user row from middleware
			userData.user_id!,
			targetLineageId,
			newMemory,
		);
		if (!insertedMemory) {
			const context: ErrorContext = {
				userId: userData.user_id,
				serverId: tomoriState.server_id, // Include server context
				tomoriId: selectedPersona.tomori_id, // Include tomori context
				errorType: "DatabaseValidationError",
				metadata: {
					command: "teach personalmemory",
					table: "personal_memories",
					column: "content",
					operation: "INSERT",
					userDiscordId: interaction.user.id,
					targetLineageId,
					newMemoryContent: newMemory,
				},
			};
			await log.error(
				"Failed to insert personal memory",
				new Error("Insert returned null"),
				context,
			);

			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "general.errors.update_failed_title",
				descriptionKey: "general.errors.update_failed_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		// 15. Check personalization settings and user blacklisting status to prepare appropriate message
		let descriptionKey = "commands.teach.memory.personal.success_description";
		let embedColor = ColorCode.SUCCESS;

		// Check both personalization settings and user blacklisting (similar to memoryTool.ts:437-454)
		const personalizationEnabled =
			tomoriState?.config.personal_memories_enabled ?? true;
		// Only check blacklisting for guild contexts (DM users can't be blacklisted)
		const userIsBlacklisted = interaction.guild
			? ((await isBlacklisted(interaction.guild.id, interaction.user.id)) ??
				false)
			: false;

		if (!personalizationEnabled) {
			descriptionKey =
				"commands.teach.memory.personal.success_but_disabled_description";
			embedColor = ColorCode.WARN;
		} else if (userIsBlacklisted) {
			descriptionKey =
				"commands.teach.memory.personal.success_but_blacklisted_description";
			embedColor = ColorCode.WARN;
		}

		// 15. Invalidate user cache so next message gets fresh data
		invalidateUserCache(interaction.user.id);

		// 16. Success! Confirm addition (with potential warning) (Rule 12, 19)
		await replyInfoEmbed(modalSubmitInteraction, locale, {
			titleKey: "commands.teach.memory.personal.success_title",
			descriptionKey: descriptionKey, // Use the determined description key
			descriptionVars: {
				memory:
					newMemory.length > 96 ? `${newMemory.slice(0, 96)}...` : newMemory, // Truncate for display
			},
			color: embedColor, // Use the determined color
		});
	} catch (error) {
		// Rule 22: Log error with context
		const context: ErrorContext = {
			userId: userData.user_id,
			serverId: tomoriState?.server_id,
			tomoriId: tomoriState?.tomori_id,
			errorType: "CommandExecutionError",
			metadata: {
				command: "teach personalmemory",
				userDiscordId: interaction.user.id,
				guildId: interaction.guild?.id,
			},
		};
		await log.error("Error in /teach personalmemory command", error, context);

		// Rule 12, 19: Reply with unknown error embed
		const errorReplyInteraction =
			modalSubmitInteraction &&
			(modalSubmitInteraction.replied || modalSubmitInteraction.deferred)
				? modalSubmitInteraction
				: interaction.replied || interaction.deferred
					? interaction
					: null;

		if (errorReplyInteraction) {
			try {
				await replyInfoEmbed(errorReplyInteraction, locale, {
					titleKey: "general.errors.unknown_error_title",
					descriptionKey: "general.errors.unknown_error_description",
					color: ColorCode.ERROR,
					flags: MessageFlags.Ephemeral,
				});
			} catch (replyError) {
				log.error(
					"Failed to send error reply in personalmemory catch block",
					replyError,
					{ ...context, errorType: "ErrorReplyFailed" },
				);
			}
		} else {
			log.warn(
				"Interaction was not replied or deferred in personalmemory catch block, cannot send error message to user.",
				context,
			);
		}
	}
}
