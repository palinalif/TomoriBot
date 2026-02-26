/**
 * Matrix Relay Handler
 * Auto-discovered by eventHandler.ts via messageCreate folder scanning.
 *
 * Relays TomoriBot's own messages (main persona + alter persona webhooks) to
 * the linked Matrix room, if one exists for the channel.
 *
 * Each message is sent as the persona's own Matrix virtual user
 * (e.g., @_tomori_lilya:yourdomain.com), so Matrix users see the correct
 * display name and avatar without any text prefix.
 *
 * Exit conditions (checked first to minimize overhead):
 *   1. Matrix bridge not configured → immediate return
 *   2. Message not from a guild
 *   3. Message is NOT from TomoriBot itself (checked via isSelfTriggerMessage)
 *   4. Channel has no linked Matrix room
 */

import type { Client, Embed, Message } from "discord.js";
import { getCachedAllPersonas } from "@/utils/cache/tomoriStateCache";
import { isSelfTriggerMessage } from "./tomoriChat";
import {
	isMatrixConfigured,
	getLinkedMatrixRoom,
	sendToMatrixRoom,
	sendAttachmentToMatrixRoom,
	MATRIX_MAX_ATTACHMENT_BYTES,
	getMatrixIdForDisplayName,
} from "@/utils/matrix";
import { log } from "@/utils/misc/logger";
import { localizer, getSupportedLocales } from "@/utils/text/localizer";
import type { TomoriState } from "@/types/db/schema";

// ─── Embed relay helpers ────────────────────────────────────────────────────

/**
 * Maps every resolved locale string for a known tool-result embed title to
 * its corresponding Matrix summary locale key and extraction mode.
 * Built once on first use and reused for all subsequent calls.
 */
type EmbedRelayConfig = {
	matrixKey: string;
	mode: "memory" | "description" | "title";
};

let embedTitleMap: Map<string, EmbedRelayConfig> | null = null;
let embedTitlePatternMap: Array<{ pattern: RegExp; config: EmbedRelayConfig }> | null = null;

/**
 * Escape regex metacharacters so locale template text can be converted safely
 * into a runtime-matching RegExp.
 */
function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a regex that matches runtime-resolved embed titles from locale templates.
 * Example: "💡 ... {user_nickname}!" => /^💡 ... .+?!$/.
 */
function buildTemplateTitlePattern(template: string): RegExp | null {
	if (!template.includes("{")) return null;
	const escaped = escapeRegex(template);
	const withPlaceholders = escaped.replace(/\\\{[^}]+\\\}/g, ".+?");
	return new RegExp(`^${withPlaceholders}$`);
}

/**
 * Return (building once) the title→summary-config map across all loaded locales.
 * Covers both en-US and ja so servers using either locale are handled correctly.
 */
function getEmbedTitleMap(): Map<string, EmbedRelayConfig> {
	if (embedTitleMap) return embedTitleMap;

	// Each entry: [Discord embed title locale key, Matrix summary key, extraction mode]
	//   mode "memory"      — description contains memory text in backticks; extract code span → {memory} variable
	//   mode "description" — description is prose; strip Discord markdown → {description} variable
	//   mode "title"       — title is already the key info (e.g. search status); wrap in [...]
	//                        no locale key needed — the title is already translated per server locale
	const mappings: [string, string, "memory" | "description" | "title"][] = [
		["genai.self_teach.server_memory_learned_title",   "matrix.embed.server_memory_learned",   "memory"],
		["genai.self_teach.personal_memory_learned_title", "matrix.embed.personal_memory_learned", "memory"],
		["genai.self_teach.server_memory_updated_title",   "matrix.embed.server_memory_updated",   "memory"],
		["genai.self_teach.personal_memory_updated_title", "matrix.embed.personal_memory_updated", "memory"],
		["reminders.reminder_set_title",                   "matrix.embed.reminder_set",            "description"],
		["reminders.task_set_title",                       "matrix.embed.task_set",                "description"],
		["reminders.recurring_task_set_title",             "matrix.embed.recurring_task_set",      "description"],
		// Search status embeds — title already contains query + action; use as-is
		["genai.search.web_search_title",                  "",                                     "title"],
		["genai.search.image_search_title",                "",                                     "title"],
		["genai.search.video_search_title",                "",                                     "title"],
		["genai.search.news_search_title",                 "",                                     "title"],
	];

	embedTitleMap = new Map();
	embedTitlePatternMap = [];
	for (const locale of getSupportedLocales()) {
		for (const [titleKey, matrixKey, mode] of mappings) {
			// localizer falls back gracefully if the key is missing in this locale
			const resolvedTitle = localizer(locale, titleKey);
			if (resolvedTitle !== titleKey) {
				const config = { matrixKey, mode };
				embedTitleMap.set(resolvedTitle, config);

				const templatePattern = buildTemplateTitlePattern(resolvedTitle);
				if (templatePattern) {
					embedTitlePatternMap.push({ pattern: templatePattern, config });
				}
			}
		}
	}
	return embedTitleMap;
}

/**
 * Resolve embed relay config by exact title first, then by template pattern.
 */
function getEmbedRelayConfig(title: string): EmbedRelayConfig | null {
	const exactMatch = getEmbedTitleMap().get(title);
	if (exactMatch) return exactMatch;

	if (!embedTitlePatternMap) return null;
	for (const entry of embedTitlePatternMap) {
		if (entry.pattern.test(title)) {
			return entry.config;
		}
	}

	return null;
}

/**
 * Strip Discord inline markdown from a string for plain-text Matrix relay.
 * Removes **bold**, *italic*, __underline__, ~~strikethrough~~, and `code` spans.
 *
 * @param text - Raw Discord markdown string
 * @returns Plain text with inline formatting removed
 */
function stripDiscordMarkdown(text: string): string {
	return text
		.replace(/\*\*(.+?)\*\*/g, "$1")  // **bold**
		.replace(/__(.+?)__/g, "$1")       // __underline__
		.replace(/~~(.+?)~~/g, "$1")       // ~~strikethrough~~
		.replace(/\*(.+?)\*/g, "$1")       // *italic*
		.replace(/`(.+?)`/g, "$1")         // `code`
		.trim();
}

/**
 * Escape special HTML characters in a string for safe embedding in HTML attributes
 * or element content (e.g., inside Matrix mention anchor tags).
 *
 * @param text - Raw string that may contain HTML-special characters
 * @returns HTML-safe string with &, <, >, " replaced by their entity equivalents
 */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * Resolve all mention formats in a Discord message body to proper Matrix equivalents,
 * building both a plain-text `body` and an HTML `formatted_body` in a single pass.
 *
 * Handles two mention formats that appear in TomoriBot's Discord messages:
 *
 *   `<@userId>` / `<@!userId>` — Discord snowflake mentions (already resolved by Discord.js
 *     before matrixRelay.ts sees the message). The guild member's display name is used to
 *     look up a corresponding Matrix ID; if found, rendered as a Matrix mention anchor.
 *     If the user is Discord-only, rendered as plain display name.
 *
 *   `@{name}` — TomoriBot's internal mention format injected by contextBuilder.ts.
 *     Resolved the same way as above using the display name directly.
 *
 * Resolution rules (same for both formats):
 *   - Known Matrix user → `@user:server` (plain) + `<a href="...">` (HTML) + `m.mentions` entry
 *   - Discord/unknown user → display name only (no ping, no anchor tag)
 *
 * @param text    - Raw Discord message content (may contain `<@id>` and/or `@{name}` patterns)
 * @param message - The Discord Message object (provides resolved mention users + guild context)
 * @returns Object with `body` (plain text), `formattedBody` (HTML, or undefined if no Matrix
 *          mentions were resolved), and `mentionedIds` (Matrix user IDs for MSC3952 `m.mentions`)
 */
function resolveDiscordTextForMatrix(
	text: string,
	message: Message,
): { body: string; formattedBody: string | undefined; mentionedIds: string[] } {
	// Matches both Discord snowflakes (<@id>, <@!id>) and internal @{name} placeholders
	const pattern = /<@!?(\d+)>|@\{([^}]+)\}/g;

	// Fast path: skip expensive processing when no mention patterns are present
	if (!pattern.test(text)) {
		return { body: text, formattedBody: undefined, mentionedIds: [] };
	}
	pattern.lastIndex = 0;

	const mentionedIds: string[] = [];
	let hasMatrixMentions = false;

	// Build body (plain text) and htmlParts (formatted_body) in a single pass
	// so we traverse the string once regardless of the number of patterns found
	const bodyParts: string[] = [];
	const htmlParts: string[] = [];
	let lastIndex = 0;

	for (const match of text.matchAll(pattern)) {
		// 1. Append the literal text between the previous match and this one
		const literal = text.slice(lastIndex, match.index);
		bodyParts.push(literal);
		htmlParts.push(escapeHtml(literal));
		lastIndex = (match.index ?? 0) + match[0].length;

		const [, snowflake, internalName] = match;

		if (snowflake) {
			// Discord snowflake mention — resolve via message.mentions.users
			const user = message.mentions.users.get(snowflake);
			const displayName =
				message.guild?.members.cache.get(snowflake)?.displayName ??
				user?.displayName ??
				user?.username ??
				snowflake;
			const matrixId = getMatrixIdForDisplayName(displayName);

			if (matrixId) {
				mentionedIds.push(matrixId);
				hasMatrixMentions = true;
				bodyParts.push(matrixId);
				htmlParts.push(
					`<a href="https://matrix.to/#/${matrixId}">${escapeHtml(displayName)}</a>`,
				);
			} else {
				// Discord-only user — strip <@id>, keep their display name
				bodyParts.push(displayName);
				htmlParts.push(escapeHtml(displayName));
			}
		} else if (internalName) {
			// @{name} internal format — resolve by display name directly
			const matrixId = getMatrixIdForDisplayName(internalName);

			if (matrixId) {
				mentionedIds.push(matrixId);
				hasMatrixMentions = true;
				bodyParts.push(matrixId);
				htmlParts.push(
					`<a href="https://matrix.to/#/${matrixId}">${escapeHtml(internalName)}</a>`,
				);
			} else {
				// Discord-only or unknown user — strip @{} wrapper, keep name
				bodyParts.push(internalName);
				htmlParts.push(escapeHtml(internalName));
			}
		}
	}

	// 2. Append any trailing literal text after the last match
	const tail = text.slice(lastIndex);
	bodyParts.push(tail);
	htmlParts.push(escapeHtml(tail));

	return {
		body: bodyParts.join(""),
		// Only include formatted_body when at least one Matrix mention anchor was produced;
		// plain name substitutions (Discord-only users) don't require HTML rendering
		formattedBody: hasMatrixMentions ? htmlParts.join("") : undefined,
		mentionedIds,
	};
}

/**
 * Convert a Discord embed sent by TomoriBot into a concise Matrix text notice.
 * Returns null for embeds that are not recognised tool-result embeds (e.g. slash
 * command responses, refresh embeds) — those are silently skipped.
 *
 * @param embed        - The Discord Embed object from the message
 * @param serverLocale - The server's configured locale, used to localise the summary
 */
function embedToMatrixText(embed: Embed, serverLocale: string): string | null {
	if (!embed.title) return null;

	const config = getEmbedRelayConfig(embed.title);
	if (!config) return null;

	if (config.mode === "title") {
		// Search status embeds: the title is already the full info (e.g. "🔍 Searching for `query` on the web...")
		// Strip backtick code spans from the query and wrap in brackets — no separate locale key needed
		// since the title is already translated per the server's configured locale.
		return `[${stripDiscordMarkdown(embed.title)}]`;
	}

	if (!embed.description) return null;

	if (config.mode === "memory") {
		// Memory embed descriptions keep the actual memory text in backticks.
		// Prefer extracting that code span so this works for both concise and prose formats.
		const memoryMatch = embed.description.match(/`([^`]+)`/);
		const memory = memoryMatch
			? memoryMatch[1].trim()
			: stripDiscordMarkdown(embed.description).trim();
		return localizer(serverLocale, config.matrixKey, { memory });
	}

	// Reminder/task embed descriptions are prose with Discord markdown formatting
	const description = stripDiscordMarkdown(embed.description);
	return localizer(serverLocale, config.matrixKey, { description });
}

/**
 * Handler function auto-discovered and invoked by eventHandler.ts on each messageCreate event.
 * Relays TomoriBot's responses to the linked Matrix room (if any).
 *
 * @param client  - The Discord.js client
 * @param message - The incoming Discord message
 */
const handler = async (client: Client, message: Message): Promise<void> => {
	// 1. Fast exit: skip if Matrix bridge is not configured (common case)
	if (!isMatrixConfigured()) return;

	// 2. Only process guild messages (Matrix bridge is server-scoped)
	if (!message.guild) return;

	// 3. Only relay messages that originate from TomoriBot itself
	//    (main persona bot account OR alter persona webhook messages)
	const allPersonas: TomoriState[] = await getCachedAllPersonas(message.guild.id);
	if (!isSelfTriggerMessage(message, allPersonas)) return;

	// 4. Check if this channel has a linked Matrix room (cached DB lookup)
	const roomId = await getLinkedMatrixRoom(message.channelId);
	if (!roomId) return;

	// 5. Identify which persona sent this message and retrieve its avatar URL.
	//    The persona's virtual Matrix user will be provisioned with this identity.
	let persona: TomoriState | undefined;
	let avatarUrl: string | null;

	if (message.author.id === client.user?.id) {
		// Main bot account — find the main (non-alter) persona
		persona = allPersonas.find((p) => !p.is_alter);

		// The main persona sends as the bot account, not a webhook, so webhook_avatar_url
		// is not set. Prefer the guild member avatar (set via /server avatar or persona swap),
		// which is per-server and overrides the global Developer Portal avatar.
		// GuildMember.displayAvatarURL() handles the priority chain automatically:
		// guild avatar → global avatar.
		avatarUrl =
			message.guild?.members.me?.displayAvatarURL({ size: 256, extension: "png" }) ??
			message.author.displayAvatarURL({ size: 256, extension: "png" });
	} else {
		// Alter persona webhook — match by username (case-insensitive)
		const authornameLower = message.author.username.toLowerCase();
		persona = allPersonas.find(
			(p) => p.tomori_nickname?.toLowerCase() === authornameLower,
		);

		// Warn if no persona matched — the fallback uses the webhook username as the
		// virtual user localpart, which may create an orphaned Matrix user
		if (!persona) {
			log.warn(
				`Matrix relay: no persona found for alter webhook "${message.author.username}" ` +
				`— using webhook username as Matrix virtual user fallback`,
			);
		}

		// webhook_avatar_url holds the S3 CDN URL used for Discord persona avatars
		avatarUrl = persona?.webhook_avatar_url ?? null;
	}

	// Fall back to username if no matching persona is found
	const personaName = persona?.tomori_nickname ?? message.author.username;

	// 6. Relay the text content (skip if empty after trim)
	//    Identity is conveyed by the virtual Matrix user — no bold prefix needed.
	//    @{name} placeholders are transformed to proper Matrix mention links so
	//    Matrix clients highlight and notify the mentioned user (MSC3952).
	const rawText = message.content.trim();
	if (rawText) {
		const { body, formattedBody, mentionedIds } = resolveDiscordTextForMatrix(rawText, message);
		try {
			await sendToMatrixRoom(
				roomId,
				body,
				personaName,
				avatarUrl,
				formattedBody,
				mentionedIds.length > 0 ? mentionedIds : undefined,
			);
		} catch (error) {
			log.warn(`Matrix relay: failed to relay message to room ${roomId}`, error);
		}
	}

	// 7. Relay each file attachment as a Matrix media event
	//    Uses proxyURL for stability (Discord CDN proxy avoids expiry issues)
	const mediaTimeoutMs = Number.parseInt(process.env.MATRIX_MEDIA_TIMEOUT_MS || "15000", 10);

	for (const attachment of message.attachments.values()) {
		// 7a. Skip attachments that exceed the configured size limit (shared constant
		//    with matrixManager.ts so both sides enforce the same threshold)
		if (attachment.size > MATRIX_MAX_ATTACHMENT_BYTES) {
			log.warn(
				`Matrix relay: skipping oversized attachment "${attachment.name}" ` +
				`(${(attachment.size / (1024 * 1024)).toFixed(1)} MB) for room ${roomId}`,
			);
			continue;
		}

		try {
			// 7b. Fetch the file from Discord's proxy CDN (timeout prevents stalls)
			const response = await fetch(attachment.proxyURL, {
				signal: AbortSignal.timeout(mediaTimeoutMs),
			});
			if (!response.ok) {
				log.warn(`Matrix relay: failed to fetch attachment "${attachment.name}" (${response.status})`);
				continue;
			}

			const arrayBuffer = await response.arrayBuffer();
			const mimeType    = attachment.contentType ?? "application/octet-stream";
			const filename    = attachment.name ?? "attachment";

			// 7c. Upload to Matrix and send as a media event under the persona's virtual user
			await sendAttachmentToMatrixRoom(
				roomId,
				arrayBuffer,
				filename,
				mimeType,
				attachment.size,
				personaName,
				avatarUrl,
			);
		} catch (error) {
			log.warn(`Matrix relay: failed to relay attachment "${attachment.name}" to room ${roomId}`, error);
		}
	}

	// 8. Relay recognised tool-result embeds as concise bracketed Matrix notices.
	//    Discord embeds (memory learned, reminder set, etc.) cannot be rendered in
	//    Matrix, so we convert them to short inline text using matrix.embed.* locale keys.
	//    The embed title is matched against all loaded locales so Japanese-locale servers
	//    are handled correctly. Unknown embed types (e.g. slash command UI) are skipped.
	for (const embed of message.embeds) {
		const matrixText = embedToMatrixText(embed, "en-US");
		if (!matrixText) continue;

		try {
			await sendToMatrixRoom(roomId, matrixText, personaName, avatarUrl);
		} catch (error) {
			log.warn(`Matrix relay: failed to relay embed to room ${roomId}`, error);
		}
	}
};

export default handler;
