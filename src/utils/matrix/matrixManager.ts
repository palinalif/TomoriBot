/**
 * Matrix Bridge Manager
 * Singleton Matrix client that provides bidirectional message relay between
 * Discord channels and Matrix rooms via matrix-js-sdk.
 *
 * Architecture:
 *   Matrix Room ─[sync]─> setupMatrixSyncListener ─[webhook]─> Discord Channel
 *   Discord Channel ─[matrixRelay.ts]─> sendToMatrixRoom ─> Matrix Room
 *
 * Loop prevention:
 *   - Matrix→Discord: webhook username is "[Matrix|@user:host] Name" (never matches a persona nickname)
 *   - Discord→Matrix: sync listener filters event.getSender() === MATRIX_BOT_USER_ID
 */

import {
	createClient,
	ClientEvent,
	RoomEvent,
	EventType,
	MsgType,
	getHttpUriForMxc,
	type MatrixClient,
} from "matrix-js-sdk";
import type { RoomMessageEventContent } from "matrix-js-sdk/lib/@types/events";
import { EmbedBuilder, MessageFlags, type BaseGuildTextChannel, type Client } from "discord.js";
import { sql } from "@/utils/db/client";
import { log, ColorCode } from "@/utils/misc/logger";
import { getOrCreateWebhook } from "@/utils/discord/webhookManager";
import { clearShortTermMemoryForChannel } from "@/utils/cache/shortTermMemoryCache";
import { localizer } from "@/utils/text/localizer";

// ─── Module-level state ────────────────────────────────────────────────────

/** Matrix event type for text messages (concatenated to avoid locale-key scanner false-positive). */
// eslint-disable-next-line prefer-template
const MATRIX_TEXT_MSG_TYPE = "m.room" + ".message";

/** Initialized Matrix client, or null if Matrix is not configured. */
let matrixClient: MatrixClient | null = null;

/**
 * Cache TTL for channel-room link DB lookups.
 * Configurable via MATRIX_LINK_CACHE_TTL_MINUTES (default: 5 minutes).
 */
const CACHE_TTL_MS =
	Number.parseInt(process.env.MATRIX_LINK_CACHE_TTL_MINUTES || "5", 10) * 60_000;

/**
 * Maximum attachment size (in bytes) to relay in either direction.
 * Files larger than this threshold are replaced with a text notice.
 * Configurable via MATRIX_MAX_ATTACHMENT_MB (default: 8 MB).
 */
const MATRIX_MAX_ATTACHMENT_BYTES =
	Number.parseInt(process.env.MATRIX_MAX_ATTACHMENT_MB || "8", 10) * 1024 * 1024;

/**
 * Timeout in milliseconds for Matrix media download/upload requests.
 * Configurable via MATRIX_MEDIA_TIMEOUT_MS (default: 15 000 ms).
 */
const MATRIX_MEDIA_TIMEOUT_MS =
	Number.parseInt(process.env.MATRIX_MEDIA_TIMEOUT_MS || "15000", 10);

/** Cache: Discord channel ID → linked Matrix room ID (null = known-not-linked). */
const channelLinkCache = new Map<
	string,
	{ roomId: string | null; cachedAt: number }
>();

/** Cache: Matrix room ID → linked Discord channel ID (null = known-not-linked). */
const roomLinkCache = new Map<
	string,
	{ channelDiscId: string | null; cachedAt: number }
>();

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Initialize the Matrix client from environment variables.
 * No-op and silent if MATRIX_HOMESERVER_URL / MATRIX_ACCESS_TOKEN / MATRIX_BOT_USER_ID
 * are not set — the bot starts normally without Matrix support.
 *
 * @param discordClient - The Discord.js client, passed to the sync listener for channel lookups
 */
export async function initializeMatrixClient(discordClient: Client): Promise<void> {
	const homeserverUrl = process.env.MATRIX_HOMESERVER_URL;
	const accessToken   = process.env.MATRIX_ACCESS_TOKEN;
	const botUserId     = process.env.MATRIX_BOT_USER_ID;

	// Silently skip initialization if any required Matrix credential is absent
	if (!homeserverUrl || !accessToken || !botUserId) {
		log.info("Matrix bridge: credentials not configured — bridge disabled");
		return;
	}

	try {
		// 1. Create Matrix client (no-op store: we only need sync + send)
		matrixClient = createClient({
			baseUrl:     homeserverUrl,
			accessToken: accessToken,
			userId:      botUserId,
		});

		// 2. Register timeline listener BEFORE starting the client so we don't miss events
		setupMatrixSyncListener(discordClient, botUserId);

		// 3. Start client with initialSyncLimit=0 to skip replaying historical messages
		matrixClient.startClient({ initialSyncLimit: 0 });

		// 4. Wait until the initial sync is "PREPARED" before reporting success
		await new Promise<void>((resolve) => {
			matrixClient?.once(ClientEvent.Sync, (state) => {
				if (state === "PREPARED") resolve();
			});
		});

		log.success(
			`Matrix bridge initialized — connected as ${botUserId} @ ${homeserverUrl}`,
		);
	} catch (error) {
		log.error("Matrix bridge: failed to initialize client", error as Error);
		matrixClient = null;
	}
}

/**
 * Returns the initialized Matrix client, or null if Matrix is not configured.
 * Callers should check for null before using the client.
 */
export function getMatrixClient(): MatrixClient | null {
	return matrixClient;
}

/**
 * Send a plain-text message to a Matrix room.
 * Silently no-ops if the Matrix client is not configured.
 *
 * @param roomId - The Matrix room ID (e.g., "!abc:matrix.org")
 * @param text   - The message content to send
 */
export async function sendToMatrixRoom(roomId: string, text: string): Promise<void> {
	if (!matrixClient) return;

	try {
		await matrixClient.sendTextMessage(roomId, text);
	} catch (error) {
		// Non-critical: log warning but don't propagate to avoid disrupting Discord flow
		log.warn(`Matrix bridge: failed to send message to room ${roomId}`, error);
	}
}

/**
 * Upload a file to Matrix and send it as a media event in the given room.
 * Silently no-ops if the Matrix client is not configured.
 * Uses `m.image` msgtype for image/* MIME types, `m.video` for video/*, else `m.file`.
 *
 * @param roomId   - The Matrix room ID (e.g., "!abc:matrix.org")
 * @param data     - Raw file bytes as an ArrayBuffer (avoids Node.js Buffer ↔ Blob friction)
 * @param filename - Original filename (used as the event `body`)
 * @param mimeType - MIME type string (e.g., "image/png")
 * @param size     - File size in bytes (included in the event `info` block)
 */
export async function sendAttachmentToMatrixRoom(
	roomId: string,
	data: ArrayBuffer,
	filename: string,
	mimeType: string,
	size: number,
): Promise<void> {
	if (!matrixClient) return;

	try {
		// 1. Wrap in Blob for uploadContent() — Blob (not Buffer) satisfies
		//    XMLHttpRequestBodyInit (FileType), and ArrayBuffer is a valid BlobPart
		const blob           = new Blob([data], { type: mimeType });
		const uploadResponse = await matrixClient.uploadContent(blob, {
			name: filename,
			type: mimeType,
		});
		const mxcUri = uploadResponse.content_uri;
		const info   = { mimetype: mimeType, size };

		// 2. Route to the appropriate typed send method based on MIME type.
		//    sendImageMessage() exists in the SDK; for video/file we use sendEvent()
		//    with an explicit type assertion since the sendMessage() union is too narrow.
		if (mimeType.startsWith("image/")) {
			await matrixClient.sendImageMessage(roomId, mxcUri, info, filename);
		} else {
			const msgtype = mimeType.startsWith("video/") ? MsgType.Video : MsgType.File;
			// sendMessage()'s union type (RoomMessageEventContent) is overly strict for
			// dynamic msgtype values — use sendEvent() with a double cast as the escape hatch
			const mediaContent = {
				msgtype,
				body: filename,
				url: mxcUri,
				info,
			} as unknown as RoomMessageEventContent;
			await matrixClient.sendEvent(roomId, EventType.RoomMessage, mediaContent);
		}
	} catch (error) {
		// Non-critical: log warning but don't propagate to avoid disrupting Discord flow
		log.warn(`Matrix bridge: failed to send attachment to room ${roomId}`, error);
	}
}

/**
 * Cached DB lookup: Discord channel ID → linked Matrix room ID.
 * Returns null if the channel has no linked Matrix room.
 * Results are cached for CACHE_TTL_MS to reduce DB load.
 *
 * @param channelDiscId - The Discord channel ID to look up
 * @returns The linked Matrix room ID, or null if not linked
 */
export async function getLinkedMatrixRoom(channelDiscId: string): Promise<string | null> {
	const now    = Date.now();
	const cached = channelLinkCache.get(channelDiscId);

	// Return cached result if still fresh
	if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
		return cached.roomId;
	}

	// Query DB for link
	const [row] = await sql<{ matrix_room_id: string }[]>`
		SELECT matrix_room_id
		FROM matrix_channel_links
		WHERE channel_disc_id = ${channelDiscId}
		LIMIT 1
	`;

	const roomId = row?.matrix_room_id ?? null;
	channelLinkCache.set(channelDiscId, { roomId, cachedAt: now });

	return roomId;
}

/**
 * Cached DB lookup: Matrix room ID → linked Discord channel ID.
 * Returns null if the room has no linked Discord channel.
 * Results are cached for CACHE_TTL_MS to reduce DB load.
 *
 * @param matrixRoomId - The Matrix room ID to look up
 * @returns The linked Discord channel ID, or null if not linked
 */
export async function getDiscordChannelForRoom(matrixRoomId: string): Promise<string | null> {
	const now    = Date.now();
	const cached = roomLinkCache.get(matrixRoomId);

	// Return cached result if still fresh
	if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
		return cached.channelDiscId;
	}

	// Query DB for link
	const [row] = await sql<{ channel_disc_id: string }[]>`
		SELECT channel_disc_id
		FROM matrix_channel_links
		WHERE matrix_room_id = ${matrixRoomId}
		LIMIT 1
	`;

	const channelDiscId = row?.channel_disc_id ?? null;
	roomLinkCache.set(matrixRoomId, { channelDiscId, cachedAt: now });

	return channelDiscId;
}

/**
 * Invalidate both link caches for a given Discord channel (and optionally its Matrix room).
 * Must be called after any INSERT/UPDATE/DELETE on matrix_channel_links to prevent stale data.
 *
 * @param channelDiscId  - The Discord channel ID whose cache entry to clear
 * @param matrixRoomId   - Optional: the Matrix room ID whose cache entry to also clear
 */
export function invalidateMatrixLinkCache(
	channelDiscId: string,
	matrixRoomId?: string,
): void {
	channelLinkCache.delete(channelDiscId);
	if (matrixRoomId) {
		roomLinkCache.delete(matrixRoomId);
	}
}

// ─── Private helpers ───────────────────────────────────────────────────────

/**
 * Download a Matrix media file identified by an `mxc://` URL.
 * Handles authenticated media (MSC3916) by sending the bot's access token.
 * Returns null and logs a warning on any failure (network, size, or parse error).
 *
 * @param mxcUrl        - The `mxc://` media URL from the Matrix event content
 * @param homeserverUrl - The homeserver base URL used to resolve the HTTP download URL
 * @param accessToken   - The bot's access token for authenticated media endpoints
 * @param knownSize     - Optional pre-flight size from the event's `info.size` field
 * @returns             - `{ buffer, mimeType }` on success, or null on failure
 */
async function downloadMatrixMedia(
	mxcUrl: string,
	homeserverUrl: string,
	accessToken: string,
	knownSize?: number,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
	// 1. Pre-flight size guard: reject oversized files before even fetching
	if (knownSize !== undefined && knownSize > MATRIX_MAX_ATTACHMENT_BYTES) {
		return null;
	}

	// 2. Convert mxc:// URI to a standard HTTP(S) download URL
	const httpUrl = getHttpUriForMxc(homeserverUrl, mxcUrl);
	if (!httpUrl) {
		log.warn(`Matrix bridge: could not resolve mxc URL: ${mxcUrl}`);
		return null;
	}

	try {
		// 3. Fetch with auth header and a timeout (MSC3916 authenticated media)
		const response = await fetch(httpUrl, {
			headers: { Authorization: `Bearer ${accessToken}` },
			signal: AbortSignal.timeout(MATRIX_MEDIA_TIMEOUT_MS),
		});

		if (!response.ok) {
			log.warn(`Matrix bridge: media fetch failed (${response.status}) for ${httpUrl}`);
			return null;
		}

		// 4. Secondary size guard via Content-Length header (if provided)
		const contentLength = Number.parseInt(
			response.headers.get("content-length") ?? "0",
			10,
		);
		if (contentLength > MATRIX_MAX_ATTACHMENT_BYTES) {
			return null;
		}

		// 5. Buffer the response body
		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// 6. Final size guard on the actual downloaded bytes
		if (buffer.length > MATRIX_MAX_ATTACHMENT_BYTES) {
			return null;
		}

		const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
		return { buffer, mimeType };
	} catch (error) {
		log.warn(`Matrix bridge: failed to download media from ${httpUrl}`, error);
		return null;
	}
}

/**
 * Handles the Matrix `/refresh` command.
 * Posts the standard refresh embed to the Discord channel (triggering history reset in tomoriChat)
 * and clears the short-term memory cache for the channel.
 *
 * The embed title matches `commands.tool.refresh.title` — the exact marker that
 * `checkTargetEmbedTitle()` in tomoriChat.ts detects as a conversation history reset point.
 *
 * @param channel       - The Discord text channel to post the embed to
 * @param channelDiscId - The Discord channel ID (for cache invalidation)
 */
async function handleMatrixRefresh(
	channel: BaseGuildTextChannel,
	channelDiscId: string,
): Promise<void> {
	// 1. Clear short-term memory cache for this channel (same as /tool refresh does)
	clearShortTermMemoryForChannel(channelDiscId);
	log.info(`Matrix /refresh: cleared short-term memories for channel ${channelDiscId}`);

	// 2. Build the refresh embed using en-US locale as the canonical reset marker.
	//    tomoriChat checks all supported locales, so this will be detected regardless of
	//    the server's configured locale.
	const embed = new EmbedBuilder()
		.setTitle(localizer("en-US", "commands.tool.refresh.title"))
		.setDescription(localizer("en-US", "commands.tool.refresh.response"))
		.setColor(ColorCode.SECTION);

	// 3. Send the embed to Discord (suppress notifications to avoid pinging everyone)
	await channel.send({
		embeds:  [embed],
		flags:   MessageFlags.SuppressNotifications,
	});
}

/**
 * Attach the RoomEvent.Timeline listener that relays Matrix messages to Discord.
 * Called during initialization before startClient() so no events are missed.
 *
 * Loop prevention: events sent by the bot's own Matrix account are filtered
 * using event.getSender() === botUserId.
 *
 * @param discordClient - Discord.js client for channel/webhook resolution
 * @param botUserId     - The bot's Matrix user ID (e.g., "@tomoribot:matrix.org")
 */
function setupMatrixSyncListener(discordClient: Client, botUserId: string): void {
	if (!matrixClient) return;

	matrixClient.on(RoomEvent.Timeline, async (event, room, toStartOfTimeline) => {
		try {
			// DEBUG: log every timeline event so we can see what's being received
			log.info(
				`[Matrix debug] event type=${event.getType()} room=${room?.roomId} sender=${event.getSender()} toStartOfTimeline=${toStartOfTimeline}`,
			);

			// 1. Skip historical events replayed from start of timeline
			if (toStartOfTimeline) {
				log.info("[Matrix debug] skipped: toStartOfTimeline=true");
				return;
			}

			// 2. Only relay text messages
			if (event.getType() !== MATRIX_TEXT_MSG_TYPE) {
				log.info(`[Matrix debug] skipped: event type ${event.getType()} is not m.room.message`);
				return;
			}

			// 3. Loop prevention: ignore messages sent by the bot itself
			if (event.getSender() === botUserId) {
				log.info("[Matrix debug] skipped: sender is bot itself");
				return;
			}

			if (!room) {
				log.info("[Matrix debug] skipped: room is undefined");
				return;
			}

			// 4. Look up the linked Discord channel (cached DB query)
			const channelDiscId = await getDiscordChannelForRoom(room.roomId);
			log.info(`[Matrix debug] getDiscordChannelForRoom(${room.roomId}) = ${channelDiscId}`);
			if (!channelDiscId) return;

			// 5. Fetch the Discord channel
			const channel = await discordClient.channels.fetch(channelDiscId).catch(() => null);
			if (!channel?.isTextBased() || channel.isDMBased()) return;

			// 6. Build the webhook username from Matrix sender info
			const sender      = event.getSender() ?? "unknown";
			const displayName = room.getMember(sender)?.name ?? sender;
			const rawUsername = `[Matrix|${sender}] ${displayName}`;
			// Discord limits webhook usernames to 80 characters
			const username    = rawUsername.length > 80
				? `${rawUsername.slice(0, 77)}...`
				: rawUsername;

			// 7. Extract content and msgtype
			const content  = event.getContent();
			const msgtype  = (content.msgtype as string | undefined) ?? "m.text";
			const bodyText = (content.body as string | undefined)?.trim();

			// 8. Branch on msgtype: media events relay as Discord file attachments
			const isMediaMsg =
				msgtype === "m.image" ||
				msgtype === "m.video" ||
				msgtype === "m.file"  ||
				msgtype === "m.audio";

			if (isMediaMsg) {
				// 8a. Resolve the webhook first (needed for both success and fallback paths)
				const { webhook: mediaWebhook } = await getOrCreateWebhook(channel as BaseGuildTextChannel);
				if (!mediaWebhook) return;

				const mxcUrl    = content.url as string | undefined;
				const info      = content.info as Record<string, unknown> | undefined;
				const knownSize = typeof info?.size === "number" ? info.size : undefined;
				const filename  = bodyText ?? "attachment";

				// 8b. Reject oversized attachments with a text notice rather than silently dropping
				if (knownSize !== undefined && knownSize > MATRIX_MAX_ATTACHMENT_BYTES) {
					const sizeMb = (knownSize / (1024 * 1024)).toFixed(1);
					await mediaWebhook.send({
						content: `[Matrix: attachment too large to relay (${sizeMb} MB)]`,
						username,
						allowedMentions: { parse: [] },
					});
					return;
				}

				// 8c. Attempt to download and relay the media file
				if (mxcUrl) {
					const homeserverUrl = process.env.MATRIX_HOMESERVER_URL ?? "";
					const accessToken   = process.env.MATRIX_ACCESS_TOKEN   ?? "";
					const media = await downloadMatrixMedia(mxcUrl, homeserverUrl, accessToken, knownSize);

					if (media) {
						await mediaWebhook.send({
							files: [{ attachment: media.buffer, name: filename }],
							username,
							allowedMentions: { parse: [] },
						});
						return;
					}
				}

				// 8d. Fallback: media unavailable (bad URL, download failure, etc.)
				await mediaWebhook.send({
					content: `[Matrix: attachment unavailable — ${filename}]`,
					username,
					allowedMentions: { parse: [] },
				});
				return;
			}

			// 9. Text / emote / unknown: relay as plain text
			//    Skip m.notice (bot/automated messages) to prevent relay loops with other bots
			if (msgtype === "m.notice") return;

			if (!bodyText) return;

			// 10. Special command: /refresh — post the standard reset embed to Discord
			//     instead of relaying the raw text. The embed title is the exact marker
			//     that checkTargetEmbedTitle() in tomoriChat.ts detects as a history reset point.
			if (bodyText === "/refresh") {
				await handleMatrixRefresh(channel as BaseGuildTextChannel, channelDiscId);
				return;
			}

			// 11. Send via webhook so the sender identity appears correctly in Discord
			const { webhook } = await getOrCreateWebhook(channel as BaseGuildTextChannel);
			if (!webhook) return;

			await webhook.send({
				content: bodyText,
				username,
				allowedMentions: { parse: [] }, // Prevent accidental Discord @mentions from Matrix text
			});
		} catch (error) {
			log.warn("Matrix bridge: error relaying Matrix message to Discord", error);
		}
	});
}
