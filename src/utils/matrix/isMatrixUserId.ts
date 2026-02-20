/**
 * Utility for detecting and parsing Matrix user IDs and webhook usernames.
 * Matrix user IDs follow the format: @localpart:homeserver
 * They are distinct from Discord snowflake IDs (purely numeric strings).
 */

/**
 * Returns true if the given string follows the Matrix user ID format.
 *
 * @param id - The string to test (e.g., "@alice:matrix.org" or "123456789012345678")
 * @returns true if the string matches @localpart:homeserver format
 */
export function isMatrixUserId(id: string): boolean {
	return /^@[^:]+:[^:]+/.test(id);
}

/**
 * Strips the Matrix bridge prefix from a webhook username.
 * Matrix bridge webhook usernames follow the format: "[Matrix|@user:host] DisplayName"
 * This function extracts just the human-readable display name portion.
 *
 * If the string is not a Matrix webhook username, it is returned unchanged.
 *
 * @param username - The raw username string (e.g., "[Matrix|@alice:matrix.org] Alice")
 * @returns The display name portion (e.g., "Alice"), or the original string if not a Matrix webhook username
 */
export function stripMatrixWebhookPrefix(username: string): string {
	if (!username.startsWith("[Matrix|")) return username;
	const bracketEnd = username.indexOf("]");
	if (bracketEnd === -1) return username;
	// Skip the closing bracket and the space after it ("] ")
	return username.slice(bracketEnd + 2);
}
