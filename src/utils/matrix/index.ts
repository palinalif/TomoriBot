/**
 * Matrix utilities barrel export.
 * Import from "@/utils/matrix" to access all Matrix bridge utilities.
 */

export { isMatrixUserId, stripMatrixWebhookPrefix } from "./isMatrixUserId";
export {
	initializeMatrixClient,
	isMatrixConfigured,
	joinMatrixRoom,
	sendToMatrixRoom,
	sendAttachmentToMatrixRoom,
	getLinkedMatrixRoom,
	getDiscordChannelForRoom,
	invalidateMatrixLinkCache,
	MATRIX_MAX_ATTACHMENT_BYTES,
} from "./matrixManager";
