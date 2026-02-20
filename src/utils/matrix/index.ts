/**
 * Matrix utilities barrel export.
 * Import from "@/utils/matrix" to access all Matrix bridge utilities.
 */

export { isMatrixUserId } from "./isMatrixUserId";
export {
	initializeMatrixClient,
	getMatrixClient,
	sendToMatrixRoom,
	getLinkedMatrixRoom,
	getDiscordChannelForRoom,
	invalidateMatrixLinkCache,
} from "./matrixManager";
