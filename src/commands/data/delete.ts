import type {
	ChatInputCommandInteraction,
	Client,
	ModalSubmitInteraction,
	SlashCommandSubcommandBuilder,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { sql } from "@/utils/db/client";
import { localizer } from "../../utils/text/localizer";
import { log, ColorCode } from "../../utils/misc/logger";
import {
	replyInfoEmbed,
	promptWithPaginatedModal,
	safeSelectOptionText,
} from "../../utils/discord/interactionHelper";
import type {
	UserRow,
	ErrorContext,
	TomoriState,
} from "../../types/db/schema";
import {
	invalidateTomoriStateCache,
} from "../../utils/cache/tomoriStateCache";
import { invalidateEmojiStickerCache } from "../../utils/cache/emojiStickerCache";
import { invalidateWhitelistCache } from "../../utils/cache/channelWhitelistCache";
import { loadAllPersonasForServer } from "@/utils/db/dbRead";
import type { SelectOption } from "../../types/discord/modal";

const DELETE_PERSONA_MODAL_ID = "data_delete_persona_modal";
const DELETE_PERSONA_SELECT_ID = "persona_select";
const SCOPE_PERSONA = "persona";
const SCOPE_GLOBAL = "global";
const SCOPE_SERVERWIDE = "serverwide";

/**
 * Configure the 'delete' subcommand
 */
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("delete")
		.setDescription(localizer("en-US", "commands.data.delete.description"))
		.addStringOption((option) =>
			option
				.setName("type")
				.setDescription(
					localizer("en-US", "commands.data.delete.type_description"),
				)
				.setRequired(true)
				.addChoices(
					{
						name: localizer(
							"en-US",
							"commands.data.delete.type_choice_personal",
						),
						value: "personal",
					},
					{
						name: localizer("en-US", "commands.data.delete.type_choice_server"),
						value: "server",
					},
				),
		)
		.addStringOption((option) =>
			option
				.setName("confirmation")
				.setDescription(
					localizer("en-US", "commands.data.delete.confirmation_description"),
				)
				.setRequired(true)
				.addChoices(
					{
						name: localizer("en-US", "commands.data.delete.confirmation_yes"),
						value: "yes",
					},
					{
						name: localizer("en-US", "commands.data.delete.confirmation_no"),
						value: "no",
					},
				),
		)
		.addStringOption((option) =>
			option
				.setName("scope")
				.setDescription(
					localizer("en-US", "commands.data.delete.scope_description"),
				)
				.setRequired(false)
				.addChoices(
					{
						name: localizer(
							"en-US",
							"commands.data.delete.scope_choice_persona",
						),
						value: SCOPE_PERSONA,
					},
					{
						name: localizer(
							"en-US",
							"commands.data.delete.scope_choice_global",
						),
						value: SCOPE_GLOBAL,
					},
					{
						name: localizer(
							"en-US",
							"commands.data.delete.scope_choice_serverwide",
						),
						value: SCOPE_SERVERWIDE,
					},
				),
		);

/**
 * Executes the 'delete' command
 * Permanently deletes user or server data with proper CASCADE behavior
 * @param client - The Discord client instance
 * @param interaction - The chat input command interaction
 * @param userData - The user data for the invoking user
 * @param locale - The user's preferred locale
 */
export async function execute(
	_client: Client,
	interaction: ChatInputCommandInteraction,
	userData: UserRow,
	locale: string,
): Promise<void> {
	// 1. Get the delete type and confirmation options
	const deleteType = interaction.options.getString("type", true);
	const confirmation = interaction.options.getString("confirmation", true);
	const scopeInput = interaction.options.getString("scope");
	const serverDiscId = interaction.guild?.id ?? interaction.user.id;
	let responseInteraction:
		| ChatInputCommandInteraction
		| ModalSubmitInteraction = interaction;
	let selectedPersona: TomoriState | null = null;

	try {
		// 2. Validate confirmation
		if (confirmation !== "yes") {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.data.delete.confirmation_required_title",
				descriptionKey:
					"commands.data.delete.confirmation_required_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 2.5 Validate scope/type compatibility
		if (deleteType === "personal" && scopeInput === SCOPE_SERVERWIDE) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.data.delete.invalid_scope_title",
				descriptionKey:
					"commands.data.delete.invalid_scope_personal_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		if (deleteType === "server" && scopeInput === SCOPE_GLOBAL) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.data.delete.invalid_scope_title",
				descriptionKey: "commands.data.delete.invalid_scope_server_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 3. Check permissions for server deletions (only in guilds)
		if (deleteType === "server") {
			// In guilds, require Manage Server permission
			if (interaction.guild) {
				const hasPermission =
					interaction.memberPermissions?.has("ManageGuild") ?? false;

				if (!hasPermission) {
					await replyInfoEmbed(interaction, locale, {
						titleKey: "commands.data.delete.no_permission_title",
						descriptionKey: "commands.data.delete.no_permission_description",
						color: ColorCode.ERROR,
						flags: MessageFlags.Ephemeral,
					});
					return;
				}
			}
		}

		// 3.5 Resolve persona when persona scope is requested
		if (scopeInput === SCOPE_PERSONA) {
			const allPersonas = await loadAllPersonasForServer(serverDiscId);
			const personaSelectOptions: SelectOption[] = allPersonas
				.filter((persona) => persona.tomori_id !== undefined)
				.map((persona) => ({
					label: safeSelectOptionText(persona.tomori_nickname),
					value: persona.tomori_id?.toString() ?? "",
					description: persona.is_alter
						? localizer(
								locale,
								"commands.data.delete.alter_persona_description",
							)
						: localizer(
								locale,
								"commands.data.delete.main_persona_description",
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
					modalCustomId: DELETE_PERSONA_MODAL_ID,
					modalTitleKey: "commands.data.delete.persona_modal_title",
					components: [
						{
							customId: DELETE_PERSONA_SELECT_ID,
							labelKey: "commands.data.delete.persona_select_label",
							descriptionKey:
								"commands.data.delete.persona_select_description",
							placeholder:
								"commands.data.delete.persona_select_placeholder",
							required: true,
							options: personaSelectOptions,
						},
					],
				},
			);
			if (personaModalResult.outcome !== "submit") {
				log.info(
					`Data delete persona modal ${personaModalResult.outcome} for user ${interaction.user.id}`,
				);
				return;
			}

			const modalSubmitInteraction = personaModalResult.interaction;
			if (!modalSubmitInteraction) {
				return;
			}
			responseInteraction = modalSubmitInteraction;

			const selectedPersonaId =
				personaModalResult.values?.[DELETE_PERSONA_SELECT_ID];
			selectedPersona =
				allPersonas.find(
					(persona) => persona.tomori_id?.toString() === selectedPersonaId,
				) ?? null;
			if (!selectedPersona?.tomori_id) {
				await replyInfoEmbed(responseInteraction, locale, {
					titleKey: "general.errors.invalid_option_title",
					descriptionKey: "general.errors.invalid_option_description",
					color: ColorCode.ERROR,
				});
				return;
			}
		}

		// 4. Defer reply while we process the deletion
		await responseInteraction.deferReply({ flags: MessageFlags.Ephemeral });

		// 5. Execute deletion based on type
		if (deleteType === "personal") {
			// Scope omitted: keep legacy full delete behavior
			if (!scopeInput) {
				const deletedRows = await sql`
					DELETE FROM users
					WHERE user_disc_id = ${interaction.user.id}
					RETURNING user_id
				`;

				if (deletedRows.length === 0) {
					await replyInfoEmbed(responseInteraction, locale, {
						titleKey: "commands.data.delete.no_data_title",
						descriptionKey: "commands.data.delete.no_data_description",
						color: ColorCode.WARN,
					});
					return;
				}

				log.success(
					`Personal data deleted for user ${interaction.user.id} (user_id: ${deletedRows[0].user_id})`,
				);

				await replyInfoEmbed(responseInteraction, locale, {
					titleKey: "commands.data.delete.success_personal_title",
					descriptionKey: "commands.data.delete.success_personal_description",
					color: ColorCode.SUCCESS,
				});
				return;
			}

			// Scoped personal memory deletion
			const userRows = await sql<Array<{ user_id: number }>>`
				SELECT user_id
				FROM users
				WHERE user_disc_id = ${interaction.user.id}
				LIMIT 1
			`;
			const targetUserId = userRows[0]?.user_id;
			if (!targetUserId) {
				await replyInfoEmbed(responseInteraction, locale, {
					titleKey: "commands.data.delete.no_data_title",
					descriptionKey: "commands.data.delete.no_data_description",
					color: ColorCode.WARN,
				});
				return;
			}

			const targetLineageId =
				scopeInput === SCOPE_PERSONA
					? (selectedPersona?.persona_lineage_id ?? 0)
					: 0;
			const deletedMemories = await sql<Array<{ personal_memory_id: number }>>`
				DELETE FROM personal_memories
				WHERE user_id = ${targetUserId}
				  AND persona_lineage_id = ${targetLineageId}
				RETURNING personal_memory_id
			`;
			if (deletedMemories.length === 0) {
				await replyInfoEmbed(responseInteraction, locale, {
					titleKey: "commands.data.delete.no_data_title",
					descriptionKey:
						scopeInput === SCOPE_PERSONA
							? "commands.data.delete.no_persona_memories_description"
							: "commands.data.delete.no_global_memories_description",
					descriptionVars:
						scopeInput === SCOPE_PERSONA
							? { persona_name: selectedPersona?.tomori_nickname ?? "persona" }
							: undefined,
					color: ColorCode.WARN,
				});
				return;
			}

			await replyInfoEmbed(responseInteraction, locale, {
				titleKey: "commands.data.delete.success_memory_scope_title",
				descriptionKey:
					scopeInput === SCOPE_PERSONA
						? "commands.data.delete.success_persona_memories_description"
						: "commands.data.delete.success_global_memories_description",
				descriptionVars:
					scopeInput === SCOPE_PERSONA
						? {
								persona_name: selectedPersona?.tomori_nickname ?? "persona",
								memory_count: deletedMemories.length.toString(),
							}
						: { memory_count: deletedMemories.length.toString() },
				color: ColorCode.SUCCESS,
			});
		} else if (deleteType === "server") {
			// Persona scope: delete only server memories in that persona scope
			if (scopeInput === SCOPE_PERSONA) {
				const serverRows = await sql<Array<{ server_id: number }>>`
					SELECT server_id
					FROM servers
					WHERE server_disc_id = ${serverDiscId}
					LIMIT 1
				`;
				const serverId = serverRows[0]?.server_id;
				if (!serverId) {
					await replyInfoEmbed(responseInteraction, locale, {
						titleKey: "commands.data.delete.no_server_data_title",
						descriptionKey: "commands.data.delete.no_server_data_description",
						color: ColorCode.WARN,
					});
					return;
				}

				const includeLegacyFallback = selectedPersona?.is_alter !== true;
				const deletedMemories = includeLegacyFallback
					? await sql<Array<{ server_memory_id: number }>>`
						DELETE FROM server_memories
						WHERE server_id = ${serverId}
						  AND (
							tomori_id = ${selectedPersona?.tomori_id}
							OR tomori_id IS NULL
						  )
						RETURNING server_memory_id
					`
					: await sql<Array<{ server_memory_id: number }>>`
						DELETE FROM server_memories
						WHERE server_id = ${serverId}
						  AND tomori_id = ${selectedPersona?.tomori_id}
						RETURNING server_memory_id
					`;
				if (deletedMemories.length === 0) {
					await replyInfoEmbed(responseInteraction, locale, {
						titleKey: "commands.data.delete.no_server_data_title",
						descriptionKey:
							"commands.data.delete.no_persona_server_memories_description",
						descriptionVars: {
							persona_name: selectedPersona?.tomori_nickname ?? "persona",
						},
						color: ColorCode.WARN,
					});
					return;
				}

				invalidateTomoriStateCache(serverDiscId);
				await replyInfoEmbed(responseInteraction, locale, {
					titleKey: "commands.data.delete.success_memory_scope_title",
					descriptionKey:
						"commands.data.delete.success_persona_server_memories_description",
					descriptionVars: {
						persona_name: selectedPersona?.tomori_nickname ?? "persona",
						memory_count: deletedMemories.length.toString(),
					},
					color: ColorCode.SUCCESS,
				});
				return;
			}

			// Scope omitted or serverwide: legacy full server delete behavior
			const deletedRows = await sql`
				DELETE FROM servers
				WHERE server_disc_id = ${serverDiscId}
				RETURNING server_id
			`;

			if (deletedRows.length === 0) {
				await replyInfoEmbed(responseInteraction, locale, {
					titleKey: "commands.data.delete.no_server_data_title",
					descriptionKey: "commands.data.delete.no_server_data_description",
					color: ColorCode.WARN,
				});
				return;
			}

			const serverId = deletedRows[0].server_id;
			invalidateTomoriStateCache(serverDiscId);
			invalidateEmojiStickerCache(serverId);
			invalidateWhitelistCache(serverDiscId);

			log.success(
				`Server data deleted for server ${serverDiscId} (server_id: ${serverId})`,
			);

			await replyInfoEmbed(responseInteraction, locale, {
				titleKey: "commands.data.delete.success_server_title",
				descriptionKey: "commands.data.delete.success_server_description",
				color: ColorCode.SUCCESS,
			});
		} else {
			// Invalid type (should never happen due to addChoices, but handle defensively)
			await replyInfoEmbed(responseInteraction, locale, {
				titleKey: "general.errors.invalid_option_title",
				descriptionKey: "general.errors.invalid_option_description",
				color: ColorCode.ERROR,
			});
		}
	} catch (error) {
		// 6. Handle unexpected errors
		const context: ErrorContext = {
			userId: userData.user_id,
			errorType: "CommandExecutionError",
			metadata: {
				command: "data delete",
				deleteType,
				userDiscordId: interaction.user.id,
				guildDiscordId: interaction.guild?.id,
			},
		};

		await log.error(
			`Error executing /data delete for user ${userData.user_disc_id}`,
			error as Error,
			context,
		);

		// Inform user of error
		if (responseInteraction.deferred || responseInteraction.replied) {
			await replyInfoEmbed(responseInteraction, locale, {
				titleKey: "general.errors.unknown_error_title",
				descriptionKey: "general.errors.unknown_error_description",
				color: ColorCode.ERROR,
			});
		} else {
			await replyInfoEmbed(responseInteraction, locale, {
				titleKey: "general.errors.unknown_error_title",
				descriptionKey: "general.errors.unknown_error_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
		}
	}
}
