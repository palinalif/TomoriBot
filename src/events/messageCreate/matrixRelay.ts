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

import type { Client, Message } from "discord.js";
import { getCachedAllPersonas } from "@/utils/cache/tomoriStateCache";
import { isSelfTriggerMessage } from "./tomoriChat";
import {
	isMatrixConfigured,
	getLinkedMatrixRoom,
	sendToMatrixRoom,
	sendAttachmentToMatrixRoom,
	MATRIX_MAX_ATTACHMENT_BYTES,
} from "@/utils/matrix";
import { log } from "@/utils/misc/logger";
import type { TomoriState } from "@/types/db/schema";

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

	if (message.author.id === client.user?.id) {
		// Main bot account — find the main (non-alter) persona
		persona = allPersonas.find((p) => !p.is_alter);
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
	}

	// Fall back to username and no avatar if no matching persona is found
	const personaName = persona?.tomori_nickname ?? message.author.username;
	// webhook_avatar_url holds the S3 CDN URL used for Discord persona avatars —
	// reused here as the source for the Matrix virtual user's avatar
	const avatarUrl   = persona?.webhook_avatar_url ?? null;

	// 6. Relay the text content (skip if empty after trim)
	//    Identity is conveyed by the virtual Matrix user — no bold prefix needed
	const text = message.content.trim();
	if (text) {
		try {
			await sendToMatrixRoom(roomId, text, personaName, avatarUrl);
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
};

export default handler;
