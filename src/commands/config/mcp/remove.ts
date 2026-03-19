import {
	MessageFlags,
	type ChatInputCommandInteraction,
	type Client,
	type SlashCommandSubcommandBuilder,
} from "discord.js";
import { getCachedTomoriState } from "@/utils/cache/tomoriStateCache";
import {
	getCachedGuildMcpConfigs,
	invalidateGuildMcpConfigCache,
} from "@/utils/cache/guildMcpConfigCache";
import { localizer } from "@/utils/text/localizer";
import { log, ColorCode } from "@/utils/misc/logger";
import {
	replyInfoEmbed,
	promptWithRawModal,
	safeSelectOptionText,
} from "@/utils/discord/interactionHelper";
import type { UserRow, ErrorContext } from "@/types/db/schema";
import type { SelectOption } from "@/types/discord/modal";
import { deleteGuildMcpServer } from "@/utils/db/guildMcpDb";
import { getGuildMcpManager } from "@/utils/mcp/guildMcpManager";

// ─── Constants ───────────────────────────────────────────────────────

const MODAL_CUSTOM_ID = "config_mcp_remove_modal";
const SERVER_SELECT_ID = "mcp_server_select";

// ─── Subcommand Configuration ────────────────────────────────────────

/**
 * Configure the /config mcp remove subcommand.
 * No options needed — server selection happens via modal string select.
 * @param subcommand - The subcommand builder
 */
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("remove")
		.setDescription(
			localizer("en-US", "commands.config.mcp.remove.description"),
		);

// ─── Execution ───────────────────────────────────────────────────────

/**
 * Execute /config mcp remove.
 * Shows a modal with a string select of registered guild MCP servers,
 * then deletes the selected server, disconnects from pool, and invalidates cache.
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
	if (!interaction.channel) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.channel_only_title",
			descriptionKey: "general.errors.channel_only_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

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
		// 1. Load registered MCP servers for this guild
		const configs = await getCachedGuildMcpConfigs(tomoriState.server_id);
		if (configs.length === 0) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.config.mcp.list.empty_title",
				descriptionKey: "commands.config.mcp.list.empty_description",
				color: ColorCode.WARN,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// 2. Build select options from registered servers
		const serverOptions: SelectOption[] = configs.map((config) => ({
			label: safeSelectOptionText(config.name),
			value: config.name,
			description: safeSelectOptionText(
				new URL(config.url).hostname,
			),
		}));

		// 3. Show modal with string select (modal is the acknowledgment — no pre-defer)
		const modalResult = await promptWithRawModal(
			interaction,
			locale,
			{
				modalCustomId: MODAL_CUSTOM_ID,
				modalTitleKey: "commands.config.mcp.remove.modal_title",
				components: [
					{
						customId: SERVER_SELECT_ID,
						labelKey: "commands.config.mcp.remove.select_label",
						descriptionKey: "commands.config.mcp.remove.select_description",
						placeholder: "commands.config.mcp.remove.select_placeholder",
						required: true,
						options: serverOptions,
					},
				],
			},
			MessageFlags.Ephemeral,
		);

		if (modalResult.outcome !== "submit") {
			log.info(`[MCP Remove] Modal ${modalResult.outcome} for user ${userData.user_id}`);
			return;
		}

		if (!modalResult.interaction) {
			log.error("[MCP Remove] Modal submit interaction is undefined");
			return;
		}
		const replyInteraction = modalResult.interaction;

		const name = modalResult.values?.[SERVER_SELECT_ID]?.trim();
		if (!name) {
			await replyInfoEmbed(replyInteraction, locale, {
				titleKey: "commands.config.mcp.remove.not_found_title",
				descriptionKey: "commands.config.mcp.remove.not_found_description",
				descriptionVars: { name: "unknown" },
				color: ColorCode.WARN,
			});
			return;
		}

		// 4. Delete from database
		const deleted = await deleteGuildMcpServer(tomoriState.server_id, name);
		if (!deleted) {
			await replyInfoEmbed(replyInteraction, locale, {
				titleKey: "commands.config.mcp.remove.not_found_title",
				descriptionKey: "commands.config.mcp.remove.not_found_description",
				descriptionVars: { name },
				color: ColorCode.WARN,
			});
			return;
		}

		// 5. Invalidate cache after successful DB write
		invalidateGuildMcpConfigCache(tomoriState.server_id);

		// 6. Disconnect from connection pool
		await getGuildMcpManager().disconnectGuildServer(tomoriState.server_id, name);

		// 7. Success
		await replyInfoEmbed(replyInteraction, locale, {
			titleKey: "commands.config.mcp.remove.success_title",
			descriptionKey: "commands.config.mcp.remove.success_description",
			descriptionVars: { name },
			color: ColorCode.SUCCESS,
		});

		log.success(`[MCP Remove] Server "${name}" removed for guild ${serverId}`);
	} catch (error) {
		const context: ErrorContext = {
			userId: userData.user_id,
			serverId: null,
			tomoriId: null,
			errorType: "CommandExecutionError",
			metadata: { command: "config mcp remove" },
		};
		await log.error("Error executing /config mcp remove", error as Error, context);

		await interaction.followUp({
			content: localizer(locale, "general.errors.unknown_error_description"),
			flags: MessageFlags.Ephemeral,
		});
	}
}
