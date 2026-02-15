import {
	TextInputStyle,
	type ChatInputCommandInteraction,
	type Client,
	type ModalSubmitInteraction,
	type SlashCommandSubcommandBuilder,
} from "discord.js";
import { invalidateTomoriStateCache } from "../../utils/cache/tomoriStateCache";
import { localizer } from "../../utils/text/localizer";
import { log, ColorCode } from "../../utils/misc/logger";
import {
	promptWithRawModal,
	replyInfoEmbed,
	safeSelectOptionText,
} from "../../utils/discord/interactionHelper";
import type { TomoriState, UserRow } from "../../types/db/schema";
import { sql } from "@/utils/db/client";
import type { SelectOption } from "../../types/discord/modal";
import { loadAllPersonasForServer } from "../../utils/db/dbRead";

// Configurable limits via environment variables
const MAX_TAGS = Number.parseInt(process.env.NAI_MAX_TAGS || "100", 10);
const MAX_TAG_LENGTH = Number.parseInt(
	process.env.NAI_MAX_TAG_LENGTH || "200",
	10,
);

// Modal field IDs
const MODAL_CUSTOM_ID = "nai_charactertags_modal";
const PERSONA_SELECT_ID = "persona_select";
const TAGS_INPUT_ID = "tags_input";

/**
 * Formats a TEXT[] value for PostgreSQL array literal
 * @param items - Array of strings to format
 * @returns PostgreSQL-compatible array literal string
 */
const formatTextArrayLiteral = (items: string[]): string =>
	`{${items.map((item) => `"${item.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;

/**
 * Configure the subcommand for Discord slash command registration
 * @param subcommand - The subcommand builder to configure
 * @returns Configured subcommand builder
 */
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("charactertags")
		.setDescription(
			localizer("en-US", "commands.novelai.charactertags.description"),
		);

/**
 * Configures NovelAI character tags (imageboard-style) for a persona's self-portrait generation.
 * Tags are used by the generate_image_nai tool when is_self_portrait is true.
 *
 * Flow:
 * 1. Load all personas for the server
 * 2. Show modal with persona dropdown + tag text input
 * 3. Parse, validate, and deduplicate tags
 * 4. Replace all existing tags for the selected persona
 * 5. Invalidate cache
 *
 * @param _client - Discord client instance
 * @param interaction - Command interaction from Discord
 * @param userData - User data from database
 * @param locale - User's locale preference
 */
export async function execute(
	_client: Client,
	interaction: ChatInputCommandInteraction,
	userData: UserRow,
	locale: string,
): Promise<void> {
	// 1. Ensure command is run in a guild
	if (!interaction.guild || !interaction.channel) {
		await replyInfoEmbed(interaction, userData.language_pref, {
			titleKey: "general.errors.guild_only_title",
			descriptionKey: "general.errors.guild_only_description",
			color: ColorCode.ERROR,
		});
		return;
	}

	let modalSubmitInteraction: ModalSubmitInteraction | null = null;
	let selectedPersona: TomoriState | null = null;

	try {
		// 2. Load all personas for the server
		const allPersonas = await loadAllPersonasForServer(interaction.guild.id);
		if (allPersonas.length === 0) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.errors.tomori_not_setup_title",
				descriptionKey: "general.errors.tomori_not_setup_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		// 3. Build persona select options
		const personaSelectOptions: SelectOption[] = allPersonas
			.filter((persona) => persona.tomori_id !== undefined)
			.map((persona) => ({
				label: safeSelectOptionText(persona.tomori_nickname),
				value: persona.tomori_id?.toString() ?? "",
				description: persona.is_alter
					? localizer(
							locale,
							"commands.server.trigger.add.alter_persona_description",
						)
					: localizer(
							locale,
							"commands.server.trigger.add.main_persona_description",
						),
			}))
			.filter((option) => option.value !== "");

		if (personaSelectOptions.length === 0) {
			log.error(
				"No selectable personas found while building character tags modal options",
			);
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.errors.unknown_error_title",
				descriptionKey: "general.errors.unknown_error_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		// 4. Show modal with persona select + tags text input
		const modalResult = await promptWithRawModal(interaction, locale, {
			modalCustomId: MODAL_CUSTOM_ID,
			modalTitleKey: "commands.novelai.charactertags.modal_title",
			components: [
				{
					customId: PERSONA_SELECT_ID,
					labelKey: "commands.novelai.charactertags.persona_select_label",
					descriptionKey:
						"commands.novelai.charactertags.persona_select_description",
					placeholder:
						"commands.novelai.charactertags.persona_select_placeholder",
					required: true,
					options: personaSelectOptions,
				},
				{
					customId: TAGS_INPUT_ID,
					labelKey: "commands.novelai.charactertags.tags_input_label",
					descriptionKey:
						"commands.novelai.charactertags.tags_input_description",
					placeholder: "commands.novelai.charactertags.tags_input_placeholder",
					style: TextInputStyle.Paragraph,
					required: false, // Empty input clears tags
					maxLength: 4000,
				},
			],
		});

		if (modalResult.outcome !== "submit") {
			log.info(
				`Character tags modal ${modalResult.outcome} for user ${userData.user_id}`,
			);
			return;
		}

		// biome-ignore lint/style/noNonNullAssertion: Modal submission outcome "submit" guarantees interaction exists
		modalSubmitInteraction = modalResult.interaction!;
		const selectedPersonaId = modalResult.values?.[PERSONA_SELECT_ID];
		const tagsInput = modalResult.values?.[TAGS_INPUT_ID];

		if (!selectedPersonaId) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "general.errors.unknown_error_title",
				descriptionKey: "general.errors.unknown_error_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		// 5. Find the selected persona
		selectedPersona =
			allPersonas.find(
				(persona) => persona.tomori_id?.toString() === selectedPersonaId,
			) ?? null;

		if (!selectedPersona) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "general.errors.unknown_error_title",
				descriptionKey: "general.errors.unknown_error_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		// 6. Handle empty input — clear all tags
		if (!tagsInput || tagsInput.trim().length === 0) {
			const personaId = selectedPersona.tomori_id;
			await sql`
				UPDATE tomoris
				SET nai_tags = ARRAY[]::TEXT[]
				WHERE tomori_id = ${personaId}
			`;
			invalidateTomoriStateCache(interaction.guild.id);

			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "commands.novelai.charactertags.cleared_title",
				descriptionKey: "commands.novelai.charactertags.cleared_description",
				descriptionVars: {
					persona_name: selectedPersona.tomori_nickname,
				},
				color: ColorCode.SUCCESS,
			});
			return;
		}

		// 7. Parse tags: split by comma (ASCII and fullwidth), trim, deduplicate
		//    Note: Do NOT lowercase — NAI tags are case-sensitive for some tags
		const parsedTags = tagsInput
			.split(/[,\u3001]/)
			.map((tag) => tag.trim())
			.filter((tag) => tag.length > 0);

		const uniqueTags: string[] = [];
		const seenTags = new Set<string>();
		for (const tag of parsedTags) {
			if (!seenTags.has(tag)) {
				seenTags.add(tag);
				uniqueTags.push(tag);
			}
		}

		// 8. Validate: at least 1 tag
		if (uniqueTags.length === 0) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "commands.novelai.charactertags.no_tags_title",
				descriptionKey: "commands.novelai.charactertags.no_tags_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		// 9. Validate: max tag count
		if (uniqueTags.length > MAX_TAGS) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "commands.novelai.charactertags.too_many_tags_title",
				descriptionKey:
					"commands.novelai.charactertags.too_many_tags_description",
				descriptionVars: { max_tags: MAX_TAGS.toString() },
				color: ColorCode.ERROR,
			});
			return;
		}

		// 10. Validate: individual tag length
		for (const tag of uniqueTags) {
			if (tag.length > MAX_TAG_LENGTH) {
				await replyInfoEmbed(modalSubmitInteraction, locale, {
					titleKey: "commands.novelai.charactertags.tag_too_long_title",
					descriptionKey:
						"commands.novelai.charactertags.tag_too_long_description",
					descriptionVars: { max_length: MAX_TAG_LENGTH.toString() },
					color: ColorCode.ERROR,
				});
				return;
			}
		}

		// 11. Replace all existing tags in the database
		const personaId = selectedPersona.tomori_id;
		const tagArrayLiteral = formatTextArrayLiteral(uniqueTags);

		await sql`
			UPDATE tomoris
			SET nai_tags = ${tagArrayLiteral}::TEXT[]
			WHERE tomori_id = ${personaId}
		`;

		// 12. Invalidate cache so next access gets fresh data
		invalidateTomoriStateCache(interaction.guild.id);

		// 13. Success response with tag list
		await replyInfoEmbed(modalSubmitInteraction, locale, {
			titleKey: "commands.novelai.charactertags.success_title",
			descriptionKey: "commands.novelai.charactertags.success_description",
			descriptionVars: {
				persona_name: selectedPersona.tomori_nickname,
				tag_list: uniqueTags.join(", "),
			},
			color: ColorCode.SUCCESS,
		});
	} catch (error) {
		const context = {
			errorType: "CommandExecutionError",
			metadata: {
				command: "nai charactertags",
				guildId: interaction.guild.id,
				personaId: selectedPersona?.tomori_id ?? null,
			},
		};
		await log.error("Error in /nai charactertags command", error, context);

		const errorReplyInteraction = modalSubmitInteraction ?? interaction;

		await replyInfoEmbed(errorReplyInteraction, locale, {
			titleKey: "general.errors.unknown_error_title",
			descriptionKey: "general.errors.unknown_error_description",
			color: ColorCode.ERROR,
		});
	}
}
