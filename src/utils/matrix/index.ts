/**
 * Matrix utilities barrel export.
 * Import from "@/utils/matrix" to access all Matrix bridge utilities.
 */

export { isMatrixUserId, stripMatrixWebhookPrefix } from "./isMatrixUserId";
export {
	initializeMatrixClient,
	getMatrixClient,
	sendToMatrixRoom,
	sendAttachmentToMatrixRoom,
	getLinkedMatrixRoom,
	getDiscordChannelForRoom,
	invalidateMatrixLinkCache,
} from "./matrixManager";
