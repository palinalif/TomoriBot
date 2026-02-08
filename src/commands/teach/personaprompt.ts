import type {
	ChatInputCommandInteraction,
	Client,
	SlashCommandSubcommandBuilder,
} from "discord.js";
import { MessageFlags, TextInputStyle } from "discord.js";
import type { UserRow, TomoriState } from "@/types/db/schema";
import { log, ColorCode } from "@/utils/misc/logger";
import {
	replyInfoEmbed,
	promptWithRawModal,
} from "@/utils/discord/interactionHelper";
import { getCachedTomoriState, invalidateTomoriStateCache } from "@/utils/cache/tomoriStateCache";
import { loadAllPersonasForServer } from "@/utils/db/dbRead";
import { sql } from "@/utils/db/client";

const MODAL_CUSTOM_ID = "teach_personaprompt_modal";
const PERSONA_PROMPT_INPUT_ID = "persona_prompt_input";

export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("personaprompt")
		.setDescription("Set a persona-specific prompt appended after sysprompt")
		.addStringOption((option) =>
			option
				.setName("persona")
				.setDescription("Target persona nickname (defaults to current main persona)")
				.setRequired(false),
		);

export async function execute(
	_client: Client,
	interaction: ChatInputCommandInteraction,
	_userData: UserRow,
	locale: string,
): Promise<void> {
	if (!interaction.channel) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.channel_only_title",
			descriptionKey: "general.errors.channel_only_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (interaction.guild) {
		const hasPermission =
			interaction.memberPermissions?.has("ManageGuild") ?? false;
		if (!hasPermission) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.persona.remove.no_permission_title",
				descriptionKey: "commands.persona.remove.no_permission_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
	}

	let tomoriState: TomoriState | null = null;
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

		const personaNameInput = interaction.options.getString("persona");
		const allPersonas = await loadAllPersonasForServer(serverDiscId);
		const selectedPersona = personaNameInput
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

		const modalResult = await promptWithRawModal(interaction, locale, {
			modalCustomId: MODAL_CUSTOM_ID,
			modalTitleKey: "Set Persona Prompt",
			components: [
				{
					customId: PERSONA_PROMPT_INPUT_ID,
					labelKey: "Persona Prompt",
					descriptionKey:
						"This will be appended after the system prompt for this persona.",
					placeholder:
						"Example: Speak like a veteran tactician, concise and calm.",
					style: TextInputStyle.Paragraph,
					required: true,
					maxLength: 8000,
				},
			],
		});

		if (modalResult.outcome !== "submit") {
			log.info(
				`Teach personaprompt modal ${modalResult.outcome} for user ${interaction.user.id}`,
			);
			return;
		}

		const modalSubmitInteraction = modalResult.interaction;
		const personaPrompt = modalResult.values?.[PERSONA_PROMPT_INPUT_ID]?.trim();
		if (!modalSubmitInteraction || !personaPrompt) {
			return;
		}

		await sql`
			INSERT INTO persona_configs (tomori_id, persona_prompt)
			VALUES (${selectedPersona.tomori_id}, ${personaPrompt})
			ON CONFLICT (tomori_id) DO UPDATE
			SET persona_prompt = EXCLUDED.persona_prompt
		`;

		invalidateTomoriStateCache(serverDiscId);

		await replyInfoEmbed(modalSubmitInteraction, locale, {
			titleKey: "Success",
			description: `Updated persona prompt for "${selectedPersona.tomori_nickname}".`,
			color: ColorCode.SUCCESS,
		});
	} catch (error) {
		await log.error("Error in /teach personaprompt command", error, {
			serverId: tomoriState?.server_id,
			tomoriId: tomoriState?.tomori_id,
			errorType: "CommandExecutionError",
			metadata: {
				command: "teach personaprompt",
				guildId: interaction.guild?.id,
				userId: interaction.user.id,
			},
		});

		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.unknown_error_title",
			descriptionKey: "general.errors.unknown_error_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
	}
}
