import type {
	ChatInputCommandInteraction,
	Client,
	SlashCommandSubcommandBuilder,
	ModalSubmitInteraction,
} from "discord.js";
import { AttachmentBuilder, MessageFlags, EmbedBuilder } from "discord.js";
import { localizer } from "../../utils/text/localizer";
import { log, ColorCode } from "../../utils/misc/logger";
import {
	replyInfoEmbed,
	promptWithPaginatedModal,
	safeSelectOptionText,
} from "../../utils/discord/interactionHelper";
import type { UserRow } from "../../types/db/schema";
import {
	exportPersonalData,
	exportServerData,
	exportPersonalityData,
} from "../../utils/db/dataExport";
import { loadAllPersonasForServer } from "@/utils/db/dbRead";
import type { SelectOption } from "../../types/discord/modal";

const EXPORT_PERSONA_MODAL_ID = "data_export_persona_modal";
const EXPORT_PERSONA_SELECT_ID = "persona_select";
const SCOPE_PERSONA = "persona";
const SCOPE_GLOBAL = "global";
const SCOPE_SERVERWIDE = "serverwide";

/**
 * Configure the 'export' subcommand
 */
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("export")
		.setDescription(localizer("en-US", "commands.data.export.description"))
		.addStringOption((option) =>
			option
				.setName("type")
				.setDescription(
					localizer("en-US", "commands.data.export.type_description"),
				)
				.setRequired(true)
				.addChoices(
					{
						name: localizer(
							"en-US",
							"commands.data.export.type_choice_personal",
						),
						value: "personal",
					},
					{
						name: localizer("en-US", "commands.data.export.type_choice_server"),
						value: "server",
					},
					{
						name: localizer(
							"en-US",
							"commands.data.export.type_choice_personality",
						),
						value: "personality",
					},
				),
		)
		.addStringOption((option) =>
			option
				.setName("scope")
				.setDescription(
					localizer("en-US", "commands.data.export.scope_description"),
				)
				.setRequired(false)
				.addChoices(
					{
						name: localizer(
							"en-US",
							"commands.data.export.scope_choice_persona",
						),
						value: SCOPE_PERSONA,
					},
					{
						name: localizer(
							"en-US",
							"commands.data.export.scope_choice_global",
						),
						value: SCOPE_GLOBAL,
					},
					{
						name: localizer(
							"en-US",
							"commands.data.export.scope_choice_serverwide",
						),
						value: SCOPE_SERVERWIDE,
					},
				),
		);

/**
 * Executes the 'export' command
 * Exports user or server data to a JSON file and sends it via DM
 * @param client - The Discord client instance
 * @param interaction - The chat input command interaction
 * @param userData - The user data for the invoking user
 * @param locale - The user's preferred locale
 */
export async function execute(
	_client: Client,
	interaction: ChatInputCommandInteraction,
	_userData: UserRow,
	locale: string,
): Promise<void> {
	// 1. Get the export type option
	const exportType = interaction.options.getString("type", true);
	const scopeInput = interaction.options.getString("scope") ?? SCOPE_PERSONA;
	const serverDiscId = interaction.guild?.id ?? interaction.user.id;
	let responseInteraction:
		| ChatInputCommandInteraction
		| ModalSubmitInteraction = interaction;

	try {
		// 1.5 Validate scope/type compatibility
		if (exportType === "personal" && scopeInput === SCOPE_SERVERWIDE) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.data.export.invalid_scope_title",
				descriptionKey:
					"commands.data.export.invalid_scope_personal_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		if (exportType === "server" && scopeInput === SCOPE_GLOBAL) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.data.export.invalid_scope_title",
				descriptionKey: "commands.data.export.invalid_scope_server_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		if (
			exportType === "personality" &&
			(scopeInput === SCOPE_GLOBAL || scopeInput === SCOPE_SERVERWIDE)
		) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.data.export.invalid_scope_title",
				descriptionKey:
					"commands.data.export.invalid_scope_personality_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 1.6 Resolve target persona for persona-scoped exports
		let targetTomoriId: number | undefined;
		let targetPersonaLineageId = 0;
		let targetPersonaNickname: string | null = null;
		if (scopeInput === SCOPE_PERSONA) {
			const personas = await loadAllPersonasForServer(serverDiscId);
			const personaSelectOptions: SelectOption[] = personas
				.filter((persona) => persona.tomori_id !== undefined)
				.map((persona) => ({
					label: safeSelectOptionText(persona.tomori_nickname),
					value: persona.tomori_id?.toString() ?? "",
					description: persona.is_alter
						? localizer(
								locale,
								"commands.data.export.alter_persona_description",
							)
						: localizer(
								locale,
								"commands.data.export.main_persona_description",
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

			const personaModalResult = await promptWithPaginatedModal(
				interaction,
				locale,
				{
					modalCustomId: EXPORT_PERSONA_MODAL_ID,
					modalTitleKey: "commands.data.export.persona_modal_title",
					components: [
						{
							customId: EXPORT_PERSONA_SELECT_ID,
							labelKey: "commands.data.export.persona_select_label",
							descriptionKey:
								"commands.data.export.persona_select_description",
							placeholder:
								"commands.data.export.persona_select_placeholder",
							required: true,
							options: personaSelectOptions,
						},
					],
				},
			);
			if (personaModalResult.outcome !== "submit") {
				log.info(
					`Data export persona modal ${personaModalResult.outcome} for user ${interaction.user.id}`,
				);
				return;
			}

			const modalSubmitInteraction = personaModalResult.interaction;
			if (!modalSubmitInteraction) {
				return;
			}
			responseInteraction = modalSubmitInteraction;
			const selectedPersonaId =
				personaModalResult.values?.[EXPORT_PERSONA_SELECT_ID];
			const selectedPersona =
				personas.find(
					(persona) => persona.tomori_id?.toString() === selectedPersonaId,
				) ?? null;
			if (!selectedPersona) {
				await replyInfoEmbed(responseInteraction, locale, {
					titleKey: "general.errors.invalid_option_title",
					descriptionKey: "general.errors.invalid_option_description",
					color: ColorCode.ERROR,
				});
				return;
			}

			targetTomoriId = selectedPersona.tomori_id;
			targetPersonaLineageId = selectedPersona.persona_lineage_id ?? 0;
			targetPersonaNickname = selectedPersona.tomori_nickname;
		} else if (scopeInput === SCOPE_GLOBAL) {
			targetPersonaLineageId = 0;
			targetPersonaNickname = "global";
		} else if (scopeInput === SCOPE_SERVERWIDE) {
			targetPersonaNickname = "serverwide";
		}

		// 2. Check permissions for server and personality exports (only in guilds)
		if (exportType === "server" || exportType === "personality") {
			// In guilds, require Manage Server permission
			if (interaction.guild) {
				const hasPermission =
					interaction.memberPermissions?.has("ManageGuild") ?? false;

				if (!hasPermission) {
					await replyInfoEmbed(responseInteraction, locale, {
						titleKey: "commands.data.export.no_permission_title",
						descriptionKey: "commands.data.export.no_permission_description",
						color: ColorCode.ERROR,
						flags: MessageFlags.Ephemeral,
					});
					return;
				}
			}
		}

		// 3. Defer reply while we process
		await responseInteraction.deferReply({ flags: MessageFlags.Ephemeral });

		// 4. Handle personality export separately (returns text instead of JSON)
		if (exportType === "personality") {
			const personalityResult = await exportPersonalityData(
				serverDiscId,
				targetTomoriId,
			);

			if (!personalityResult.success || !personalityResult.text) {
				await responseInteraction.editReply({
					embeds: [
						new EmbedBuilder()
							.setTitle(localizer(locale, "commands.data.export.failed_title"))
							.setDescription(
								personalityResult.error
									? localizer(locale, personalityResult.error)
									: localizer(
											locale,
											"commands.data.export.failed_description",
										),
							)
							.setColor(ColorCode.ERROR),
					],
				});
				return;
			}

			// Create text file attachment
			const personaSlug = (targetPersonaNickname ?? "persona")
				.replace(/[^a-zA-Z0-9-_]/g, "_")
				.slice(0, 32);
			const filename = `tomori-personality-${personaSlug}-${serverDiscId}-${Date.now()}.txt`;
			const attachment = new AttachmentBuilder(
				Buffer.from(personalityResult.text, "utf-8"),
				{
					name: filename,
				},
			);

			// Get bot's avatar for the thumbnail (guild avatar if in guild, default otherwise)
			let botAvatarUrl: string;
			if (interaction.guild) {
				const botMember = await interaction.guild.members.fetch(
					interaction.client.user.id,
				);
				botAvatarUrl = botMember.displayAvatarURL({ size: 256 });
			} else {
				botAvatarUrl = interaction.client.user.displayAvatarURL({ size: 256 });
			}

			// Send to user's DM with bot avatar thumbnail
			try {
				await interaction.user.send({
					embeds: [
						new EmbedBuilder()
							.setTitle(localizer(locale, "commands.data.export.dm_title"))
							.setDescription(
								localizer(
									locale,
									"commands.data.export.dm_description_personality",
								),
							)
							.setThumbnail(botAvatarUrl)
							.setColor(ColorCode.INFO),
					],
					files: [attachment],
				});

				// Confirm success in the channel
				await responseInteraction.editReply({
					embeds: [
						new EmbedBuilder()
							.setTitle(localizer(locale, "commands.data.export.success_title"))
							.setDescription(
								localizer(
									locale,
									"commands.data.export.success_description_personality",
								),
							)
							.setColor(ColorCode.SUCCESS),
					],
				});
			} catch (dmError) {
				// DM failed, likely because user has DMs disabled
				log.warn(
					`Failed to send personality export DM to user ${interaction.user.id}:`,
					dmError as Error,
				);
				await responseInteraction.editReply({
					embeds: [
						new EmbedBuilder()
							.setTitle(
								localizer(locale, "commands.data.export.dm_failed_title"),
							)
							.setDescription(
								localizer(locale, "commands.data.export.dm_failed_description"),
							)
							.setColor(ColorCode.ERROR),
					],
				});
			}
			return;
		}

		// 5. Export data based on type (personal or server)
		let exportResult:
			| Awaited<ReturnType<typeof exportPersonalData>>
			| Awaited<ReturnType<typeof exportServerData>>;
		let filename: string;

		if (exportType === "personal") {
			exportResult = await exportPersonalData(
				interaction.user.id,
				targetPersonaLineageId,
				false,
			);
			const personaSlug = (targetPersonaNickname ?? scopeInput)
				.replace(/[^a-zA-Z0-9-_]/g, "_")
				.slice(0, 32);
			filename = `tomori-personal-${personaSlug}-${interaction.user.id}-${Date.now()}.json`;
		} else if (exportType === "server") {
			exportResult = await exportServerData(serverDiscId, targetTomoriId);
			const personaSlug = (targetPersonaNickname ?? scopeInput)
				.replace(/[^a-zA-Z0-9-_]/g, "_")
				.slice(0, 32);
			filename = `tomori-server-${personaSlug}-${serverDiscId}-${Date.now()}.json`;
		} else {
			await responseInteraction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle(localizer(locale, "general.errors.invalid_option_title"))
						.setDescription(
							localizer(locale, "general.errors.invalid_option_description"),
						)
						.setColor(ColorCode.ERROR),
				],
			});
			return;
		}

		// 6. Handle export errors
		if (!exportResult.success || !exportResult.data) {
			await responseInteraction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle(localizer(locale, "commands.data.export.failed_title"))
						.setDescription(
							exportResult.error
								? localizer(locale, exportResult.error)
								: localizer(locale, "commands.data.export.failed_description"),
						)
						.setColor(ColorCode.ERROR),
				],
			});
			return;
		}

		// 7. Create JSON file attachment
		const jsonString = JSON.stringify(exportResult.data, null, 2);
		const attachment = new AttachmentBuilder(Buffer.from(jsonString, "utf-8"), {
			name: filename,
		});

		// 8. Send to user's DM
		try {
			// Use different description for server exports (mentions excluded data)
			const dmDescriptionKey =
				exportType === "server"
					? "commands.data.export.dm_description_server"
					: "commands.data.export.dm_description";

			await interaction.user.send({
				embeds: [
					new EmbedBuilder()
						.setTitle(localizer(locale, "commands.data.export.dm_title"))
						.setDescription(
							localizer(locale, dmDescriptionKey, {
								type: exportType,
							}),
						)
						.setColor(ColorCode.INFO),
				],
				files: [attachment],
			});

			// 9. Confirm success in the channel
			await responseInteraction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle(localizer(locale, "commands.data.export.success_title"))
						.setDescription(
							localizer(locale, "commands.data.export.success_description", {
								type: exportType,
							}),
						)
						.setColor(ColorCode.SUCCESS),
				],
			});
		} catch (dmError) {
			// DM failed, likely because user has DMs disabled
			log.warn(
				`Failed to send export DM to user ${interaction.user.id}:`,
				dmError as Error,
			);
			await responseInteraction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle(localizer(locale, "commands.data.export.dm_failed_title"))
						.setDescription(
							localizer(locale, "commands.data.export.dm_failed_description"),
						)
						.setColor(ColorCode.ERROR),
				],
			});
		}
	} catch (error) {
		log.error("Error executing export command:", error, {
			errorType: "CommandExecutionError",
			metadata: { commandName: "export", exportType },
		});

		// If we haven't replied yet, reply with error
		if (!responseInteraction.replied && !responseInteraction.deferred) {
			await replyInfoEmbed(responseInteraction, locale, {
				titleKey: "general.errors.unknown_error_title",
				descriptionKey: "general.errors.unknown_error_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
		} else {
			await responseInteraction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle(localizer(locale, "general.errors.unknown_error_title"))
						.setDescription(
							localizer(locale, "general.errors.unknown_error_description"),
						)
						.setColor(ColorCode.ERROR),
				],
			});
		}
	}
}
