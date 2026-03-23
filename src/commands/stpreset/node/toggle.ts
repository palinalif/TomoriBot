import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	MessageFlags,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	type Client,
	type SlashCommandSubcommandBuilder,
} from "discord.js";
import { getCachedTomoriState } from "@/utils/cache/tomoriStateCache";
import { localizer } from "@/utils/text/localizer";
import { log, ColorCode } from "@/utils/misc/logger";
import {
	replyInfoEmbed,
	promptWithRawModal,
} from "@/utils/discord/interactionHelper";
import { createStandardEmbed } from "@/utils/discord/embedHelper";
import type { UserRow, ErrorContext, StPresetNodeRow } from "@/types/db/schema";
import type { CheckboxGroupOption, ModalCheckboxGroupField } from "@/types/discord/modal";
import {
	loadActivePreset,
	loadPresetsForServer,
	loadToggleableNodes,
	updateNodeEnabledStates,
} from "@/utils/db/stPresetDb";

// ─── Constants ───────────────────────────────────────────────────────

const MODAL_CUSTOM_ID = "stpreset_node_toggle_modal";

/** Maximum checkbox options per group (Discord limit) */
const MAX_OPTIONS_PER_GROUP = 10;

/** Maximum checkbox groups per modal (Discord limit: 5 action rows) */
const MAX_GROUPS_PER_MODAL = 5;

/** Maximum toggleable nodes per modal page (5 groups × 10 options) */
const NODES_PER_PAGE = MAX_OPTIONS_PER_GROUP * MAX_GROUPS_PER_MODAL;

/** Timeout for page-selection button interaction (5 minutes) */
const PAGE_SELECT_TIMEOUT_MS = 300_000;

// ─── Helpers ─────────────────────────────────────────────────────────

/** Maximum characters for a checkbox option description (Discord limit) */
const DESCRIPTION_MAX_LENGTH = 100;

/**
 * Strip SillyTavern macros from node content to produce a human-readable
 * description preview. Removes comment blocks, {{trim}}, {{setvar::...}},
 * and {{getvar::...}} wrappers — but for setvar nodes, extracts the value
 * portion (e.g., `{{setvar::tense::past tense}}` → `past tense`).
 *
 * @param content - Raw node content with ST macros
 * @returns Cleaned text truncated to DESCRIPTION_MAX_LENGTH, or undefined if empty
 */
function buildNodeDescription(content: string): string | undefined {
	let cleaned = content
		// 1. Strip comment blocks: {{// ... }}
		.replace(/\{\{\/\/[^}]*\}\}/g, "")
		// 2. Strip {{trim}} macros
		.replace(/\{\{trim\}\}/g, "")
		// 3. Extract value from setvar: {{setvar::key::value}} → value
		.replace(/\{\{setvar::[^:}]+::([^}]*)\}\}/g, "$1")
		// 4. Resolve getvar to placeholder: {{getvar::key}} → [key]
		.replace(/\{\{getvar::([^}]*)\}\}/g, "[$1]")
		// 5. Simplify remaining template vars: {{user}} → user, {{char}} → char
		.replace(/\{\{(\w+)\}\}/g, "$1")
		// 6. Collapse whitespace
		.replace(/\s+/g, " ")
		.trim();

	if (cleaned.length === 0) return undefined;

	// 7. Truncate to Discord's limit
	if (cleaned.length > DESCRIPTION_MAX_LENGTH) {
		cleaned = `${cleaned.slice(0, DESCRIPTION_MAX_LENGTH - 3)}...`;
	}

	return cleaned;
}

/**
 * Build checkbox groups for a page of nodes.
 * Chunks the given nodes into groups of MAX_OPTIONS_PER_GROUP (10) and
 * creates up to MAX_GROUPS_PER_MODAL (5) checkbox group components.
 *
 * @param pageNodes - The nodes for this page (max 50)
 * @returns Array of checkbox group modal components
 */
function buildCheckboxGroups(
	pageNodes: StPresetNodeRow[],
): ModalCheckboxGroupField[] {
	const groups: ModalCheckboxGroupField[] = [];

	for (let i = 0; i < pageNodes.length; i += MAX_OPTIONS_PER_GROUP) {
		const chunk = pageNodes.slice(i, i + MAX_OPTIONS_PER_GROUP);
		const groupIndex = Math.floor(i / MAX_OPTIONS_PER_GROUP);

		const options: CheckboxGroupOption[] = chunk.map((node) => ({
			label: node.name.length > 100 ? `${node.name.slice(0, 97)}...` : node.name,
			value: node.identifier,
			description: buildNodeDescription(node.content),
			default: node.is_enabled,
		}));

		groups.push({
			kind: "checkboxGroup" as const,
			customId: `stpreset_nodes_${groupIndex}`,
			labelKey: `commands.stpreset.node.toggle.group_label_${groupIndex}`,
			descriptionKey: "commands.stpreset.node.toggle.group_description",
			minValues: 0,
			required: false,
			options,
		});
	}

	return groups;
}

/**
 * Collect selected node identifiers from modal submission checkbox groups.
 *
 * @param multiValues - The multiValues map from the modal result
 * @param groupCount - Number of checkbox groups in this modal
 * @returns Set of selected node identifiers
 */
function collectSelectedIds(
	multiValues: Record<string, string[]> | undefined,
	groupCount: number,
): Set<string> {
	const selectedIds = new Set<string>();
	for (let g = 0; g < groupCount; g++) {
		const groupValues = multiValues?.[`stpreset_nodes_${g}`] ?? [];
		for (const id of groupValues) {
			selectedIds.add(id);
		}
	}
	return selectedIds;
}

// ─── Subcommand Configuration ────────────────────────────────────────

/**
 * Configure the /stpreset node toggle subcommand.
 * No options — node selection happens via checkbox groups in a modal.
 * @param subcommand - The subcommand builder
 */
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("toggle")
		.setDescription(
			localizer("en-US", "commands.stpreset.node.toggle.description"),
		);

// ─── Execution ───────────────────────────────────────────────────────

/**
 * Execute /stpreset node toggle.
 * Loads the active (or first available) ST preset for this server from the
 * database, then shows a modal with checkbox groups representing the
 * toggleable prompt nodes. Nodes render top-to-bottom in the preset's
 * prompt_order sequence.
 *
 * If the preset has more than 50 toggleable nodes (exceeding a single
 * modal's capacity), a page-selection embed with numbered buttons is shown
 * first, allowing the user to pick which page of nodes to view/toggle.
 *
 * On submit, changed enabled states are persisted back to the database.
 *
 * @param _client - Discord client instance
 * @param interaction - Command interaction
 * @param userData - User data from database
 * @param locale - User's preferred locale
 */
export async function execute(
	_client: Client,
	interaction: ChatInputCommandInteraction,
	userData: UserRow,
	locale: string,
): Promise<void> {
	// 1. Verify server setup
	const serverId = interaction.guild?.id ?? interaction.user.id;
	const tomoriState = await getCachedTomoriState(serverId);
	if (!tomoriState) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.tomori_not_setup_title",
			descriptionKey: "general.errors.tomori_not_setup_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	try {
		// 2. Find the active preset, or fall back to the first available preset
		let preset = await loadActivePreset(tomoriState.server_id);
		if (!preset) {
			const allPresets = await loadPresetsForServer(tomoriState.server_id);
			preset = allPresets[0] ?? null;
		}

		if (!preset || !preset.preset_id) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.stpreset.node.toggle.no_preset_title",
				descriptionKey: "commands.stpreset.node.toggle.no_preset_description",
				color: ColorCode.WARN,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 3. Load toggleable nodes from DB (non-marker, ordered by node_order)
		const dbNodes = await loadToggleableNodes(preset.preset_id);
		if (dbNodes.length === 0) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.stpreset.node.toggle.no_nodes_title",
				descriptionKey: "commands.stpreset.node.toggle.no_nodes_description",
				color: ColorCode.WARN,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 4. Determine if pagination is needed
		const totalPages = Math.ceil(dbNodes.length / NODES_PER_PAGE);
		let pageNodes: StPresetNodeRow[];
		let modalInteractionSource: ChatInputCommandInteraction | ButtonInteraction = interaction;

		if (totalPages > 1) {
			// 4a. Multi-page: show page-selection embed with numbered buttons
			const pageSelectEmbed = createStandardEmbed(locale, {
				titleKey: "commands.stpreset.node.toggle.select_page_title",
				descriptionKey: "commands.stpreset.node.toggle.select_page_description",
				descriptionVars: {
					preset_name: preset.preset_name,
					total_nodes: dbNodes.length.toString(),
					total_pages: totalPages.toString(),
				},
				color: ColorCode.INFO,
			});

			// Build numbered page buttons (up to 9 pages)
			const maxButtons = Math.min(totalPages, 9);
			const pageButtons: ButtonBuilder[] = [];

			for (let i = 1; i <= maxButtons; i++) {
				const startNode = (i - 1) * NODES_PER_PAGE + 1;
				const endNode = Math.min(i * NODES_PER_PAGE, dbNodes.length);
				pageButtons.push(
					new ButtonBuilder()
						.setCustomId(`stpreset_page_${i}`)
						.setLabel(`${startNode}–${endNode}`)
						.setStyle(ButtonStyle.Primary),
				);
			}

			const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
				...pageButtons,
			);

			// Send page selection message
			const pageSelectMessage = await interaction.reply({
				embeds: [pageSelectEmbed],
				components: [actionRow],
				flags: MessageFlags.Ephemeral,
			});

			// Wait for page button click
			let pageButtonInteraction: ButtonInteraction;
			try {
				pageButtonInteraction = (await pageSelectMessage.awaitMessageComponent({
					filter: (i) =>
						i.user.id === interaction.user.id &&
						i.customId.startsWith("stpreset_page_"),
					time: PAGE_SELECT_TIMEOUT_MS,
				})) as ButtonInteraction;
			} catch {
				log.info("[ST Preset Node Toggle] Page selection timed out");
				return;
			}

			// Extract selected page and slice nodes
			const selectedPage = Number.parseInt(
				pageButtonInteraction.customId.replace("stpreset_page_", ""),
				10,
			);
			const startIndex = (selectedPage - 1) * NODES_PER_PAGE;
			pageNodes = dbNodes.slice(startIndex, startIndex + NODES_PER_PAGE);
			modalInteractionSource = pageButtonInteraction;
		} else {
			// 4b. Single page: use all nodes directly
			pageNodes = dbNodes;
		}

		// 5. Build checkbox groups for the selected page
		const checkboxGroups = buildCheckboxGroups(pageNodes);

		// 6. Show modal — use the preset name as the title (passthrough via localizer)
		const modalResult = await promptWithRawModal(
			modalInteractionSource,
			locale,
			{
				modalCustomId: MODAL_CUSTOM_ID,
				modalTitleKey: preset.preset_name,
				components: checkboxGroups,
			},
			MessageFlags.Ephemeral,
		);

		if (modalResult.outcome !== "submit") {
			log.info(`[ST Preset Node Toggle] Modal ${modalResult.outcome}`);
			return;
		}

		if (!modalResult.interaction) {
			log.error("[ST Preset Node Toggle] Modal submit interaction is undefined");
			return;
		}

		// 7. Collect selected node identifiers from all checkbox groups
		const selectedIds = collectSelectedIds(modalResult.multiValues, checkboxGroups.length);

		// 8. Build the enabled state map and detect changes
		const enabledMap = new Map<string, boolean>();
		const toggled: string[] = [];

		for (const node of pageNodes) {
			const isNowEnabled = selectedIds.has(node.identifier);
			enabledMap.set(node.identifier, isNowEnabled);

			if (isNowEnabled !== node.is_enabled) {
				const state = isNowEnabled ? "ON" : "OFF";
				toggled.push(`${state} ${node.name}`);
			}
		}

		// 9. Persist changed states to DB
		if (toggled.length > 0) {
			await updateNodeEnabledStates(preset.preset_id, enabledMap);
		}

		// 10. Reply with summary
		const summary = toggled.length > 0
			? toggled.join("\n")
			: localizer(locale, "commands.stpreset.node.toggle.no_changes");

		await replyInfoEmbed(modalResult.interaction, locale, {
			titleKey: "commands.stpreset.node.toggle.result_title",
			descriptionKey: "commands.stpreset.node.toggle.result_description",
			descriptionVars: {
				total: pageNodes.length.toString(),
				enabled: selectedIds.size.toString(),
				changes: summary,
			},
			color: toggled.length > 0 ? ColorCode.SUCCESS : ColorCode.INFO,
			flags: MessageFlags.Ephemeral,
		});

		log.info(
			`[ST Preset Node Toggle] ${selectedIds.size}/${pageNodes.length} nodes enabled, ${toggled.length} changed for preset "${preset.preset_name}"`,
		);
	} catch (error) {
		const context: ErrorContext = {
			userId: userData.user_id,
			serverId: null,
			tomoriId: null,
			errorType: "CommandExecutionError",
			metadata: { command: "stpreset node toggle" },
		};
		await log.error("Error executing /stpreset node toggle", error as Error, context);

		await interaction.followUp({
			content: localizer(locale, "general.errors.unknown_error_description"),
			flags: MessageFlags.Ephemeral,
		});
	}
}
