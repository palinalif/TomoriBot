/**
 * Utility for detecting Matrix user IDs.
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
