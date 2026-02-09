import type {
	ChatInputCommandInteraction,
	Client,
	SlashCommandSubcommandBuilder,
	ModalSubmitInteraction,
} from "discord.js";
import { MessageFlags, TextInputStyle } from "discord.js";
import { sql } from "@/utils/db/client";
import {
	tomoriSchema, // Use tomoriSchema for validation
	type UserRow,
	type ErrorContext,
	type TomoriState,
} from "../../types/db/schema";
import { localizer } from "../../utils/text/localizer";
import { log, ColorCode } from "../../utils/misc/logger";
import {
	replyInfoEmbed,
	promptWithPaginatedModal,
	safeSelectOptionText,
} from "../../utils/discord/interactionHelper";
import { isBlacklisted, loadAllPersonasForServer } from "../../utils/db/dbRead";
import {
	getCachedTomoriState,
	invalidateTomoriStateCache,
} from "../../utils/cache/tomoriStateCache";
import type { SelectOption } from "../../types/discord/modal";
import {
	checkSampleDialogueLimit,
	getMemoryLimits,
	validateSampleDialogue,
} from "../../utils/db/memoryLimits";

// Get memory limits from environment variables
const memoryLimits = getMemoryLimits();

// Rule 20: Constants (Modal IDs, Input IDs)
const MODAL_CUSTOM_ID = "teach_sampledialogue_add_modal";
const PERSONA_SELECT_ID = "persona_select";
const USER_INPUT_ID = "user_input";
const BOT_INPUT_ID = "bot_input";

// Rule 21: Configure the subcommand
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("sampledialogue")
		.setDescription(
			localizer("en-US", "commands.teach.sampledialogue.description"),
		);

/**
 * Rule 1: JSDoc comment for exported function
 * Adds a sample dialogue pair to Tomori's memory for the server.
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
			flags: MessageFlags.Ephemeral, // User Request
		});
		return;
	}

	let tomoriState: TomoriState | null = null;
	let selectedPersona: TomoriState | null = null;
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

		// 4. Load server's Tomori state (Rule 17)
		tomoriState = await getCachedTomoriState(
			interaction.guild?.id ?? interaction.user.id,
		);

		// 5. Check if Tomori is set up and if sample dialogue teaching is enabled
		if (!tomoriState) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.errors.tomori_not_setup_title",
				descriptionKey: "general.errors.tomori_not_setup_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 6. Resolve target persona options
		const allPersonas = await loadAllPersonasForServer(
			interaction.guild?.id ?? interaction.user.id,
		);
		const personaSelectOptions: SelectOption[] = allPersonas
			.filter((persona) => persona.tomori_id !== undefined)
			.map((persona) => ({
				label: safeSelectOptionText(persona.tomori_nickname),
				value: persona.tomori_id?.toString() ?? "",
				description: persona.is_alter
					? localizer(
							locale,
							"commands.teach.sampledialogue.alter_persona_description",
						)
					: localizer(
							locale,
							"commands.teach.sampledialogue.main_persona_description",
						),
			}))
			.filter((option) => option.value !== "");
		if (personaSelectOptions.length === 0) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.errors.invalid_option_title",
				descriptionKey: "general.errors.invalid_option_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 7. Check if sample dialogue teaching is enabled and if user has bypass permissions
		// Access config directly from tomoriState
		if (
			!tomoriState.config.sampledialogue_memteaching_enabled &&
			!hasManagePermission
		) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.teach.sampledialogue.teaching_disabled_title",
				descriptionKey:
					"commands.teach.sampledialogue.teaching_disabled_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 8. Prompt user with persona selector + dialogue inputs
		// NOTE: Ensure locale keys resolve to strings <= 45 chars for labels!
		const modalResult = await promptWithPaginatedModal(interaction, locale, {
			modalCustomId: MODAL_CUSTOM_ID,
			modalTitleKey: "commands.teach.sampledialogue.modal_title",
			components: [
				{
					customId: PERSONA_SELECT_ID,
					labelKey: "commands.teach.sampledialogue.persona_select_label",
					descriptionKey:
						"commands.teach.sampledialogue.persona_select_description",
					placeholder:
						"commands.teach.sampledialogue.persona_select_placeholder",
					required: true,
					options: personaSelectOptions,
				},
				{
					customId: USER_INPUT_ID,
					// Ensure this locale key's value is <= 45 chars
					labelKey: "commands.teach.sampledialogue.user_input_label",
					descriptionKey:
						"commands.teach.sampledialogue.user_input_description",
					placeholder: "commands.teach.sampledialogue.user_input_placeholder",
					style: TextInputStyle.Paragraph,
					required: true,
					maxLength: memoryLimits.maxSampleDialogueLength,
				},
				{
					customId: BOT_INPUT_ID,
					// Ensure this locale key's value is <= 45 chars
					labelKey: "commands.teach.sampledialogue.bot_input_label",
					descriptionKey: "commands.teach.sampledialogue.bot_input_description",
					placeholder: "commands.teach.sampledialogue.bot_input_placeholder",
					style: TextInputStyle.Paragraph,
					required: true,
					maxLength: memoryLimits.maxSampleDialogueLength,
				},
			],
		});

		// 10. Handle modal outcome
		if (modalResult.outcome !== "submit") {
			log.info(
				`Sample dialogue add modal ${modalResult.outcome} for user ${userData.user_id}`,
			);
			return;
		}

		// biome-ignore lint/style/noNonNullAssertion: Modal submit guarantees interaction exists
		modalSubmitInteraction = modalResult.interaction!;

		// Resolve selected persona from modal
		// biome-ignore lint/style/noNonNullAssertion: Modal submit + required=true guarantees value
		const selectedPersonaId = modalResult.values![PERSONA_SELECT_ID];
		selectedPersona =
			allPersonas.find(
				(persona) => persona.tomori_id?.toString() === selectedPersonaId,
			) ?? null;
		if (!selectedPersona?.tomori_id) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "general.errors.invalid_option_title",
				descriptionKey: "general.errors.invalid_option_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		// 8.5 Check sample dialogue limit after persona resolution
		const dialogueLimitCheck = await checkSampleDialogueLimit(
			selectedPersona.tomori_id,
		);
		if (!dialogueLimitCheck.isValid) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "commands.teach.sampledialogue.limit_exceeded_title",
				descriptionKey:
					"commands.teach.sampledialogue.limit_exceeded_description",
				descriptionVars: {
					current_count: dialogueLimitCheck.currentCount?.toString() || "0",
					max_allowed: (dialogueLimitCheck.maxAllowed || 10).toString(),
				},
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 11. Get inputs from modal - let helper functions manage interaction state
		// biome-ignore lint/style/noNonNullAssertion: Modal submit + required=true guarantees values exist
		const userInput = modalResult.values![USER_INPUT_ID];
		// biome-ignore lint/style/noNonNullAssertion: Modal submit + required=true guarantees values exist
		const botInput = modalResult.values![BOT_INPUT_ID];

		// 12. Validate sample dialogue content lengths (server-side validation, modal maxLength can be bypassed)
		const userInputValidation = validateSampleDialogue(userInput);
		if (!userInputValidation.isValid) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "commands.teach.sampledialogue.user_input_too_long_title",
				descriptionKey: "commands.teach.sampledialogue.user_input_too_long_description",
				descriptionVars: {
					current_length: userInput.length.toString(),
					max_allowed: (userInputValidation.maxAllowed || memoryLimits.maxSampleDialogueLength).toString(),
				},
				color: ColorCode.ERROR,
			});
			return;
		}

		const botInputValidation = validateSampleDialogue(botInput);
		if (!botInputValidation.isValid) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "commands.teach.sampledialogue.bot_input_too_long_title",
				descriptionKey: "commands.teach.sampledialogue.bot_input_too_long_description",
				descriptionVars: {
					current_length: botInput.length.toString(),
					max_allowed: (botInputValidation.maxAllowed || memoryLimits.maxSampleDialogueLength).toString(),
				},
				color: ColorCode.ERROR,
			});
			return;
		}

		// 13. Update target persona row in the database using Bun SQL
		// Use array_append for atomic array operations
		const [updatedTomoriResult] = await sql`
			UPDATE tomoris
			SET
				sample_dialogues_in = array_append(sample_dialogues_in, ${userInput}),
				sample_dialogues_out = array_append(sample_dialogues_out, ${botInput})
			WHERE tomori_id = ${selectedPersona.tomori_id}
			RETURNING *
		`;

		// 13. Validate the result from the database (Rule 3, 5, 6)
		// Note: tomoriSchema validates a TomoriRow, not the full TomoriState
		const validationResult = tomoriSchema.safeParse(updatedTomoriResult);

		if (!validationResult.success) {
			// Rule 22: Log error with context (Access IDs directly)
			const context: ErrorContext = {
				userId: userData.user_id,
				serverId: tomoriState.server_id, // Direct access
				tomoriId: selectedPersona.tomori_id,
				errorType: "DatabaseValidationError",
				metadata: {
					command: "teach sampledialogue",
					userDiscordId: interaction.user.id,
					validationErrors: validationResult.error.issues,
				},
			};
			await log.error(
				"Failed to validate updated tomori data after adding sample dialogue",
				validationResult.error,
				context,
			);

			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "general.errors.update_failed_title",
				descriptionKey: "general.errors.update_failed_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 14. Invalidate cache so next message gets fresh config
		invalidateTomoriStateCache(interaction.guild?.id ?? interaction.user.id);

		// 15. Success! Confirm addition (Rule 12, 19)
		await replyInfoEmbed(modalSubmitInteraction, locale, {
			titleKey: "commands.teach.sampledialogue.success_title",
			descriptionKey: "commands.teach.sampledialogue.success_description",
			descriptionVars: {
				user_input:
					userInput.length > 96 ? `${userInput.slice(0, 96)}...` : userInput,
				bot_input:
					botInput.length > 96 ? `${botInput.slice(0, 96)}...` : botInput,
			},
			color: ColorCode.SUCCESS,
			flags: MessageFlags.Ephemeral,
		});
	} catch (error) {
		// Rule 22: Log error with context
		const context: ErrorContext = {
			userId: userData.user_id,
			serverId: tomoriState?.server_id,
			tomoriId: selectedPersona?.tomori_id ?? tomoriState?.tomori_id,
			errorType: "CommandExecutionError",
			metadata: {
				command: "teach sampledialogue",
				userDiscordId: interaction.user.id,
				guildId: interaction.guild?.id,
			},
		};
		await log.error("Error in /teach sampledialogue command", error, context);

		const errorReplyInteraction =
			modalSubmitInteraction ??
			(interaction.replied || interaction.deferred ? interaction : null);
		if (errorReplyInteraction) {
			await replyInfoEmbed(errorReplyInteraction, locale, {
				titleKey: "general.errors.unknown_error_title",
				descriptionKey: "general.errors.unknown_error_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
		} else {
			log.warn(
				"Interaction was not replied or deferred in sampledialogue, cannot send error message to user.",
				context,
			);
		}
	}
}
