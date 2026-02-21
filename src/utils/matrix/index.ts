/**
 * Matrix utilities barrel export.
 * Import from "@/utils/matrix" to access all Matrix bridge utilities.
 */

export { isMatrixUserId, normalizeMatrixUserId, stripMatrixWebhookPrefix } from "./isMatrixUserId";
export {
	initializeMatrixClient,
	isMatrixConfigured,
	joinMatrixRoom,
	sendToMatrixRoom,
	sendAttachmentToMatrixRoom,
	getLinkedMatrixRoom,
	getDiscordChannelForRoom,
	invalidateMatrixLinkCache,
	isRoomEncrypted,
	MATRIX_MAX_ATTACHMENT_BYTES,
	pendingMatrixReplyChannels,
	getMatrixIdForDisplayName,
	sendMatrixTypingIndicator,
} from "./matrixManager";
