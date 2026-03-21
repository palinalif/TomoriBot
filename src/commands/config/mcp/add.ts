import {
	MessageFlags,
	TextInputStyle,
	type ChatInputCommandInteraction,
	type Client,
	type SlashCommandSubcommandBuilder,
} from "discord.js";
import {
	getCachedTomoriState,
} from "@/utils/cache/tomoriStateCache";
import {
	invalidateGuildMcpConfigCache,
} from "@/utils/cache/guildMcpConfigCache";
import { localizer } from "@/utils/text/localizer";
import { log, ColorCode } from "@/utils/misc/logger";
import {
	replyInfoEmbed,
	promptWithRawModal,
} from "@/utils/discord/interactionHelper";
import type { UserRow, ErrorContext } from "@/types/db/schema";
import type { RadioGroupOption } from "@/types/discord/modal";
import { insertGuildMcpServer, countGuildMcpServers } from "@/utils/db/guildMcpDb";
import { getGuildMcpManager } from "@/utils/mcp/guildMcpManager";

// ─── Constants ───────────────────────────────────────────────────────

const MODAL_CUSTOM_ID = "config_mcp_add_modal";
const NAME_INPUT_ID = "mcp_server_name";
const URL_INPUT_ID = "mcp_server_url";
const AUTH_TOKEN_INPUT_ID = "mcp_auth_token";
const SERVER_TYPE_SELECT_ID = "mcp_server_type";

/** Max guild MCP servers per guild (configurable via env) */
const MAX_SERVERS_PER_GUILD = Number(process.env.MAX_MCP_SERVERS_PER_GUILD) || 5;

/** Name format: alphanumeric + hyphens, 1-32 chars */
const NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,31}$/;

/**
 * Private IPv4 ranges to block for SSRF protection.
 * Localhost is allowed when RUN_ENV !== "production".
 */
const PRIVATE_IP_PATTERNS = [
	/^10\./,
	/^172\.(1[6-9]|2\d|3[01])\./,
	/^192\.168\./,
	/^169\.254\./, // Link-local
	/^0\./, // "This" network
];

// ─── Subcommand Configuration ────────────────────────────────────────

/**
 * Configure the /config mcp add subcommand.
 * Shows a modal for name, URL, optional auth token, and optional server type.
 * @param subcommand - The subcommand builder
 */
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("add")
		.setDescription(
			localizer("en-US", "commands.config.mcp.add.description"),
		);

// ─── Execution ───────────────────────────────────────────────────────

/**
 * Execute /config mcp add.
 * Opens a modal, validates inputs, tests the MCP connection, then persists.
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
	// 1. Validate context
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
		// 2. Build server type radio group options for tool deduplication
		const serverTypeOptions: RadioGroupOption[] = [
			{
				label: localizer(locale, "commands.config.mcp.add.none_option"),
				value: "none",
				description: localizer(locale, "commands.config.mcp.add.none_option_description"),
			},
			{
				label: localizer(locale, "commands.config.mcp.add.web_search_option"),
				value: "web_search",
				description: localizer(locale, "commands.config.mcp.add.web_search_option_description"),
			},
			{
				label: localizer(locale, "commands.config.mcp.add.url_fetcher_option"),
				value: "url_fetcher",
				description: localizer(locale, "commands.config.mcp.add.url_fetcher_option_description"),
			},
		];

		// 3. Show modal (modal is the acknowledgment — no pre-defer)
		const modalResult = await promptWithRawModal(
			interaction,
			locale,
			{
				modalCustomId: MODAL_CUSTOM_ID,
				modalTitleKey: "commands.config.mcp.add.modal_title",
				components: [
					{
						customId: NAME_INPUT_ID,
						labelKey: "commands.config.mcp.add.name_label",
						placeholder: "commands.config.mcp.add.name_placeholder",
						required: true,
						style: TextInputStyle.Short,
						maxLength: 32,
					},
					{
						customId: URL_INPUT_ID,
						labelKey: "commands.config.mcp.add.url_label",
						placeholder: "commands.config.mcp.add.url_placeholder",
						required: true,
						style: TextInputStyle.Short,
						maxLength: 500,
					},
					{
						customId: AUTH_TOKEN_INPUT_ID,
						labelKey: "commands.config.mcp.add.auth_token_label",
						placeholder: "commands.config.mcp.add.auth_token_placeholder",
						required: false,
						style: TextInputStyle.Paragraph,
						maxLength: 500,
					},
					{
						kind: "radioGroup" as const,
						customId: SERVER_TYPE_SELECT_ID,
						labelKey: "commands.config.mcp.add.server_type_label",
						descriptionKey: "commands.config.mcp.add.server_type_description",
						required: false,
						options: serverTypeOptions,
					},
				],
			},
			MessageFlags.Ephemeral,
		);

		if (modalResult.outcome !== "submit") {
			log.info(`[MCP Add] Modal ${modalResult.outcome} for user ${userData.user_id}`);
			return;
		}

		const name = modalResult.values?.[NAME_INPUT_ID]?.trim().replace(/\s+/g, "-");
		const url = modalResult.values?.[URL_INPUT_ID]?.trim();
		const authToken = modalResult.values?.[AUTH_TOKEN_INPUT_ID]?.trim() || undefined;
		const serverTypeRaw = modalResult.values?.[SERVER_TYPE_SELECT_ID]?.trim();
		// "none" or empty means no type — store as null
		const serverType = serverTypeRaw && serverTypeRaw !== "none" ? serverTypeRaw : null;

		if (!modalResult.interaction) {
			log.error("[MCP Add] Modal submit interaction is undefined");
			return;
		}
		const replyInteraction = modalResult.interaction;

		if (!name || !url) {
			await replyInfoEmbed(replyInteraction, locale, {
				titleKey: "commands.config.mcp.add.invalid_input_title",
				descriptionKey: "commands.config.mcp.add.invalid_input_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		// 4. Validate name format
		if (!NAME_REGEX.test(name)) {
			await replyInfoEmbed(replyInteraction, locale, {
				titleKey: "commands.config.mcp.add.invalid_name_title",
				descriptionKey: "commands.config.mcp.add.invalid_name_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		// 5. Validate URL format + security
		const urlValidation = validateMcpUrl(url);
		if (!urlValidation.valid) {
			await replyInfoEmbed(replyInteraction, locale, {
				titleKey: "commands.config.mcp.add.invalid_url_title",
				description: urlValidation.reason,
				color: ColorCode.ERROR,
			});
			return;
		}

		// 6. Check server count limit
		const currentCount = await countGuildMcpServers(tomoriState.server_id);
		if (currentCount >= MAX_SERVERS_PER_GUILD) {
			await replyInfoEmbed(replyInteraction, locale, {
				titleKey: "commands.config.mcp.add.limit_reached_title",
				descriptionKey: "commands.config.mcp.add.limit_reached_description",
				descriptionVars: { max: String(MAX_SERVERS_PER_GUILD) },
				color: ColorCode.ERROR,
			});
			return;
		}

		// 7. Test connection before persisting
		const guildMcpManager = getGuildMcpManager();
		const testResult = await guildMcpManager.testConnection(url, authToken);

		if (!testResult.success) {
			await replyInfoEmbed(replyInteraction, locale, {
				titleKey: "commands.config.mcp.add.connection_failed_title",
				descriptionKey: "commands.config.mcp.add.connection_failed_description",
				descriptionVars: { error: testResult.error || "Unknown error" },
				color: ColorCode.ERROR,
			});
			return;
		}

		// 8. Persist to database (token is encrypted inline, server_type for tool deduplication)
		const insertedRow = await insertGuildMcpServer(
			tomoriState.server_id,
			name,
			url,
			authToken,
			serverType,
		);

		if (!insertedRow) {
			await replyInfoEmbed(replyInteraction, locale, {
				titleKey: "commands.config.mcp.add.duplicate_name_title",
				descriptionKey: "commands.config.mcp.add.duplicate_name_description",
				descriptionVars: { name },
				color: ColorCode.ERROR,
			});
			return;
		}

		// 9. Invalidate cache after successful DB write
		invalidateGuildMcpConfigCache(tomoriState.server_id);

		// 10. Mask the URL for display (show domain only)
		let maskedUrl: string;
		try {
			const parsed = new URL(url);
			maskedUrl = `${parsed.protocol}//${parsed.hostname}`;
		} catch {
			maskedUrl = `${url.substring(0, 30)}...`;
		}

		// 11. Success reply
		await replyInfoEmbed(replyInteraction, locale, {
			titleKey: "commands.config.mcp.add.success_title",
			descriptionKey: "commands.config.mcp.add.success_description",
			descriptionVars: {
				name,
				url: maskedUrl,
				tool_count: String(testResult.toolCount),
				tool_names: testResult.functionNames.join(", ") || "none",
			},
			color: ColorCode.SUCCESS,
		});

		log.success(
			`[MCP Add] Server "${name}" registered for guild ${serverId} ` +
			`(${testResult.toolCount} tools: ${testResult.functionNames.join(", ")})`,
		);
	} catch (error) {
		const context: ErrorContext = {
			userId: userData.user_id,
			serverId: tomoriState?.server_id ?? null,
			tomoriId: tomoriState?.tomori_id ?? null,
			errorType: "CommandExecutionError",
			metadata: { command: "config mcp add" },
		};
		await log.error("Error executing /config mcp add", error as Error, context);

		if (!interaction.replied && !interaction.deferred) {
			await interaction.reply({
				content: localizer(locale, "general.errors.unknown_error_description"),
				flags: MessageFlags.Ephemeral,
			});
		} else {
			await interaction.followUp({
				content: localizer(locale, "general.errors.unknown_error_description"),
				flags: MessageFlags.Ephemeral,
			});
		}
	}
}

// ─── URL Validation Helper ───────────────────────────────────────────

/**
 * Validate a remote MCP server URL for security.
 * Production requires HTTPS. Dev allows http://localhost and http://127.0.0.1.
 * Private IP ranges are blocked in production (SSRF mitigation).
 *
 * @param url - URL string to validate
 * @returns Validation result
 */
function validateMcpUrl(url: string): { valid: boolean; reason: string } {
	const isProduction = process.env.RUN_ENV === "production";

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { valid: false, reason: "Invalid URL format." };
	}

	// Must be HTTP or HTTPS
	if (!["http:", "https:"].includes(parsed.protocol)) {
		return { valid: false, reason: "URL must use HTTP or HTTPS protocol." };
	}

	const hostname = parsed.hostname.toLowerCase();
	const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

	if (isProduction) {
		// Production: HTTPS required
		if (parsed.protocol !== "https:") {
			return { valid: false, reason: "Production requires HTTPS. Use a publicly-hosted MCP server with TLS." };
		}

		// Block private IPs in production
		if (isLocalhost) {
			return { valid: false, reason: "Localhost is not allowed in production." };
		}

		for (const pattern of PRIVATE_IP_PATTERNS) {
			if (pattern.test(hostname)) {
				return { valid: false, reason: "Private IP addresses are not allowed in production." };
			}
		}
	} else {
		// Dev: allow HTTP for localhost only
		if (parsed.protocol === "http:" && !isLocalhost) {
			return { valid: false, reason: "HTTP is only allowed for localhost in development. Use HTTPS for remote servers." };
		}
	}

	return { valid: true, reason: "" };
}
