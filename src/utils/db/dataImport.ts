import { sql } from "@/utils/db/client";
import { log } from "../misc/logger";
import {
	EXPORT_VERSION,
	getPersonalExportSchema,
	getServerExportSchema,
	type PersonalExportData,
	type ServerExportData,
	type ImportResult,
} from "../../types/db/dataExport";
import { validateMemoryContent } from "./memoryLimits";
import { validateTomoriConfigFields } from "./sqlSecurity";

/**
 * Imports personal user data, replacing existing personal memories
 * @param userDiscId - Discord user ID to import data for
 * @param importData - The validated personal export data to import
 * @param personaLineageId - Persona lineage namespace to import memories into
 * @returns ImportResult indicating success or failure
 */
export async function importPersonalData(
	userDiscId: string,
	importData: PersonalExportData,
	personaLineageId = 0,
): Promise<ImportResult> {
	try {
		// 1. Validate memory content length for each memory
		for (const memory of importData.personal_memories) {
			const validation = validateMemoryContent(memory);
			if (!validation.isValid) {
				return {
					success: false,
					error: `commands.data.import.error_invalid_memory|${validation.error}`,
				};
			}
		}

		// 2. Ensure user row exists / update profile fields
		const updateResult = await sql`
			INSERT INTO users (
				user_disc_id,
				user_nickname,
				language_pref
			) VALUES (
				${userDiscId},
				${importData.user_nickname},
				${importData.language_pref}
			)
			ON CONFLICT (user_disc_id) DO UPDATE
			SET
				user_nickname = EXCLUDED.user_nickname,
				language_pref = EXCLUDED.language_pref
			RETURNING user_id
		`;

		if (!updateResult.length) {
			return {
				success: false,
				error: "commands.data.import.error_update_failed",
			};
		}

		const targetUserId = updateResult[0].user_id;

		// 3. Replace memories only in the selected lineage namespace
		await sql`
			DELETE FROM personal_memories
			WHERE user_id = ${targetUserId}
			  AND persona_lineage_id = ${personaLineageId}
		`;

		for (const memory of importData.personal_memories) {
			await sql`
				INSERT INTO personal_memories (user_id, persona_lineage_id, content)
				VALUES (${targetUserId}, ${personaLineageId}, ${memory})
			`;
		}

		return {
			success: true,
			itemsImported: {
				memoriesCount: importData.personal_memories.length,
			},
		};
	} catch (error) {
		log.error(`Error importing personal data for user ${userDiscId}:`, error);
		return {
			success: false,
			error: "commands.data.import.error_import_failed",
		};
	}
}

/**
 * Imports server data, replacing configuration and server memories
 * @param serverDiscId - Discord server ID to import data for
 * @param importData - The validated server export data to import
 * @param tomoriId - Optional persona ID to import server memories into
 * @returns ImportResult indicating success or failure
 */
export async function importServerData(
	serverDiscId: string,
	importData: ServerExportData,
	tomoriId?: number,
): Promise<ImportResult> {
	try {
		// 1. Get internal server ID and resolve target persona
		const serverRows = await sql`
			SELECT s.server_id
			FROM servers s
			WHERE s.server_disc_id = ${serverDiscId}
			LIMIT 1
		`;

		if (!serverRows.length) {
			return {
				success: false,
				error: "commands.data.import.error_no_server_data",
			};
		}

		const serverId = serverRows[0].server_id;
		let targetTomoriId = tomoriId;
		if (!targetTomoriId) {
			const mainPersonaRows = await sql`
				SELECT tomori_id
				FROM tomoris
				WHERE server_id = ${serverId}
				  AND is_alter = false
				ORDER BY updated_at DESC NULLS LAST, tomori_id DESC
				LIMIT 1
			`;
			targetTomoriId = mainPersonaRows[0]?.tomori_id;
		}

		// 2. Validate all server memories
		for (const memory of importData.server_memories) {
			const validation = validateMemoryContent(memory);
			if (!validation.isValid) {
				return {
					success: false,
					error: `commands.data.import.error_invalid_server_memory|${validation.error}`,
				};
			}
		}

		// 3. Validate config field names for security
		const configFields = Object.keys(importData.config);
		try {
			validateTomoriConfigFields(configFields);
		} catch (error) {
			log.error("Config field validation failed during import:", error);
			return {
				success: false,
				error: "commands.data.import.error_invalid_config",
			};
		}

		// 4. Update tomori configuration
		await sql`
			UPDATE tomori_configs
			SET
				llm_temperature = ${importData.config.llm_temperature},
				humanizer_degree = ${importData.config.humanizer_degree},
				timezone_offset = ${importData.config.timezone_offset},
				server_memteaching_enabled = ${importData.config.server_memteaching_enabled},
				attribute_memteaching_enabled = ${importData.config.attribute_memteaching_enabled},
				sampledialogue_memteaching_enabled = ${importData.config.sampledialogue_memteaching_enabled},
				self_teaching_enabled = ${importData.config.self_teaching_enabled},
				web_search_enabled = ${importData.config.web_search_enabled},
				personal_memories_enabled = ${importData.config.personal_memories_enabled},
				emoji_usage_enabled = ${importData.config.emoji_usage_enabled},
				sticker_usage_enabled = ${importData.config.sticker_usage_enabled},
				imagegen_enabled = ${importData.config.imagegen_enabled}
			WHERE server_id = ${serverId}
		`;

		// 5. Replace server memories
		await replaceServerMemories(
			serverId,
			importData.server_memories,
			targetTomoriId,
		);

		return {
			success: true,
			itemsImported: {
				memoriesCount: importData.server_memories.length,
				configFieldsCount: configFields.length,
			},
		};
	} catch (error) {
		log.error(`Error importing server data for server ${serverDiscId}:`, error);
		return {
			success: false,
			error: "commands.data.import.error_import_failed",
		};
	}
}

/**
 * Replaces all server memories for a given server
 * Deletes existing memories and inserts new ones
 * @param serverId - Internal server ID
 * @param memories - Array of memory content strings to insert
 */
async function replaceServerMemories(
	serverId: number,
	memories: string[],
	tomoriId?: number,
): Promise<void> {
	// 1. Delete all existing server memories for target persona scope
	if (tomoriId) {
		const [targetPersonaMeta] = await sql<Array<{ is_alter: boolean }>>`
			SELECT is_alter
			FROM tomoris
			WHERE tomori_id = ${tomoriId}
			  AND server_id = ${serverId}
			LIMIT 1
		`;
		const includeLegacyFallback = targetPersonaMeta?.is_alter !== true;
		if (includeLegacyFallback) {
			await sql`
				DELETE FROM server_memories
				WHERE server_id = ${serverId}
				  AND (
					tomori_id = ${tomoriId}
					OR tomori_id IS NULL
				  )
			`;
		} else {
			await sql`
				DELETE FROM server_memories
				WHERE server_id = ${serverId}
				  AND tomori_id = ${tomoriId}
			`;
		}
	} else {
		await sql`
			DELETE FROM server_memories
			WHERE server_id = ${serverId}
		`;
	}

	// 2. Insert new server memories if any exist
	if (memories.length === 0) {
		return; // No memories to insert
	}

	// 3. Get a user ID to attribute the memories to (use the first user we find for this server)
	// This is required by the schema but not semantically important for imported data
	const userRows = await sql`
		SELECT u.user_id
		FROM users u
		LIMIT 1
	`;

	if (!userRows.length) {
		throw new Error("commands.data.import.error_no_users");
	}

	const userId = userRows[0].user_id;

	// 4. Insert all new memories
	for (const content of memories) {
		await sql`
			INSERT INTO server_memories (server_id, tomori_id, user_id, content)
			VALUES (${serverId}, ${tomoriId ?? null}, ${userId}, ${content})
		`;
	}

	log.info(
		`Replaced ${memories.length} server memories for server_id ${serverId}`,
	);
}

/**
 * Validates and parses an import file
 * @param jsonData - The parsed JSON data from the import file
 * @returns Validation result with parsed data or error message
 */
export function validateImportFile(jsonData: unknown): {
	valid: boolean;
	type?: "personal" | "server";
	data?: PersonalExportData | ServerExportData;
	error?: string;
} {
	// 1. Check if data is an object
	if (typeof jsonData !== "object" || jsonData === null) {
		return {
			valid: false,
			error: "commands.data.import.error_not_json",
		};
	}

	// 2. Check version compatibility
	const version = (jsonData as { version?: string }).version;
	if (version !== EXPORT_VERSION) {
		return {
			valid: false,
			error: `commands.data.import.error_incompatible_version|${EXPORT_VERSION}|${version || "unknown"}`,
		};
	}

	// 3. Determine type and validate accordingly
	const type = (jsonData as { type?: string }).type;

	if (type === "personal") {
		const validated = getPersonalExportSchema().safeParse(jsonData);
		if (!validated.success) {
			log.error("Personal import validation failed:", validated.error);
			return {
				valid: false,
				error: "commands.data.import.error_invalid_personal_format",
			};
		}
		return {
			valid: true,
			type: "personal",
			data: validated.data.data,
		};
	}

	if (type === "server") {
		const validated = getServerExportSchema().safeParse(jsonData);
		if (!validated.success) {
			log.error("Server import validation failed:", validated.error);
			return {
				valid: false,
				error: "commands.data.import.error_invalid_server_format",
			};
		}
		return {
			valid: true,
			type: "server",
			data: validated.data.data,
		};
	}

	return {
		valid: false,
		error: `commands.data.import.error_unknown_type|${type}`,
	};
}
