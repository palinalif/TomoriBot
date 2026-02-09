import type {
	ChatInputCommandInteraction,
	Client,
	SlashCommandSubcommandBuilder,
	ModalSubmitInteraction,
} from "discord.js";
import { MessageFlags, EmbedBuilder } from "discord.js";
import { localizer } from "../../utils/text/localizer";
import { log, ColorCode } from "../../utils/misc/logger";
import {
	replyInfoEmbed,
	promptWithPaginatedModal,
	safeSelectOptionText,
} from "../../utils/discord/interactionHelper";
import type { UserRow } from "../../types/db/schema";
import { memoryGuard, IMPORT_LIMITS } from "../../utils/security/rateLimiter";
import { invalidateTomoriStateCache } from "../../utils/cache/tomoriStateCache";
import { invalidateUserCache } from "../../utils/cache/userCache";
import {
	validateImportFile,
	importPersonalData,
	importServerData,
} from "../../utils/db/dataImport";
import { loadAllPersonasForServer } from "@/utils/db/dbRead";
import type {
	PersonalExportData,
	ServerExportData,
} from "../../types/db/dataExport";
import type { SelectOption } from "../../types/discord/modal";

const IMPORT_PERSONA_MODAL_ID = "data_import_persona_modal";
const IMPORT_PERSONA_SELECT_ID = "persona_select";

/**
 * Helper function to localize error messages from utility functions
 * Handles both simple locale keys and keys with pipe-separated variables
 * @param locale - User's locale
 * @param errorString - Error string (locale key or key|var1|var2...)
 * @returns Localized error message
 */
function localizeError(locale: string, errorString: string): string {
	const parts = errorString.split("|");
	const key = parts[0];

	if (parts.length === 1) {
		// Simple locale key without variables
		return localizer(locale, key);
	}

	// Handle keys with variables
	if (key === "commands.data.import.error_invalid_memory") {
		return localizer(locale, key, { details: parts[1] });
	}
	if (key === "commands.data.import.error_invalid_server_memory") {
		return localizer(locale, key, { details: parts[1] });
	}
	if (key === "commands.data.import.error_incompatible_version") {
		return localizer(locale, key, { expected: parts[1], actual: parts[2] });
	}
	if (key === "commands.data.import.error_unknown_type") {
		return localizer(locale, key, { type: parts[1] });
	}

	// Fallback: just localize the key
	return localizer(locale, key);
}

// Maximum file size for imports (uses centralized constant)
const MAX_FILE_SIZE = IMPORT_LIMITS.MAX_DATA_IMPORT_SIZE_MB * 1024 * 1024;

/**
 * Configure the 'import' subcommand
 */
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("import")
		.setDescription(localizer("en-US", "commands.data.import.description"))
		.addAttachmentOption((option) =>
			option
				.setName("file")
				.setDescription(
					localizer("en-US", "commands.data.import.file_description"),
				)
				.setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName("confirmation")
				.setDescription(
					localizer("en-US", "commands.data.import.confirmation_description"),
				)
				.setRequired(true)
				.addChoices(
					{
						name: localizer(
							"en-US",
							"commands.data.import.confirmation_choice_yes",
						),
						value: "yes",
					},
					{
						name: localizer(
							"en-US",
							"commands.data.import.confirmation_choice_no",
						),
						value: "no",
					},
				),
		);

/**
 * Executes the 'import' command
 * Imports user or server data from an uploaded JSON file
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
	const serverDiscId = interaction.guild?.id ?? interaction.user.id;
	let responseInteraction:
		| ChatInputCommandInteraction
		| ModalSubmitInteraction = interaction;

	try {
		// 1. Check confirmation
		const confirmation = interaction.options.getString("confirmation", true);

		if (confirmation !== "yes") {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.data.import.cancelled_title",
				descriptionKey: "commands.data.import.cancelled_description",
				color: ColorCode.INFO,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 2. Get uploaded file attachment
		const attachment = interaction.options.getAttachment("file", true);

		// 3. Validate file type and size
		if (!attachment.name.endsWith(".json")) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.data.import.invalid_file_type_title",
				descriptionKey: "commands.data.import.invalid_file_type_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (attachment.size > MAX_FILE_SIZE) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.data.import.file_too_large_title",
				descriptionKey: "commands.data.import.file_too_large_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 3.5 Prompt persona selection before long-running work
		let targetTomoriId: number | undefined;
		let targetPersonaLineageId = 0;
		const personas = await loadAllPersonasForServer(serverDiscId);
		if (personas.length > 0) {
			const personaSelectOptions: SelectOption[] = personas
				.filter((persona) => persona.tomori_id !== undefined)
				.map((persona) => ({
					label: safeSelectOptionText(persona.tomori_nickname),
					value: persona.tomori_id?.toString() ?? "",
					description: persona.is_alter
						? localizer(
								locale,
								"commands.data.import.alter_persona_description",
							)
						: localizer(
								locale,
								"commands.data.import.main_persona_description",
							),
				}))
				.filter((option) => option.value !== "");
			if (personaSelectOptions.length > 0) {
				const personaModalResult = await promptWithPaginatedModal(
					interaction,
					locale,
					{
						modalCustomId: IMPORT_PERSONA_MODAL_ID,
						modalTitleKey: "commands.data.import.persona_modal_title",
						components: [
							{
								customId: IMPORT_PERSONA_SELECT_ID,
								labelKey: "commands.data.import.persona_select_label",
								descriptionKey:
									"commands.data.import.persona_select_description",
								placeholder:
									"commands.data.import.persona_select_placeholder",
								required: true,
								options: personaSelectOptions,
							},
						],
					},
				);
				if (personaModalResult.outcome !== "submit") {
					log.info(
						`Data import persona modal ${personaModalResult.outcome} for user ${interaction.user.id}`,
					);
					return;
				}

				const modalSubmitInteraction = personaModalResult.interaction;
				if (!modalSubmitInteraction) {
					return;
				}
				responseInteraction = modalSubmitInteraction;
				const selectedPersonaId =
					personaModalResult.values?.[IMPORT_PERSONA_SELECT_ID];
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
			}
		}

		// 4. Defer reply while we process
		await responseInteraction.deferReply({ flags: MessageFlags.Ephemeral });

		// 4.5. Memory guard check (defense-in-depth)
		const memCheck = memoryGuard.checkMemory();
		if (memCheck.status === "critical") {
			await responseInteraction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle(
							localizer(locale, "rate_limit.error_memory_critical_title"),
						)
						.setDescription(
							localizer(locale, "rate_limit.error_memory_critical_description"),
						)
						.setColor(ColorCode.ERROR),
				],
			});
			return;
		}

		// 5. Download and parse the JSON file with timeout
		let jsonData: unknown;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

		try {
			const response = await fetch(attachment.url, {
				signal: controller.signal,
			});
			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const textContent = await response.text();
			jsonData = JSON.parse(textContent);
		} catch (error) {
			clearTimeout(timeoutId);

			// Handle timeout vs other errors
			if (error instanceof Error && error.name === "AbortError") {
				log.warn("Data import download timed out");
				await responseInteraction.editReply({
					embeds: [
						new EmbedBuilder()
							.setTitle(
								localizer(
									locale,
									"commands.data.import.error_download_timeout",
								),
							)
							.setColor(ColorCode.ERROR),
					],
				});
				return;
			}

			// Parse/download errors
			log.error("Failed to download or parse import file:", error as Error);
			await responseInteraction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle(
							localizer(locale, "commands.data.import.parse_failed_title"),
						)
						.setDescription(
							localizer(
								locale,
								"commands.data.import.parse_failed_description",
							),
						)
						.setColor(ColorCode.ERROR),
				],
			});
			return;
		}

		// 6. Validate import file structure
		const validation = validateImportFile(jsonData);

		if (!validation.valid || !validation.type || !validation.data) {
			await responseInteraction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle(
							localizer(locale, "commands.data.import.invalid_file_title"),
						)
						.setDescription(
							validation.error
								? localizeError(locale, validation.error)
								: localizer(
										locale,
										"commands.data.import.invalid_file_description",
									),
						)
						.setColor(ColorCode.ERROR),
				],
			});
			return;
		}

		// 7. Check permissions for server imports (only in guilds)
		if (validation.type === "server") {
			// In guilds, require Manage Server permission
			if (interaction.guild) {
				const hasPermission =
					interaction.memberPermissions?.has("ManageGuild") ?? false;

				if (!hasPermission) {
					await responseInteraction.editReply({
						embeds: [
							new EmbedBuilder()
								.setTitle(
									localizer(locale, "commands.data.import.no_permission_title"),
								)
								.setDescription(
									localizer(
										locale,
										"commands.data.import.no_permission_description",
									),
								)
								.setColor(ColorCode.ERROR),
						],
					});
					return;
				}
			}
		}

		// 8. Import data based on type using selected persona scope

		let importResult:
			| Awaited<ReturnType<typeof importPersonalData>>
			| Awaited<ReturnType<typeof importServerData>>;

		if (validation.type === "personal") {
			importResult = await importPersonalData(
				interaction.user.id,
				validation.data as PersonalExportData,
				targetPersonaLineageId,
			);
		} else if (validation.type === "server") {
			importResult = await importServerData(
				serverDiscId,
				validation.data as ServerExportData,
				targetTomoriId,
			);
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

		// 9. Handle import result
		if (!importResult.success) {
			await responseInteraction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle(localizer(locale, "commands.data.import.failed_title"))
						.setDescription(
							importResult.error
								? localizeError(locale, importResult.error)
								: localizer(locale, "commands.data.import.failed_description"),
						)
						.setColor(ColorCode.ERROR),
				],
			});
			return;
		}

		// Invalidate caches so next message gets fresh data
		if (validation.type === "personal") {
			invalidateUserCache(interaction.user.id);
		} else if (validation.type === "server") {
			const serverDiscId = interaction.guild?.id ?? interaction.user.id;
			invalidateTomoriStateCache(serverDiscId);
		}

		// 10. Send success message with import summary
		const memoriesCount = importResult.itemsImported?.memoriesCount || 0;
		const configFieldsCount =
			importResult.itemsImported?.configFieldsCount || 0;

		// Use different description for server imports (mentions excluded data)
		const successDescriptionKey =
			validation.type === "server"
				? "commands.data.import.success_description_server"
				: "commands.data.import.success_description";

		await responseInteraction.editReply({
			embeds: [
				new EmbedBuilder()
					.setTitle(localizer(locale, "commands.data.import.success_title"))
					.setDescription(
						localizer(locale, successDescriptionKey, {
							type: validation.type,
							memories_count: memoriesCount,
							config_count: configFieldsCount,
						}),
					)
					.setColor(ColorCode.SUCCESS),
			],
		});
	} catch (error) {
		log.error("Error executing import command:", error, {
			errorType: "CommandExecutionError",
			metadata: { commandName: "import" },
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
