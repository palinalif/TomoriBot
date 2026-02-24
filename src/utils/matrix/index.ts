/**
 * Matrix appservice barrel export.
 * Import from "@/utils/matrix" for Matrix-specific bridge operations.
 * For generic bridge utilities (ID detection, webhook parsing), import from "@/utils/bridge".
 */

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
	resolveBridgeUserId,
	sendMatrixReminderMention,
} from "./matrixManager";
