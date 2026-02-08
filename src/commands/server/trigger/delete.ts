import {
	MessageFlags,
	type ChatInputCommandInteraction,
	type Client,
	type SlashCommandSubcommandBuilder,
} from "discord.js";
import { localizer } from "../../../utils/text/localizer";
import { log, ColorCode } from "../../../utils/misc/logger";
import {
	replyInfoEmbed,
	promptWithPaginatedModal,
	safeSelectOptionText,
} from "../../../utils/discord/interactionHelper";
import { invalidateTomoriStateCache } from "../../../utils/cache/tomoriStateCache";
import {
	type UserRow,
	type ErrorContext,
	personaConfigSchema,
	type TomoriState,
} from "../../../types/db/schema";
import type { SelectOption } from "../../../types/discord/modal";
import { sql } from "@/utils/db/client";
import { getCachedTomoriState } from "@/utils/cache/tomoriStateCache";

// Modal IDs
const TRIGGER_MODAL_CUSTOM_ID = "server_triggerdelete_trigger_modal";
const TRIGGER_SELECT_ID = "trigger_select";

// Configure the subcommand
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("delete")
		.setDescription(
			localizer("en-US", "commands.server.trigger.delete.description"),
		);

/**
 * Removes a trigger word from the currently active (main) persona.
 */
export async function execute(
	_client: Client,
	interaction: ChatInputCommandInteraction,
	userData: UserRow,
	locale: string,
): Promise<void> {
	if (!interaction.guild || !interaction.channel) {
		await replyInfoEmbed(interaction, userData.language_pref, {
			titleKey: "general.errors.guild_only_title",
			descriptionKey: "general.errors.guild_only_description",
			color: ColorCode.ERROR,
		});
		return;
	}

	let tomoriState: TomoriState | null = null;

	try {
		tomoriState = await getCachedTomoriState(interaction.guild.id);
		if (!tomoriState || !tomoriState.tomori_id) {
			await replyInfoEmbed(
				interaction,
				locale,
				{
					titleKey: "general.errors.tomori_not_setup_title",
					descriptionKey: "general.errors.tomori_not_setup_description",
					color: ColorCode.ERROR,
				},
				MessageFlags.Ephemeral,
			);
			return;
		}

		const currentTriggerWords = tomoriState.trigger_words ?? [];
		if (currentTriggerWords.length === 0) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.server.trigger.delete.no_triggers_title",
				descriptionKey:
					"commands.server.trigger.delete.no_triggers_description",
				color: ColorCode.WARN,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const triggerOptions: SelectOption[] = currentTriggerWords.map(
			(trigger, index) => ({
				label: safeSelectOptionText(trigger, 50),
				value: index.toString(),
				description: undefined,
			}),
		);

		const triggerModalResult = await promptWithPaginatedModal(
			interaction,
			locale,
			{
				modalCustomId: TRIGGER_MODAL_CUSTOM_ID,
				modalTitleKey: "commands.server.trigger.delete.modal_title",
				components: [
					{
						customId: TRIGGER_SELECT_ID,
						labelKey: "commands.server.trigger.delete.select_label",
						descriptionKey:
							"commands.server.trigger.delete.select_description",
						placeholder:
							"commands.server.trigger.delete.select_placeholder",
						required: true,
						options: triggerOptions,
					},
				],
			},
		);

		if (triggerModalResult.outcome !== "submit") {
			log.info(
				`Trigger delete selection modal ${triggerModalResult.outcome} for user ${userData.user_id}`,
			);
			return;
		}

		const triggerModalInteraction = triggerModalResult.interaction;
		const selectedTriggerIndex = triggerModalResult.values?.[TRIGGER_SELECT_ID];
		if (!triggerModalInteraction || !selectedTriggerIndex) {
			log.error("Trigger modal result unexpectedly missing interaction or values");
			return;
		}

		const selectedWord =
			currentTriggerWords[Number.parseInt(selectedTriggerIndex, 10)];
		if (!selectedWord) {
			await replyInfoEmbed(triggerModalInteraction, locale, {
				titleKey: "general.errors.operation_failed_title",
				descriptionKey: "commands.server.trigger.delete.no_triggers_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		// Ensure row exists even for legacy personas that only used old columns
		await sql`
			INSERT INTO persona_configs (tomori_id, trigger_words)
			VALUES (${tomoriState.tomori_id}, ARRAY[]::text[])
			ON CONFLICT (tomori_id) DO NOTHING
		`;

		const [updatedRow] = await sql`
			UPDATE persona_configs
			SET trigger_words = array_remove(trigger_words, ${selectedWord})
			WHERE tomori_id = ${tomoriState.tomori_id}
			RETURNING *
		`;

		const validatedConfig = personaConfigSchema.safeParse(updatedRow);
		if (!validatedConfig.success || !updatedRow) {
			const context: ErrorContext = {
				tomoriId: tomoriState.tomori_id,
				serverId: tomoriState.server_id,
				userId: userData.user_id,
				errorType: "DatabaseUpdateError",
				metadata: {
					command: "server trigger delete",
					guildId: interaction.guild.id,
					triggerWord: selectedWord,
					validationErrors: validatedConfig.success
						? null
						: validatedConfig.error.flatten(),
				},
			};
			await log.error(
				"Failed to update or validate trigger_words in persona_configs table",
				validatedConfig.success
					? new Error("Database update returned no rows")
					: new Error("Updated config data failed validation"),
				context,
			);

			await replyInfoEmbed(triggerModalInteraction, locale, {
				titleKey: "general.errors.update_failed_title",
				descriptionKey: "general.errors.update_failed_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		invalidateTomoriStateCache(interaction.guild.id);

		await replyInfoEmbed(triggerModalInteraction, locale, {
			titleKey: "commands.server.trigger.delete.success_title",
			descriptionKey: "commands.server.trigger.delete.success_description",
			descriptionVars: {
				triggerWord: selectedWord,
			},
			color: ColorCode.SUCCESS,
		});
	} catch (error) {
		const context: ErrorContext = {
			userId: userData.user_id,
			serverId: tomoriState?.server_id,
			tomoriId: tomoriState?.tomori_id,
			errorType: "CommandExecutionError",
			metadata: {
				command: "server trigger delete",
				guildId: interaction.guild?.id,
				executorDiscordId: interaction.user.id,
			},
		};
		await log.error(
			`Unexpected error in /server trigger delete for user ${userData.user_disc_id}`,
			error as Error,
			context,
		);

		if (interaction.deferred || interaction.replied) {
			await interaction.followUp({
				content: localizer(locale, "general.errors.unknown_error_description"),
				flags: MessageFlags.Ephemeral,
			});
		} else {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.errors.unknown_error_title",
				descriptionKey: "general.errors.unknown_error_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
		}
	}
}
