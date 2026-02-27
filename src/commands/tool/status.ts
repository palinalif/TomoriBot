import type { SlashCommandSubcommandBuilder } from "discord.js";
import {
	type ChatInputCommandInteraction,
	type ButtonInteraction,
	type Client,
	MessageFlags,
	TextChannel,
} from "discord.js";
import {
	replyInfoEmbed,
	replyPaginatedStatusPages,
	replyPaginatedPersonaChoicesV2,
} from "../../utils/discord/interactionHelper";
import { ColorCode, log } from "../../utils/misc/logger";
import { localizer } from "../../utils/text/localizer";
import {
	getCachedTomoriState,
} from "../../utils/cache/tomoriStateCache";
import {
	getUserReminderCount,
	getBraveApiKeyStatus,
	getBlacklistedMemberIds,
	loadPersonalMemoriesForUserLineage,
	loadAllPersonasForServer,
} from "../../utils/db/dbRead";
import type { UserRow } from "../../types/db/schema";
import type { SummaryEmbedOptions } from "../../types/discord/embed";
import { PrivacyLevel } from "../../types/db/schema";
import { formatBooleanLocalized } from "@/utils/text/stringHelper";
import { getMemoryLimits } from "@/utils/db/memoryLimits";
import { DEFAULT_SYSTEM_PROMPT } from "@/utils/text/contextBuilder";

// Constants
const MAX_ITEMS_DISPLAY = 5; // Max items before switching to count-only display
const MEMORY_TRUNCATE_LENGTH = 100; // Max chars per memory snippet
const ATTRIBUTE_TRUNCATE_LENGTH = 200; // Max chars per attribute snippet
const MAX_PROMPT_PREVIEW = Number.parseInt(
	process.env.SYSPROMPT_SHOW_MAX_PREVIEW || "3800",
	10,
); // Max chars shown for system/persona prompts

/**
 * Helper to get a user-friendly label for a privacy level.
 * @param locale - User locale
 * @param level - Privacy level value
 * @returns Localized privacy label string
 */
function getPrivacyLevelLabel(locale: string, level: PrivacyLevel): string {
	switch (level) {
		case PrivacyLevel.MINIMAL:
			return localizer(locale, "commands.personal.privacy.choice_minimal");
		case PrivacyLevel.PARTIAL:
			return localizer(locale, "commands.personal.privacy.choice_partial");
		case PrivacyLevel.FULL:
			return localizer(locale, "commands.personal.privacy.choice_full");
		default:
			return localizer(locale, "commands.personal.privacy.choice_minimal");
	}
}

/**
 * Formats an array of strings as a numbered list, truncating each item.
 * All items are shown (nothing is omitted).
 * @param items - Array of strings to format
 * @param locale - User locale
 * @param truncateLength - Max chars per item before truncation
 * @returns Formatted numbered list string, or localized "None" if empty
 */
function formatNumberedList(
	items: string[],
	locale: string,
	truncateLength: number,
): string {
	if (items.length === 0) {
		return localizer(locale, "commands.choices.none");
	}

	return items
		.map((item, index) => {
			const truncated =
				item.length > truncateLength
					? `${item.substring(0, truncateLength)}...`
					: item;
			return `${index + 1}. ${truncated}`;
		})
		.join("\n");
}

/**
 * Formats an array of strings as a bullet list, truncating each item.
 * All items are shown (nothing is omitted).
 * @param items - Array of strings to format
 * @param locale - User locale
 * @param truncateLength - Max chars per item before truncation
 * @returns Formatted bullet list string, or localized "None" if empty
 */
function formatBulletList(
	items: string[],
	locale: string,
	truncateLength: number,
): string {
	if (items.length === 0) {
		return localizer(locale, "commands.choices.none");
	}

	return items
		.map((item) => {
			const truncated =
				item.length > truncateLength
					? `${item.substring(0, truncateLength)}...`
					: item;
			return `• ${truncated}`;
		})
		.join("\n");
}

/**
 * Configures the 'status' subcommand with scope options.
 */
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("status")
		.setDescription(localizer("en-US", "commands.tool.status.description"))
		.addStringOption((option) =>
			option
				.setName("scope")
				.setDescription(
					localizer("en-US", "commands.tool.status.scope_description"),
				)
				.setRequired(true)
				.addChoices(
					{
						name: localizer("en-US", "commands.tool.status.scope_choice_personal"),
						value: "personal",
					},
					{
						name: localizer("en-US", "commands.tool.status.scope_choice_server"),
						value: "server",
					},
					{
						name: localizer("en-US", "commands.tool.status.scope_choice_persona"),
						value: "persona",
					},
				),
		);

/**
 * Executes the 'status' command.
 * Displays paginated status pages for the selected scope (personal, server, or persona).
 * @param client - The Discord client instance
 * @param interaction - The chat input command interaction
 * @param userData - The user data row from the database
 * @param locale - The user's preferred locale
 */
export async function execute(
	client: Client,
	interaction: ChatInputCommandInteraction,
	userData: UserRow,
	locale: string,
): Promise<void> {
	const serverDiscId = interaction.guildId ?? interaction.user.id;
	const scope = interaction.options.getString("scope", true);

	const limits = getMemoryLimits();

	try {
		switch (scope) {
			case "personal": {
				// 1. Resolve the active persona's lineage and load personal memories
				let personalMemoryList: string[] = [];
				if (userData.user_id) {
					const currentState = await getCachedTomoriState(serverDiscId);
					const currentLineageId = currentState?.persona_lineage_id ?? 0;
					const personalMemoryRows = await loadPersonalMemoriesForUserLineage(
						userData.user_id,
						currentLineageId,
						true,
					);
					personalMemoryList = personalMemoryRows.map((row) => row.content);
				}

				// 2. Format personal memories as a numbered list (all shown, truncated)
				const personalMemoriesValue = formatNumberedList(
					personalMemoryList,
					locale,
					MEMORY_TRUNCATE_LENGTH,
				);
				const personalMemoriesCount = personalMemoryList.length;

				// 3. Get the user's active reminder count
				const reminderCount = await getUserReminderCount(interaction.user.id);

				// 4. Build the single personal status page
				const personalPage: SummaryEmbedOptions = {
					titleKey: "commands.tool.status.personal_title",
					descriptionKey: "commands.tool.status.personal_description",
					color: ColorCode.INFO,
					footerKey: "commands.tool.status.export_footer",
					fields: [
						{
							nameKey: "commands.tool.status.field_user_nickname",
							value: userData.user_nickname,
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_language_pref",
							value: userData.language_pref,
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_privacy",
							value: getPrivacyLevelLabel(
								locale,
								userData.privacy_level ?? PrivacyLevel.MINIMAL,
							),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_reminders_count",
							value: String(reminderCount),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_personal_memories_with_count",
							nameVars: {
								current: personalMemoriesCount,
								max: limits.maxPersonalMemories,
							},
							value: personalMemoriesValue,
							inline: false,
						},
					],
				};

				await replyPaginatedStatusPages(
					interaction,
					locale,
					[personalPage],
					MessageFlags.Ephemeral,
				);
				break;
			}

			case "server": {
				// 1. Load Tomori state for this server
				const tomoriState = await getCachedTomoriState(serverDiscId);

				if (!tomoriState) {
					await replyInfoEmbed(interaction, locale, {
						titleKey: "general.errors.tomori_not_setup_title",
						descriptionKey: "general.errors.tomori_not_setup_description",
						color: ColorCode.ERROR,
					});
					return;
				}

				const config = tomoriState.config;
				const llm = tomoriState.llm;

				// 2. Load supporting data
				const braveApiKeySet = await getBraveApiKeyStatus(tomoriState.server_id);
				const blacklistedMemberIds = await getBlacklistedMemberIds(
					tomoriState.server_id,
				);

				// 3. Format timezone (UTC+08:00 style)
				const timezoneOffset = config.timezone_offset;
				const timezoneSign = timezoneOffset >= 0 ? "+" : "-";
				const timezoneHours = Math.abs(timezoneOffset)
					.toString()
					.padStart(2, "0");
				const timezoneValue = `UTC${timezoneSign}${timezoneHours}:00`;

				// 4. Format auto-chat channels
				const autoChannelMentions = await Promise.all(
					config.autoch_disc_ids.map(async (id) => {
						try {
							const channel = await client.channels.fetch(id);
							return channel instanceof TextChannel ? channel.toString() : id;
						} catch {
							return `*<${localizer(locale, "commands.tool.status.unknown_channel")} ${id}>*`;
						}
					}),
				);
				const autoChannelsValue =
					autoChannelMentions.length === 0
						? localizer(locale, "commands.choices.none")
						: autoChannelMentions.length <= MAX_ITEMS_DISPLAY
							? autoChannelMentions.join(", ")
							: localizer(locale, "commands.tool.status.item_count", {
									count: autoChannelMentions.length,
								});

				// 5. Format trigger words with slot count
				const triggerWordsCount = config.trigger_words.length;
				const triggerWordsValue =
					triggerWordsCount > 0
						? config.trigger_words.map((w) => `\`${w}\``).join(", ")
						: localizer(locale, "commands.choices.none");

				// 6. Format blacklisted members
				const blacklistedCount = blacklistedMemberIds.length;
				const blacklistedValue =
					blacklistedCount === 0
						? localizer(locale, "commands.choices.none")
						: blacklistedCount <= MAX_ITEMS_DISPLAY
							? blacklistedMemberIds.map((id) => `<@${id}>`).join(", ")
							: localizer(
									locale,
									"commands.tool.status.field_blacklisted_members_with_count",
									{ current: blacklistedCount },
								);

				// 7. Format server memories (all shown, truncated to 100 chars each)
				const serverMemoriesCount = tomoriState.server_memories.length;
				const serverMemoriesValue = formatNumberedList(
					tomoriState.server_memories,
					locale,
					MEMORY_TRUNCATE_LENGTH,
				);

				// 8. Format system prompt preview (truncated for readability)
				const rawSystemPrompt = config.system_prompt ?? null;
				const systemPromptText = rawSystemPrompt
					? rawSystemPrompt.length > MAX_PROMPT_PREVIEW
						? `${rawSystemPrompt.slice(0, MAX_PROMPT_PREVIEW)}...`
						: rawSystemPrompt
					: DEFAULT_SYSTEM_PROMPT.trim();
				const systemPromptValue = `\`\`\`\n${systemPromptText}\n\`\`\``;

				// ── Page 1: Configuration ──────────────────────────────────────
				const serverPage1: SummaryEmbedOptions = {
					titleKey: "commands.tool.status.server_page1_title",
					descriptionKey: "commands.tool.status.server_page1_description",
					color: ColorCode.INFO,
					fields: [
						{
							nameKey: "commands.tool.status.field_model",
							value: `\`${llm.llm_codename}\` (${llm.llm_provider})`,
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_temperature",
							value: String(config.llm_temperature),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_humanizer",
							value: String(config.humanizer_degree),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_timezone",
							value: timezoneValue,
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_message_fetch_limit",
							value: String(config.message_fetch_limit),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_autoch_threshold",
							value:
								config.autoch_threshold > 0
									? String(config.autoch_threshold)
									: localizer(locale, "commands.choices.disabled"),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_autoch_channels",
							value: autoChannelsValue,
							inline: false,
						},
						{
							nameKey: "commands.tool.status.field_trigger_words_with_count",
							nameVars: {
								current: triggerWordsCount,
								max: limits.maxTriggerWords,
							},
							value: triggerWordsValue,
							inline: false,
						},
					],
				};

				// ── Page 2: Features & Moderation ─────────────────────────────
				const serverPage2: SummaryEmbedOptions = {
					titleKey: "commands.tool.status.server_page2_title",
					descriptionKey: "commands.tool.status.server_page2_description",
					color: ColorCode.INFO,
					fields: [
						{
							nameKey: "commands.tool.status.field_personalization",
							value: formatBooleanLocalized(
								config.personal_memories_enabled,
								locale,
							),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_self_teach",
							value: formatBooleanLocalized(
								config.self_teaching_enabled,
								locale,
							),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_image_generation",
							value: formatBooleanLocalized(config.imagegen_enabled, locale),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_videogen",
							value: formatBooleanLocalized(config.videogen_enabled, locale),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_web_search",
							value: formatBooleanLocalized(
								config.web_search_enabled,
								locale,
							),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_emoji_usage",
							value: formatBooleanLocalized(
								config.emoji_usage_enabled,
								locale,
							),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_sticker_usage",
							value: formatBooleanLocalized(
								config.sticker_usage_enabled,
								locale,
							),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_api_key_set",
							value: formatBooleanLocalized(!!config.api_key, locale),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_brave_api_key_set",
							value: formatBooleanLocalized(braveApiKeySet, locale),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_server_memteaching",
							value: formatBooleanLocalized(
								config.server_memteaching_enabled,
								locale,
							),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_attribute_memteaching",
							value: formatBooleanLocalized(
								config.attribute_memteaching_enabled,
								locale,
							),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_sampledialogue_memteaching",
							value: formatBooleanLocalized(
								config.sampledialogue_memteaching_enabled,
								locale,
							),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_hide_impersonation",
							value: formatBooleanLocalized(
								config.hide_impersonation_embeds,
								locale,
							),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_blacklisted_members",
							value: blacklistedValue,
							inline: blacklistedCount <= MAX_ITEMS_DISPLAY,
						},
					],
				};

				// ── Page 3: Memory & Prompt ────────────────────────────────────
				const serverPage3: SummaryEmbedOptions = {
					titleKey: "commands.tool.status.server_page3_title",
					descriptionKey: "commands.tool.status.server_page3_description",
					color: ColorCode.INFO,
					footerKey: "commands.tool.status.export_footer_full",
					fields: [
						{
							nameKey: "commands.tool.status.field_server_memories_with_count",
							nameVars: {
								current: serverMemoriesCount,
								max: limits.maxServerMemories,
							},
							value: serverMemoriesValue,
							inline: false,
						},
						{
							nameKey: "commands.tool.status.field_system_prompt",
							value: systemPromptValue,
							inline: false,
						},
					],
				};

				await replyPaginatedStatusPages(
					interaction,
					locale,
					[serverPage1, serverPage2, serverPage3],
					MessageFlags.Ephemeral,
				);
				break;
			}

			case "persona": {
				// 1. Load all personas for the persona picker
				const allPersonas = await loadAllPersonasForServer(serverDiscId);

				if (allPersonas.length === 0) {
					await replyInfoEmbed(interaction, locale, {
						titleKey: "general.errors.tomori_not_setup_title",
						descriptionKey: "general.errors.tomori_not_setup_description",
						color: ColorCode.ERROR,
					});
					return;
				}

				// 2. Show paginated persona picker (Pattern 4 — preserves interaction)
				const personaSelection = await replyPaginatedPersonaChoicesV2(
					interaction,
					locale,
					{
						personas: allPersonas,
						color: ColorCode.INFO,
						preserveSelectedInteraction: true,
						onSelect: async () => {},
					},
				);

				if (
					!personaSelection.success ||
					personaSelection.selectedIndex === undefined ||
					!personaSelection.interaction
				) {
					return;
				}

				const personaInteraction: ButtonInteraction =
					personaSelection.interaction;
				const selectedPersona =
					allPersonas[personaSelection.selectedIndex] ?? null;

				if (!selectedPersona?.tomori_id) {
					await replyInfoEmbed(personaInteraction, locale, {
						titleKey: "general.errors.invalid_option_title",
						descriptionKey: "general.errors.invalid_option_description",
						color: ColorCode.ERROR,
					});
					return;
				}

				const personaName = selectedPersona.tomori_nickname;

				// 3. Format attributes (all shown, truncated to 200 chars each)
				const attributesCount = selectedPersona.attribute_list.length;
				const attributesValue = formatBulletList(
					selectedPersona.attribute_list,
					locale,
					ATTRIBUTE_TRUNCATE_LENGTH,
				);

				// 4. Format sample dialogues slot usage
				const dialogueCount = selectedPersona.sample_dialogues_in.length;
				const dialogueValue = localizer(
					locale,
					"commands.tool.status.field_slot_usage",
					{ current: dialogueCount, max: limits.maxSampleDialogues },
				);

				// 5. Format alter/persona triggers
				const alterTriggersValue =
					selectedPersona.alter_triggers.length > 0
						? selectedPersona.alter_triggers.map((t) => `\`${t}\``).join(", ")
						: localizer(locale, "commands.choices.none");

				const personaTriggersValue =
					selectedPersona.trigger_words.length > 0
						? selectedPersona.trigger_words.map((t) => `\`${t}\``).join(", ")
						: localizer(locale, "commands.choices.none");

				// 6. Format NAI tags
				const naiTagsValue =
					selectedPersona.nai_tags.length > 0
						? selectedPersona.nai_tags.join(", ")
						: localizer(locale, "commands.choices.none");

				// 7. Format persona prompt preview (truncated for readability)
				const rawPersonaPrompt = selectedPersona.persona_prompt ?? null;
				const personaPromptValue = rawPersonaPrompt
					? `\`\`\`\n${
							rawPersonaPrompt.length > MAX_PROMPT_PREVIEW
								? `${rawPersonaPrompt.slice(0, MAX_PROMPT_PREVIEW)}...`
								: rawPersonaPrompt
						}\n\`\`\``
					: localizer(
							locale,
							"commands.tool.status.field_persona_prompt_not_set",
						);

				// ── Page 1: Identity ───────────────────────────────────────────
				const personaPage1: SummaryEmbedOptions = {
					titleKey: "commands.tool.status.persona_page1_title",
					titleVars: { persona_name: personaName },
					descriptionKey: "commands.tool.status.persona_page1_description",
					color: ColorCode.INFO,
					fields: [
						{
							nameKey: "commands.tool.status.field_nickname",
							value: personaName,
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_is_alter",
							value: formatBooleanLocalized(
								selectedPersona.is_alter,
								locale,
							),
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_dialogue_count",
							value: dialogueValue,
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_alter_triggers",
							value: alterTriggersValue,
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_persona_triggers",
							value: personaTriggersValue,
							inline: true,
						},
						{
							nameKey: "commands.tool.status.field_attributes_with_count",
							nameVars: {
								current: attributesCount,
								max: limits.maxAttributes,
							},
							value: attributesValue,
							inline: false,
						},
					],
				};

				// ── Page 2: Prompt & Tags ──────────────────────────────────────
				const personaPage2: SummaryEmbedOptions = {
					titleKey: "commands.tool.status.persona_page2_title",
					titleVars: { persona_name: personaName },
					descriptionKey: "commands.tool.status.persona_page2_description",
					color: ColorCode.INFO,
					fields: [
						{
							nameKey: "commands.tool.status.field_persona_prompt",
							value: personaPromptValue,
							inline: false,
						},
						{
							nameKey: "commands.tool.status.field_nai_tags",
							value: naiTagsValue,
							inline: false,
						},
					],
				};

				// 8. Display 2-page persona status from the selected ButtonInteraction
				await replyPaginatedStatusPages(
					personaInteraction,
					locale,
					[personaPage1, personaPage2],
					MessageFlags.Ephemeral,
				);
				break;
			}

			default:
				log.error(`Invalid status scope received: ${scope}`);
				await replyInfoEmbed(interaction, locale, {
					titleKey: "general.errors.unknown_error_title",
					descriptionKey: "general.errors.unknown_error_description",
					color: ColorCode.ERROR,
				});
				return;
		}
	} catch (error) {
		log.error(
			`Error executing status command for scope ${scope}:`,
			error,
			{
				errorType: "CommandExecutionError",
				metadata: {
					commandName: "status",
					scope,
					guildDiscordId: serverDiscId,
				},
			},
		);
		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.unknown_error_title",
			descriptionKey: "general.errors.unknown_error_description",
			color: ColorCode.ERROR,
		});
	}
}
