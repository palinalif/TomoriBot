/**
 * Matrix Bridge Manager (Appservice Edition)
 * Manages the Matrix Appservice bridge, giving each TomoriBot persona its own
 * virtual Matrix user identity (e.g., @_tomori_lilya:yourdomain.com).
 *
 * Architecture:
 *   Matrix Room ─[push]─> appservice HTTP server ─[onEvent]─> Discord Channel
 *   Discord Channel ─[matrixRelay.ts]─> sendToMatrixRoom ─[Intent]─> Matrix Room
 *
 * Loop prevention:
 *   - Matrix→Discord: onEvent filters sender === botUserId OR startsWith("@_tomori_")
 *   - Discord→Matrix: persona Intents send under virtual user IDs, not the bot account
 */

import { Bridge, AppServiceRegistration } from "matrix-appservice-bridge";
import type {
	Intent,
	WeakEvent,
	Request as BridgeRequest,
} from "matrix-appservice-bridge";
import {
	EmbedBuilder,
	MessageFlags,
	type BaseGuildTextChannel,
	type Client,
} from "discord.js";
import { sql } from "@/utils/db/client";
import { log, ColorCode } from "@/utils/misc/logger";
import { getOrCreateWebhook } from "@/utils/discord/webhookManager";
import { clearShortTermMemoryForChannel } from "@/utils/cache/shortTermMemoryCache";
import { localizer } from "@/utils/text/localizer";

// ─── Module-level state ────────────────────────────────────────────────────

/**
 * Matrix event type for room messages (the "m.room" + ".message" string, kept split
 * so the locale-key scanner does not treat it as a missing locale key reference).
 */
// eslint-disable-next-line prefer-template
const MATRIX_TEXT_MSG_TYPE = "m.room" + ".message";

/** Initialized Matrix Bridge, or null if Matrix is not configured. */
let matrixBridge: Bridge | null = null;

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
 * Exported so matrixRelay.ts can enforce the same limit on Discord→Matrix uploads.
 */
export const MATRIX_MAX_ATTACHMENT_BYTES =
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

/**
 * In-memory cache of provisioned persona intents.
 * Key: localpart (e.g., "_tomori_lilya"), Value: the avatarUrl that was used when provisioned.
 * Avoids redundant display-name/avatar API calls within a single bot session.
 */
const provisionedIntents = new Map<string, { avatarUrl: string | null }>();

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Initialize the Matrix Appservice bridge from environment variables.
 * Silent no-op if any required credential is absent — bot starts without Matrix support.
 *
 * Required env vars:
 *   MATRIX_HOMESERVER_URL  — e.g., http://localhost:8448
 *   MATRIX_ACCESS_TOKEN    — as_token (appservice → homeserver auth)
 *   MATRIX_HS_TOKEN        — hs_token (homeserver → appservice auth)
 *   MATRIX_BOT_USER_ID     — e.g., @tomoribot:yourdomain.com
 *   MATRIX_SERVER_NAME     — domain portion, e.g., localhost or yourdomain.com
 *
 * @param discordClient - Discord.js client, forwarded to the event handler for channel lookups
 */
export async function initializeMatrixClient(discordClient: Client): Promise<void> {
	const homeserverUrl = process.env.MATRIX_HOMESERVER_URL;
	const asToken       = process.env.MATRIX_ACCESS_TOKEN; // appservice → homeserver
	const hsToken       = process.env.MATRIX_HS_TOKEN;     // homeserver → appservice
	const botUserId     = process.env.MATRIX_BOT_USER_ID;
	const serverName    = process.env.MATRIX_SERVER_NAME;

	// Silently skip initialization if any required credential is absent
	if (!homeserverUrl || !asToken || !hsToken || !botUserId || !serverName) {
		log.info("Matrix bridge: credentials not configured — bridge disabled");
		return;
	}

	const port = Number.parseInt(process.env.MATRIX_APPSERVICE_PORT || "9993", 10);

	try {
		// 1. Build the AppServiceRegistration from environment credentials
		const registration = AppServiceRegistration.fromObject({
			id:               "tomoribot-appservice",
			hs_token:         hsToken,
			as_token:         asToken,
			url:              `http://localhost:${port}`,
			sender_localpart: "tomoribot",
			namespaces: {
				// Exclusive: only this appservice may create/use @_tomori_*:serverName users
				users:   [{ exclusive: true, regex: `@_tomori_.*:${serverName}` }],
				aliases: [],
				rooms:   [],
			},
			rate_limited: false,
		});

		// 2. Create Bridge with onEvent controller
		//    disableStores: true  — we use PostgreSQL, not the built-in NeDB file stores
		//    disableContext: true — disableStores makes context lookups meaningless anyway
		matrixBridge = new Bridge({
			homeserverUrl,
			domain:         serverName,
			registration,
			disableStores:  true,
			disableContext: true,
			controller: {
				// onEvent is typed void (not Promise<void>) — fire-and-forget the async handler
				onEvent: (request: BridgeRequest<WeakEvent>): void => {
					void handleMatrixEvent(request, discordClient, botUserId).catch((error) => {
						log.warn("Matrix bridge: uncaught error in event handler", error);
					});
				},
				// Route bridge internal logs through our logger (errors only to reduce noise)
				onLog: (_text: string, isError: boolean): void => {
					if (isError) {
						log.warn(`[matrix-appservice-bridge] ${_text}`);
					}
				},
			},
		});

		// 3. Run the bridge: calls initialise() internally, then starts the HTTP server
		//    The homeserver will push events to http://localhost:{port}
		await matrixBridge.run(port);

		log.success(
			`Matrix appservice initialized — ${botUserId} @ ${homeserverUrl} (listening on port ${port})`,
		);
	} catch (error) {
		log.error("Matrix bridge: failed to initialize appservice", error as Error);
		matrixBridge = null;
	}
}

/**
 * Returns true if the Matrix bridge is configured and running.
 * Used as a fast "is Matrix enabled?" check in commands and event handlers.
 */
export function isMatrixConfigured(): boolean {
	return matrixBridge !== null;
}

/**
 * Join a Matrix room as the bot's own account.
 * Called by /server matrix link after persisting the DB link.
 *
 * @param roomId - The Matrix room ID to join (e.g., "!abc:matrix.org")
 */
export async function joinMatrixRoom(roomId: string): Promise<void> {
	if (!matrixBridge) return;

	// getIntent() with no args returns the bot account's Intent
	const botIntent = matrixBridge.getIntent();
	await botIntent.join(roomId);
}

/**
 * Get (and lazily provision) the Matrix Intent for a given persona virtual user.
 *
 * On first use per session (or when avatarUrl changes), the virtual user is:
 *   1. Registered on the homeserver (idempotent)
 *   2. Given the persona's display name
 *   3. Given the persona's avatar (uploaded from Discord CDN)
 *
 * Subsequent calls with the same avatarUrl return immediately from the in-memory cache.
 * The cache is session-scoped (cleared on bot restart), so avatar changes take effect
 * at the next restart.
 *
 * @param personaName - Display name for the virtual user (e.g., "Lilya")
 * @param avatarUrl   - CDN URL of the persona's avatar image, or null if none
 * @returns The provisioned Intent, or null if the bridge is not configured
 */
export async function getPersonaIntent(
	personaName: string,
	avatarUrl: string | null,
): Promise<Intent | null> {
	if (!matrixBridge) return null;

	const serverName = process.env.MATRIX_SERVER_NAME;
	if (!serverName) return null;

	// Build virtual user localpart: lowercase, only alphanumerics and underscores
	const localpart = `_tomori_${personaName.toLowerCase().replace(/[^a-z0-9_]/g, "_")}`;
	const userId    = `@${localpart}:${serverName}`;
	const intent    = matrixBridge.getIntent(userId);

	// Return cached intent if avatar URL is unchanged (no need to re-provision)
	const cached = provisionedIntents.get(localpart);
	if (cached && cached.avatarUrl === avatarUrl) {
		return intent;
	}

	// Optimistic cache write BEFORE the async provisioning chain.
	// This prevents a race condition where two messages for the same persona arrive
	// simultaneously: both would see cached=undefined and race through ensureRegistered()
	// / setDisplayName() / setAvatarUrl(). With the optimistic write, the second caller
	// hits the cache and returns early while the first is still awaiting.
	provisionedIntents.set(localpart, { avatarUrl });

	try {
		// 1. Register the virtual user (safe to call repeatedly — idempotent)
		await intent.ensureRegistered();

		// 2. Set the display name to the persona's nickname
		await intent.setDisplayName(personaName);

		// 3. Upload and set the avatar if an avatar URL is available
		if (avatarUrl) {
			const media = await downloadAvatar(avatarUrl);
			if (media) {
				// uploadContent returns the mxc:// URI directly as a string
				const mxcUri = await intent.uploadContent(media.buffer, {
					type: media.mimeType,
					name: "avatar.png",
				});
				await intent.setAvatarUrl(mxcUri);
			}
		}

		log.info(`Matrix appservice: provisioned virtual user ${userId}`);
	} catch (error) {
		// Roll back the optimistic entry so the next message retries provisioning
		provisionedIntents.delete(localpart);
		// Non-fatal: still return the intent so message sending can proceed
		log.warn(`Matrix appservice: failed to provision ${userId}`, error);
	}

	return intent;
}

/**
 * Send a plain-text message to a Matrix room as the given persona virtual user.
 * Falls back to the bot's own account if no persona intent can be resolved.
 * Silent no-op if the Matrix bridge is not configured.
 *
 * @param roomId      - The Matrix room ID (e.g., "!abc:matrix.org")
 * @param text        - The message content to send
 * @param personaName - Optional persona name; resolves a virtual user Intent when provided
 * @param avatarUrl   - Optional avatar URL for the persona's virtual user
 */
export async function sendToMatrixRoom(
	roomId: string,
	text: string,
	personaName?: string,
	avatarUrl?: string | null,
): Promise<void> {
	if (!matrixBridge) return;

	try {
		// Resolve the correct Intent: persona virtual user if available, else bot account
		const intent = personaName
			? (await getPersonaIntent(personaName, avatarUrl ?? null)) ?? matrixBridge.getIntent()
			: matrixBridge.getIntent();

		// sendText() auto-joins the room if the virtual user is not yet a member
		await intent.sendText(roomId, text);
	} catch (error) {
		log.warn(`Matrix bridge: failed to send message to room ${roomId}`, error);
	}
}

/**
 * Upload a file to Matrix and send it as a media event in the given room.
 * Uses m.image for images, m.video for video, m.file for everything else.
 * Silent no-op if the Matrix bridge is not configured.
 *
 * @param roomId      - The Matrix room ID (e.g., "!abc:matrix.org")
 * @param data        - Raw file bytes as an ArrayBuffer
 * @param filename    - Original filename (used as the event body)
 * @param mimeType    - MIME type string (e.g., "image/png")
 * @param size        - File size in bytes (included in the event info block)
 * @param personaName - Optional persona name for virtual user routing
 * @param avatarUrl   - Optional avatar URL for the persona's virtual user
 */
export async function sendAttachmentToMatrixRoom(
	roomId: string,
	data: ArrayBuffer,
	filename: string,
	mimeType: string,
	size: number,
	personaName?: string,
	avatarUrl?: string | null,
): Promise<void> {
	if (!matrixBridge) return;

	try {
		const intent = personaName
			? (await getPersonaIntent(personaName, avatarUrl ?? null)) ?? matrixBridge.getIntent()
			: matrixBridge.getIntent();

		// 1. Upload the file bytes to the homeserver's media repository
		const buffer = Buffer.from(data);
		const mxcUri = await intent.uploadContent(buffer, {
			type: mimeType,
			name: filename,
		});

		const info = { mimetype: mimeType, size };

		// 2. Send the appropriate media event type based on MIME type
		if (mimeType.startsWith("image/")) {
			await intent.sendMessage(roomId, {
				msgtype: "m.image",
				body:    filename,
				url:     mxcUri,
				info,
			});
		} else {
			const msgtype = mimeType.startsWith("video/") ? "m.video" : "m.file";
			await intent.sendMessage(roomId, {
				msgtype,
				body: filename,
				url:  mxcUri,
				info,
			});
		}
	} catch (error) {
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

	if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
		return cached.roomId;
	}

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

	if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
		return cached.channelDiscId;
	}

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
 * @param channelDiscId - The Discord channel ID whose cache entry to clear
 * @param matrixRoomId  - Optional: the Matrix room ID whose cache entry to also clear
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
 * Convert an mxc:// URI to an authenticated HTTP download URL.
 * Format: {homeserverUrl}/_matrix/media/v3/download/{serverHost}/{mediaId}
 * Returns null if the URI format is invalid.
 *
 * @param mxcUrl        - The mxc:// media URI from the Matrix event content
 * @param homeserverUrl - The homeserver base URL used to resolve the HTTP download URL
 */
function mxcToHttp(mxcUrl: string, homeserverUrl: string): string | null {
	const match = mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
	if (!match) return null;
	const [, serverHost, mediaId] = match;
	return `${homeserverUrl}/_matrix/media/v3/download/${serverHost}/${mediaId}`;
}

/**
 * Fetch an avatar image from a CDN URL (e.g., Discord's media proxy).
 * Returns null on any error — avatar provisioning is non-critical.
 *
 * @param url - The HTTP(S) URL of the avatar image to download
 * @returns `{ buffer, mimeType }` on success, null on failure
 */
async function downloadAvatar(
	url: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(MATRIX_MEDIA_TIMEOUT_MS),
		});
		if (!response.ok) {
			log.warn(`Matrix appservice: avatar fetch failed (${response.status}) for ${url}`);
			return null;
		}
		const arrayBuffer = await response.arrayBuffer();
		const mimeType    = response.headers.get("content-type") ?? "image/png";
		return { buffer: Buffer.from(arrayBuffer), mimeType };
	} catch (error) {
		log.warn(`Matrix appservice: failed to download avatar from ${url}`, error);
		return null;
	}
}

/**
 * Download a Matrix media file identified by an mxc:// URL.
 * Returns null and logs a warning on any failure (network, size limit, etc.).
 *
 * @param mxcUrl        - The mxc:// media URL from the Matrix event content
 * @param homeserverUrl - The homeserver base URL to resolve the HTTP download URL
 * @param asToken       - The appservice token for authenticated media (MSC3916)
 * @param knownSize     - Optional pre-flight size from the event's info.size field
 * @returns `{ buffer, mimeType }` on success, null on failure
 */
async function downloadMatrixMedia(
	mxcUrl: string,
	homeserverUrl: string,
	asToken: string,
	knownSize?: number,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
	// 1. Pre-flight size guard: reject oversized files before fetching
	if (knownSize !== undefined && knownSize > MATRIX_MAX_ATTACHMENT_BYTES) {
		return null;
	}

	// 2. Convert mxc:// URI to an HTTP(S) download URL
	const httpUrl = mxcToHttp(mxcUrl, homeserverUrl);
	if (!httpUrl) {
		log.warn(`Matrix bridge: could not resolve mxc URL: ${mxcUrl}`);
		return null;
	}

	try {
		// 3. Fetch with auth header and timeout (MSC3916 authenticated media)
		const response = await fetch(httpUrl, {
			headers: { Authorization: `Bearer ${asToken}` },
			signal:  AbortSignal.timeout(MATRIX_MEDIA_TIMEOUT_MS),
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

		// 5. Buffer the response body and final size guard
		const arrayBuffer = await response.arrayBuffer();
		const buffer      = Buffer.from(arrayBuffer);
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
 * Handles the Matrix /refresh command.
 * Posts the standard refresh embed to the Discord channel (triggering history reset)
 * and clears the short-term memory cache for the channel.
 *
 * The embed title matches `commands.tool.refresh.title` — the exact marker that
 * checkTargetEmbedTitle() in tomoriChat.ts detects as a conversation reset point.
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

	// 2. Build the refresh embed using en-US locale as the canonical reset marker
	const embed = new EmbedBuilder()
		.setTitle(localizer("en-US", "commands.tool.refresh.title"))
		.setDescription(localizer("en-US", "commands.tool.refresh.response"))
		.setColor(ColorCode.SECTION);

	// 3. Send the embed (suppress notifications to avoid pinging everyone)
	await channel.send({
		embeds: [embed],
		flags:  MessageFlags.SuppressNotifications,
	});
}

/**
 * Handle an incoming Matrix event pushed by the homeserver.
 * Replaces the old RoomEvent.Timeline sync listener.
 * Relays Matrix messages to the linked Discord channel via webhook.
 *
 * Loop prevention:
 *   - Skip events sent by the bot account itself
 *   - Skip events sent by any @_tomori_* virtual persona user
 *
 * @param request       - The bridge request wrapping the raw Matrix event
 * @param discordClient - Discord.js client for channel/webhook resolution
 * @param botUserId     - The bot's Matrix user ID for loop prevention
 */
async function handleMatrixEvent(
	request: BridgeRequest<WeakEvent>,
	discordClient: Client,
	botUserId: string,
): Promise<void> {
	const event = request.getData();

	// 1. Only relay room message events
	if (event.type !== MATRIX_TEXT_MSG_TYPE) return;

	// 2. Loop prevention: ignore messages from the bot account or any persona virtual user.
	//    The domain suffix check prevents a remote user named @_tomori_*:evil.org from
	//    accidentally (or maliciously) matching our appservice's virtual user namespace.
	const serverName = process.env.MATRIX_SERVER_NAME ?? "";
	const isOwnVirtualUser =
		event.sender.startsWith("@_tomori_") && event.sender.endsWith(`:${serverName}`);
	if (event.sender === botUserId || isOwnVirtualUser) return;

	// 3. Look up the linked Discord channel (cached DB query)
	const channelDiscId = await getDiscordChannelForRoom(event.room_id);
	if (!channelDiscId) return;

	// 4. Fetch the Discord channel
	const channel = await discordClient.channels.fetch(channelDiscId).catch(() => null);
	if (!channel?.isTextBased() || channel.isDMBased()) return;

	// 5. Build the webhook username from the sender's Matrix ID
	//    Format: "[Matrix|@user:host] localpart" (max 80 chars per Discord webhook limit)
	const senderLocalpart = event.sender.split(":")[0].replace("@", "");
	const rawUsername     = `[Matrix|${event.sender}] ${senderLocalpart}`;
	const username        = rawUsername.length > 80
		? `${rawUsername.slice(0, 77)}...`
		: rawUsername;

	// 6. Extract content fields
	const content  = event.content;
	const msgtype  = (content.msgtype as string | undefined) ?? "m.text";
	const bodyText = (content.body as string | undefined)?.trim();

	// 7. Branch on msgtype: relay media events as Discord file attachments
	const isMediaMsg =
		msgtype === "m.image" ||
		msgtype === "m.video" ||
		msgtype === "m.file"  ||
		msgtype === "m.audio";

	if (isMediaMsg) {
		const { webhook: mediaWebhook } = await getOrCreateWebhook(channel as BaseGuildTextChannel);
		if (!mediaWebhook) return;

		const mxcUrl    = content.url as string | undefined;
		const info      = content.info as Record<string, unknown> | undefined;
		const knownSize = typeof info?.size === "number" ? info.size : undefined;
		const filename  = bodyText ?? "attachment";

		// 7a. Reject oversized attachments with a text notice
		if (knownSize !== undefined && knownSize > MATRIX_MAX_ATTACHMENT_BYTES) {
			const sizeMb = (knownSize / (1024 * 1024)).toFixed(1);
			await mediaWebhook.send({
				content:         `[Matrix: attachment too large to relay (${sizeMb} MB)]`,
				username,
				allowedMentions: { parse: [] },
			});
			return;
		}

		// 7b. Attempt to download and relay the media file
		if (mxcUrl) {
			const homeserverUrl = process.env.MATRIX_HOMESERVER_URL ?? "";
			const asToken       = process.env.MATRIX_ACCESS_TOKEN   ?? "";
			const media = await downloadMatrixMedia(mxcUrl, homeserverUrl, asToken, knownSize);

			if (media) {
				await mediaWebhook.send({
					files:           [{ attachment: media.buffer, name: filename }],
					username,
					allowedMentions: { parse: [] },
				});
				return;
			}
		}

		// 7c. Fallback: media unavailable
		await mediaWebhook.send({
			content:         `[Matrix: attachment unavailable — ${filename}]`,
			username,
			allowedMentions: { parse: [] },
		});
		return;
	}

	// 8. Skip m.notice (bot/system automated messages) to prevent relay loops
	if (msgtype === "m.notice") return;

	if (!bodyText) return;

	// 9. Special command: /refresh — trigger conversation history reset in Discord
	if (bodyText === "/refresh") {
		await handleMatrixRefresh(channel as BaseGuildTextChannel, channelDiscId);
		return;
	}

	// 10. Relay as text via Discord webhook.
	//     m.emote (/me actions) are prefixed with "* " to match IRC/Matrix convention —
	//     e.g., Matrix: /me waves → Discord: "* waves" (webhook username provides the name context)
	const relayContent = msgtype === "m.emote" ? `* ${bodyText}` : bodyText;

	const { webhook } = await getOrCreateWebhook(channel as BaseGuildTextChannel);
	if (!webhook) return;

	await webhook.send({
		content:         relayContent,
		username,
		allowedMentions: { parse: [] }, // Prevent accidental Discord @mentions from Matrix text
	});
}
