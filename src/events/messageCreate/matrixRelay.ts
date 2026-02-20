/**
 * Matrix Relay Handler
 * Auto-discovered by eventHandler.ts via messageCreate folder scanning.
 *
 * Relays TomoriBot's own messages (main persona + alter persona webhooks) to
 * the linked Matrix room, if one exists for the channel.
 *
 * Exit conditions (checked first to minimize overhead):
 *   1. Matrix client not configured → immediate return
 *   2. Message not from this server (no guild)
 *   3. Message is NOT from TomoriBot itself (checked via isSelfTriggerMessage)
 *   4. Channel has no linked Matrix room
 */

import type { Client, Message } from "discord.js";
import { getCachedAllPersonas } from "@/utils/cache/tomoriStateCache";
import { isSelfTriggerMessage } from "./tomoriChat";
import {
	getMatrixClient,
	getLinkedMatrixRoom,
	sendToMatrixRoom,
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
	if (!getMatrixClient()) return;

	// 2. Only process guild messages (Matrix bridge is server-scoped)
	if (!message.guild) return;

	// 3. Only relay messages that originate from TomoriBot itself
	//    (main persona bot account OR alter persona webhook messages)
	const allPersonas: TomoriState[] = await getCachedAllPersonas(message.guild.id);
	if (!isSelfTriggerMessage(message, allPersonas)) return;

	// 4. Check if this channel has a linked Matrix room (cached DB lookup)
	const roomId = await getLinkedMatrixRoom(message.channelId);
	if (!roomId) return;

	// 5. Determine which persona sent this message for proper formatting in Matrix
	let personaName: string;

	if (message.author.id === client.user?.id) {
		// Main bot account — find the main (non-alter) persona name
		personaName =
			allPersonas.find((p) => !p.is_alter)?.tomori_nickname ??
			message.author.username;
	} else {
		// Alter persona webhook — match by username (case-insensitive)
		const authornameLower = message.author.username.toLowerCase();
		personaName =
			allPersonas.find(
				(p) => p.tomori_nickname?.toLowerCase() === authornameLower,
			)?.tomori_nickname ?? message.author.username;
	}

	// 6. Build Matrix message text
	let text = `**${personaName}:** ${message.content}`;

	// Append attachment placeholders so Matrix users know files were shared
	if (message.attachments.size > 0) {
		const attList = [...message.attachments.values()]
			.map((a) => `[Attachment: ${a.name ?? "file"}]`)
			.join(" ");
		text += ` ${attList}`;
	}

	// 7. Relay to Matrix (non-critical: errors are logged but don't disrupt Discord)
	try {
		await sendToMatrixRoom(roomId, text);
	} catch (error) {
		log.warn(
			`Matrix relay: failed to relay message to room ${roomId}`,
			error,
		);
	}
};

export default handler;
