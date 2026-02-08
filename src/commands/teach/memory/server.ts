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
import { isBlacklisted, loadAllPersonasForServer } from "../../../utils/db/dbRead";
import {
	getCachedTomoriState,
	invalidateTomoriStateCache,
} from "../../../utils/cache/tomoriStateCache";
import type { ModalResult } from "../../../types/discord/modal";
import {
	validateMemoryContent,
	checkServerMemoryLimit,
	getMemoryLimits,
} from "../../../utils/db/memoryLimits";
import { addServerMemoryByTomori } from "../../../utils/db/dbWrite";

// Rule 20: Constants for modal and input IDs
const MODAL_CUSTOM_ID = "teach_servermemory_add_modal";
const MEMORY_INPUT_ID = "memory_input";

// Get memory limits from environment variables
const memoryLimits = getMemoryLimits();

// Rule 21: Configure the subcommand
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("server")
		.setDescription(
			localizer("en-US", "commands.teach.memory.server.description"),
		)
		.addStringOption((option) =>
			option
				.setName("persona")
				.setDescription("Target persona nickname (defaults to current main persona)")
				.setRequired(false),
		);

/**
 * Rule 1: JSDoc comment for exported function
 * Adds a server memory to Tomori's knowledge for the server by inserting into the server_memories table.
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

	// Define state and modal result outside try for catch block
	let tomoriState: TomoriState | null = null;
	let selectedPersona: TomoriState | null = null;
	let modalResult: ModalResult | null = null;
	// Define modalSubmitInteraction here to be accessible in catch block
	let modalSubmitInteraction: ModalSubmitInteraction | null = null;

	try {
		// 2. Check if user has Manage Server permission - used for blacklist and teaching restriction bypass
		const hasManagePermission =
			interaction.memberPermissions?.has("ManageGuild") ?? false;

		// 3. Check blacklisting only for guild contexts
		// Users with Manage Server permission can bypass blacklist (they can unblacklist themselves anyway)
		if (interaction.guild) {
			const blacklisted =
				(await isBlacklisted(interaction.guild.id, interaction.user.id)) ??
				false;
			if (blacklisted && !hasManagePermission) {
				await replyInfoEmbed(interaction, locale, {
					titleKey: "general.errors.user_blacklisted_title",
					descriptionKey: "general.errors.user_blacklisted_description",
					color: ColorCode.ERROR,
					flags: MessageFlags.Ephemeral,
				});
				return;
			}
		}

		// 4. Load server's Tomori state (Rule 17) - Still needed for server_id and config checks
		tomoriState = await getCachedTomoriState(
			interaction.guild?.id ?? interaction.user.id,
		);

		// 5. Check if Tomori is set up
		if (!tomoriState) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.errors.tomori_not_setup_title",
				descriptionKey: "general.errors.tomori_not_setup_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 6. Resolve target persona (default: current main persona)
		const personaNameInput = interaction.options.getString("persona");
		const allPersonas = await loadAllPersonasForServer(
			interaction.guild?.id ?? interaction.user.id,
		);
		selectedPersona = personaNameInput
			? allPersonas.find(
					(persona) =>
						persona.tomori_nickname.toLowerCase() ===
						personaNameInput.toLowerCase(),
				) ?? null
			: allPersonas.find((persona) => !persona.is_alter) ?? null;

		if (!selectedPersona?.tomori_id) {
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

		// 7. Check if server memory teaching is enabled
		// NOTE: Check the correct config key name from tomori_configs table
		if (
			!tomoriState.config.server_memteaching_enabled && // Assuming this is the correct key
			!hasManagePermission
		) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.teach.memory.server.teaching_disabled_title",
				descriptionKey:
					"commands.teach.memory.server.teaching_disabled_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 8. Check server memory limit before showing modal (better UX)
		const serverLimitCheck = await checkServerMemoryLimit(
			tomoriState.server_id,
			selectedPersona.tomori_id,
			true,
		);
		if (!serverLimitCheck.isValid) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.teach.memory.server.limit_exceeded_title",
				descriptionKey:
					"commands.teach.memory.server.limit_exceeded_description",
				descriptionVars: {
					current_count: serverLimitCheck.currentCount?.toString() || "0",
					max_allowed: (
						serverLimitCheck.maxAllowed || memoryLimits.maxServerMemories
					).toString(),
				},
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 9. Prompt user with a modal with Component Type 18 support (Rule 10, 12, 19, 25)
		modalResult = await promptWithRawModal(interaction, locale, {
			modalCustomId: MODAL_CUSTOM_ID,
			modalTitleKey: "commands.teach.memory.server.modal_title",
			components: [
				{
					customId: MEMORY_INPUT_ID,
					labelKey: "commands.teach.memory.server.memory_input_label",
					descriptionKey: "commands.teach.memory.server.modal_description",
					placeholder: "commands.teach.memory.server.memory_input_placeholder",
					style: TextInputStyle.Paragraph,
					required: true,
					maxLength: memoryLimits.maxMemoryLength,
				},
			],
		});

		// 10. Handle modal outcome
		if (modalResult.outcome !== "submit") {
			log.info(
				`Server memory add modal ${modalResult.outcome} for user ${userData.user_id}`,
			);
			return;
		}

		// 11. Capture the modal submission interaction - let helper functions manage interaction state
		// biome-ignore lint/style/noNonNullAssertion: Outcome 'submit' guarantees interaction
		modalSubmitInteraction = modalResult.interaction!;

		// 12. Get input from modal
		// biome-ignore lint/style/noNonNullAssertion: Outcome 'submit' + required=true guarantees value
		const newMemory = modalResult.values![MEMORY_INPUT_ID];

		// 13. Validate memory content length
		const contentValidation = validateMemoryContent(newMemory);
		if (!contentValidation.isValid) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "commands.teach.memory.server.content_too_long_title",
				descriptionKey:
					"commands.teach.memory.server.content_too_long_description",
				descriptionVars: { max_length: memoryLimits.maxMemoryLength },
				color: ColorCode.ERROR,
			});
			return;
		}

		// 14. Insert into persona-scoped server memories table
		const insertedMemory = await addServerMemoryByTomori(
			// biome-ignore lint/style/noNonNullAssertion: checked above
			tomoriState.server_id!,
			selectedPersona.tomori_id,
			// biome-ignore lint/style/noNonNullAssertion: user row from middleware
			userData.user_id!,
			newMemory,
		);

		if (!insertedMemory) {
			// Rule 22: Log error with context
			const context: ErrorContext = {
				userId: userData.user_id,
				serverId: tomoriState.server_id,
				tomoriId: selectedPersona.tomori_id,
				errorType: "DatabaseValidationError",
				metadata: {
					command: "teach servermemory",
					table: "server_memories",
					operation: "INSERT",
					userDiscordId: interaction.user.id,
					newMemoryContent: newMemory,
					targetTomoriId: selectedPersona.tomori_id,
				},
			};
			await log.error(
				"Failed to insert server memory data",
				new Error("Insert returned null"),
				context,
			);

			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "general.errors.update_failed_title", // Re-use generic failure message
				descriptionKey: "general.errors.update_failed_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		// 15. Invalidate cache so next message gets fresh config
		invalidateTomoriStateCache(interaction.guild?.id ?? interaction.user.id);

		// 16. Success! Confirm addition (Rule 12, 19)
		await replyInfoEmbed(modalSubmitInteraction, locale, {
			titleKey: "commands.teach.memory.server.success_title",
			descriptionKey: "commands.teach.memory.server.success_description",
			descriptionVars: {
				memory:
					newMemory.length > 96 ? `${newMemory.slice(0, 96)}...` : newMemory, // Truncate for display
			},
			color: ColorCode.SUCCESS,
		});
	} catch (error) {
		// Rule 22: Log error with context
		const context: ErrorContext = {
			userId: userData.user_id,
			serverId: tomoriState?.server_id,
			tomoriId: tomoriState?.tomori_id,
			errorType: "CommandExecutionError",
			metadata: {
				command: "teach servermemory",
				userDiscordId: interaction.user.id,
				guildId: interaction.guild?.id,
			},
		};
		await log.error("Error in /teach servermemory command", error, context);

		// Rule 12, 19: Reply with unknown error embed
		// Determine which interaction to use (Rule 25)
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
					"Failed to send error reply in servermemory catch block",
					replyError,
					{ ...context, errorType: "ErrorReplyFailed" },
				);
			}
		} else {
			log.warn(
				"Interaction was not replied or deferred in servermemory catch block, cannot send error message to user.",
				context,
			);
		}
	}
}
