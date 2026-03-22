import {
	MessageFlags,
	type ChatInputCommandInteraction,
	type Client,
	type SlashCommandSubcommandBuilder,
} from "discord.js";
import { localizer } from "@/utils/text/localizer";
import { log, ColorCode } from "@/utils/misc/logger";
import {
	replyInfoEmbed,
	promptWithRawModal,
} from "@/utils/discord/interactionHelper";
import type { UserRow } from "@/types/db/schema";
import type { CheckboxGroupOption } from "@/types/discord/modal";

// ─── Constants ───────────────────────────────────────────────────────

const MODAL_CUSTOM_ID = "stpreset_node_toggle_modal";

/** Maximum checkbox options per group (Discord limit) */
const MAX_OPTIONS_PER_GROUP = 10;

/** Maximum checkbox groups per modal (Discord limit: 5 action rows) */
const MAX_GROUPS_PER_MODAL = 5;

// ─── Hardcoded Marinara Preset Nodes ─────────────────────────────────

/**
 * Represents a single toggleable prompt node from a SillyTavern preset.
 * Filtered from the preset's `prompts` array — excludes comment-only
 * nodes (content is purely `{{// ... }}{{trim}}`) and marker nodes.
 */
interface PresetNode {
	/** Display name from the preset */
	name: string;
	/** Unique identifier (UUID or well-known like "main") */
	identifier: string;
	/** Whether the node is enabled by default in the preset's prompt_order */
	enabled: boolean;
}

/**
 * Marinara's Spaghetti Recipe v10.0 — toggleable nodes in prompt_order
 * sequence (character_id: 100001). Comment-only and marker nodes are
 * excluded. Order matches the preset's `prompt_order` array for the
 * user-prompt list, which defines the actual rendering order.
 */
const MARINARA_NODES: PresetNode[] = [
	// ── Core Prompt Wrappers ──
	{ name: "|┎ <setting>", identifier: "2d052896-514b-46da-9d1b-2ca05dca2d66", enabled: true },
	{ name: "| Instructions", identifier: "8d39cd61-4a47-4e45-bf51-4dc70ae05b5a", enabled: true },
	{ name: "|┖ </setting>", identifier: "95c1f757-ee53-4656-bc16-90cb51b2328b", enabled: true },
	{ name: "|┎ <characters>", identifier: "83945990-3802-47ac-a0a1-86669ff32073", enabled: true },
	{ name: "|┖ </characters>", identifier: "4053badc-3ae3-4f4e-8667-2a4b14d6a734", enabled: true },
	{ name: "|┎ <protagonist>", identifier: "1a5ccb5f-ddf7-4647-a8d4-791626baf0de", enabled: true },
	{ name: "|┖ </protagonist>", identifier: "05f596ff-ceef-4751-b90c-8d27bc296ba3", enabled: true },
	{ name: "|┎ <scenario>", identifier: "cf57d752-9196-41bb-876a-03059c57b357", enabled: true },
	{ name: "|┖ </scenario>", identifier: "93f9bb16-0510-466e-890f-1f50832acc9b", enabled: true },
	{ name: "|┎ <past_events>", identifier: "596bc331-9500-4a13-9e20-7c41cf758641", enabled: true },

	// ── Structural & Content Nodes ──
	{ name: "|┖ </past_events>", identifier: "70bc3b69-e21c-4021-b6a6-bdfdec26b0a2", enabled: true },
	{ name: "|| Summary", identifier: "3f1d7de3-a9a1-4f66-aae0-3b1f6f913aad", enabled: true },
	{ name: "┌ <lore>", identifier: "64072fc1-9284-444c-8348-10b8478b99dd", enabled: true },
	{ name: "└ </lore>", identifier: "1cc6303c-28ee-455f-a966-ab84a8b7b7c6", enabled: true },
	{ name: "┌ <role>", identifier: "58cec410-bd0b-4a5e-872e-b16f01461201", enabled: true },
	{ name: "| Role", identifier: "509bbfe7-b6d4-4b4c-947e-ae46ee0e0e28", enabled: true },
	{ name: "└ </role>", identifier: "35cdd532-dfc3-4739-b404-1864b7f82269", enabled: true },
	{ name: "┌ <instructions>", identifier: "ebbc94e5-f5ca-425e-9210-be40f64c0098", enabled: true },
	{ name: "└ </instructions>", identifier: "738693f4-31e5-44bb-88ed-dcd4d8e20665", enabled: true },
	{ name: "⌜ <example_message>", identifier: "542f8e7f-0316-4505-b14a-d772a04f17a7", enabled: true },

	// ── Examples, Chat, & Task ──
	{ name: "⌞ </example_message>", identifier: "7bee04e9-e076-49a6-bc9d-78a2e04c21e5", enabled: true },
	{ name: "⌜ <chat_history>", identifier: "aec5b0c8-c792-4245-ab95-22e947cf24d4", enabled: true },
	{ name: "⌞ </chat_history>", identifier: "857fd06f-2425-4406-8412-6a5c280a5249", enabled: true },
	{ name: "⌜ <last_message>", identifier: "8e8d7718-4377-49d5-b3c2-70899bfa8f14", enabled: true },
	{ name: "⌞ </last_message>", identifier: "d7288abb-29f5-42a5-8042-7c250cbd1c25", enabled: true },
	{ name: "⌈ <task>", identifier: "24d89740-031a-45c5-aff7-3292afde3f95", enabled: true },
	{ name: "| Task", identifier: "c3c7a9bf-6914-4f2b-ba2d-c45c677bdca6", enabled: true },
	{ name: "⌊ </task>", identifier: "c0a95f7e-fb59-48f2-867b-95de8a96a536", enabled: true },
	{ name: "⌈ <output_format>", identifier: "95cf522b-90b3-42c7-aef5-6b6df8bc2861", enabled: true },
	{ name: "| Output Format", identifier: "be1189ec-f48e-43a1-a263-73501ca4e950", enabled: true },

	// ── Output & Final Instructions ──
	{ name: "⌊ </output_format>", identifier: "593fc752-b757-47da-b9a4-467c323456cb", enabled: true },
	{ name: "⌈ <final_instructions>", identifier: "b6cdff24-2977-4904-abe0-225f5760c63c", enabled: true },
	{ name: "| Final Instructions", identifier: "3b610e25-2bce-443b-b4e6-2069c22adf73", enabled: true },
	{ name: "⌊ </final_instructions>", identifier: "dd13f4ad-e323-4b9f-a941-370427fc4bf0", enabled: true },

	// ── Type Toggles (enable one) ──
	{ name: "➊ Game Master", identifier: "2501509e-7e23-4ac0-93f7-450d86053c98", enabled: false },
	{ name: "➋ Roleplayer", identifier: "dca7d9fa-5d8f-43a7-9295-f1aa592dac2f", enabled: true },
	{ name: "➌ Writer", identifier: "f1e126e2-6cb2-4193-9222-0993f8488650", enabled: false },

	// ── Narration Toggles (enable one) ──
	{ name: "➀ Third-Person", identifier: "b98ed009-b160-4199-bb57-9261941965c9", enabled: true },
	{ name: "➁ Second-Person", identifier: "23d7c37b-a525-4edf-821d-fb9b158b9c16", enabled: false },
	{ name: "➂ First-Person", identifier: "32e4b192-e95c-4deb-a2bb-05732e62e754", enabled: false },

	// ── POV Toggles (enable one) ──
	{ name: "➀ Omniscient", identifier: "15fd34bc-fd07-4910-a5ba-eee71ebe32b0", enabled: true },
	{ name: "➁ Character's", identifier: "2f59bdbc-c4a1-4a2e-8f01-8ec9e008d8b9", enabled: false },
	{ name: "➂ User's", identifier: "f6521305-e264-4fdd-a55a-b5a4152d27ac", enabled: false },

	// ── Tense Toggles (enable one) ──
	{ name: "➀ Past", identifier: "93c662c6-1f32-48cc-8ab9-ea14dabc649f", enabled: true },
	{ name: "➁ Present", identifier: "4464647d-dd98-43af-a65b-c170074e3b54", enabled: false },
	{ name: "➂ Future", identifier: "46d4c6ad-b2de-454c-b3cd-070cd1b05f18", enabled: false },

	// ── Length Toggles (enable one) ──
	{ name: "➀ Flexible", identifier: "cd6f2f1e-c948-45a8-ae71-c71902d84c59", enabled: true },
	{ name: "➁ One Sentence", identifier: "cb442cc1-5b17-4365-9ec5-9348002c040a", enabled: false },
	{ name: "➂ Short", identifier: "6aa5f3fe-8d2c-49ff-b3bf-766ab2e93ea9", enabled: false },
	{ name: "➃ Moderate", identifier: "ef13726b-5d7b-447a-95c2-9dc12e680ef6", enabled: false },
];

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
 * Shows a modal with up to 5 checkbox groups (10 options each) representing
 * the toggleable prompt nodes from the loaded SillyTavern preset. Nodes are
 * rendered top-to-bottom in preset order. Currently hardcoded to Marinara's
 * Spaghetti Recipe v10.0 for prototyping.
 *
 * @param _client - Discord client instance
 * @param interaction - Command interaction
 * @param _userData - User data from database
 * @param locale - User's preferred locale
 */
export async function execute(
	_client: Client,
	interaction: ChatInputCommandInteraction,
	_userData: UserRow,
	locale: string,
): Promise<void> {
	try {
		// 1. Build checkbox groups by chunking nodes into groups of 10
		const totalNodes = MARINARA_NODES.slice(
			0,
			MAX_OPTIONS_PER_GROUP * MAX_GROUPS_PER_MODAL,
		);
		const checkboxGroups = [];

		for (let i = 0; i < totalNodes.length; i += MAX_OPTIONS_PER_GROUP) {
			const chunk = totalNodes.slice(i, i + MAX_OPTIONS_PER_GROUP);
			const groupIndex = Math.floor(i / MAX_OPTIONS_PER_GROUP);

			// 2. Map each node to a checkbox option
			const options: CheckboxGroupOption[] = chunk.map((node) => ({
				label: node.name.length > 100 ? node.name.slice(0, 97) + "..." : node.name,
				value: node.identifier,
				default: node.enabled,
			}));

			checkboxGroups.push({
				kind: "checkboxGroup" as const,
				customId: `stpreset_nodes_${groupIndex}`,
				labelKey: `commands.stpreset.node.toggle.group_label_${groupIndex}`,
				descriptionKey: "commands.stpreset.node.toggle.group_description",
				minValues: 0,
				required: false,
				options,
			});
		}

		// 3. Show modal (modal is the acknowledgment — no pre-defer)
		const modalResult = await promptWithRawModal(
			interaction,
			locale,
			{
				modalCustomId: MODAL_CUSTOM_ID,
				modalTitleKey: "commands.stpreset.node.toggle.modal_title",
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

		// 4. Collect selected node identifiers from all checkbox groups
		const selectedIds = new Set<string>();
		for (let g = 0; g < checkboxGroups.length; g++) {
			const groupValues = modalResult.multiValues?.[`stpreset_nodes_${g}`] ?? [];
			for (const id of groupValues) {
				selectedIds.add(id);
			}
		}

		// 5. Build a summary of what changed vs. preset defaults
		const toggled: string[] = [];
		for (const node of totalNodes) {
			const isNowEnabled = selectedIds.has(node.identifier);
			if (isNowEnabled !== node.enabled) {
				const state = isNowEnabled ? "ON" : "OFF";
				toggled.push(`${state} ${node.name}`);
			}
		}

		// 6. Reply with summary (placeholder — no DB persistence yet)
		const summary = toggled.length > 0
			? toggled.join("\n")
			: localizer(locale, "commands.stpreset.node.toggle.no_changes");

		await replyInfoEmbed(modalResult.interaction, locale, {
			titleKey: "commands.stpreset.node.toggle.result_title",
			descriptionKey: "commands.stpreset.node.toggle.result_description",
			descriptionVars: {
				total: totalNodes.length.toString(),
				enabled: selectedIds.size.toString(),
				changes: summary,
			},
			color: toggled.length > 0 ? ColorCode.SUCCESS : ColorCode.INFO,
			flags: MessageFlags.Ephemeral,
		});

		log.info(
			`[ST Preset Node Toggle] ${selectedIds.size}/${totalNodes.length} nodes enabled, ${toggled.length} changed`,
		);
	} catch (error) {
		await log.error("Error executing /stpreset node toggle", error as Error, {
			userId: _userData.user_id,
			serverId: null,
			tomoriId: null,
			errorType: "CommandExecutionError",
			metadata: { command: "stpreset node toggle" },
		});

		await interaction.followUp({
			content: localizer(locale, "general.errors.unknown_error_description"),
			flags: MessageFlags.Ephemeral,
		});
	}
}
