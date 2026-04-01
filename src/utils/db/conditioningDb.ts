import {
  conditioningHistorySchema,
  conditioningTypeSchema,
  personaConfigSchema,
  type ConditioningHistoryRow,
} from "@/types/db/schema";
import type { ConditioningType } from "@/types/db/schema";
import { sql } from "@/utils/db/client";
import { log } from "@/utils/misc/logger";
import {
  normalizeConditioningReason,
  normalizeConditioningReasonKey,
  type ConditioningActionKey,
} from "@/utils/conditioning/conditioning";

type ConditioningGroupRow = {
  conditioning_id: number;
  conditioning_type: ConditioningType;
  action_key: string;
  reason_text: string;
  reason_normalized: string;
  count: number;
  updated_at: Date;
  user_disc_id: string;
};

export type ConditioningGroup = {
  conditioningType: ConditioningType;
  actionKey: string;
  reasonText: string;
  reasonNormalized: string;
  totalCount: number;
  updatedAt: Date;
  userDiscIds: string[];
  conditioningIds: number[];
};

export async function recordConditioningEvent(params: {
  serverId: number;
  personaLineageId: number;
  conditioningType: ConditioningType;
  actionKey: ConditioningActionKey;
  userId: number;
  reason?: string | null;
}): Promise<ConditioningHistoryRow | null> {
  const reasonText = normalizeConditioningReason(params.reason);
  const reasonNormalized = normalizeConditioningReasonKey(params.reason);

  try {
    const [row] = await sql`
			INSERT INTO conditioning_history (
				server_id,
				persona_lineage_id,
				conditioning_type,
				action_key,
				reason_text,
				reason_normalized,
				user_id,
				count
			)
			VALUES (
				${params.serverId},
				${params.personaLineageId},
				${params.conditioningType},
				${params.actionKey},
				${reasonText},
				${reasonNormalized},
				${params.userId},
				1
			)
			ON CONFLICT (server_id, persona_lineage_id, conditioning_type, action_key, reason_normalized, user_id)
			DO UPDATE SET
				reason_text = EXCLUDED.reason_text,
				count = conditioning_history.count + 1,
				updated_at = CURRENT_TIMESTAMP
			RETURNING *
		`;

    const parsed = conditioningHistorySchema.safeParse(row);
    if (!parsed.success) {
      await log.error("Failed to validate conditioning history row after upsert", parsed.error, {
        serverId: params.serverId,
        userId: params.userId,
        errorType: "SchemaValidationError",
        metadata: {
          operation: "recordConditioningEvent",
          conditioningType: params.conditioningType,
          actionKey: params.actionKey,
        },
      });
      return null;
    }

    return parsed.data;
  } catch (error) {
    await log.error("Failed to record conditioning event", error, {
      serverId: params.serverId,
      userId: params.userId,
      errorType: "DatabaseInsertError",
      metadata: {
        operation: "recordConditioningEvent",
        conditioningType: params.conditioningType,
        actionKey: params.actionKey,
      },
    });
    return null;
  }
}

export async function setPersonaConditioningEnabled(
  tomoriId: number,
  conditioningType: ConditioningType,
  enabled: boolean,
): Promise<boolean> {
  const column = conditioningType === "reward" ? "reward_conditioning_enabled" : "punish_conditioning_enabled";

  try {
    const [row] =
      column === "reward_conditioning_enabled"
        ? await sql`
				INSERT INTO persona_configs (tomori_id, reward_conditioning_enabled)
				VALUES (${tomoriId}, ${enabled})
				ON CONFLICT (tomori_id)
				DO UPDATE SET reward_conditioning_enabled = EXCLUDED.reward_conditioning_enabled, updated_at = CURRENT_TIMESTAMP
				RETURNING *
			`
        : await sql`
				INSERT INTO persona_configs (tomori_id, punish_conditioning_enabled)
				VALUES (${tomoriId}, ${enabled})
				ON CONFLICT (tomori_id)
				DO UPDATE SET punish_conditioning_enabled = EXCLUDED.punish_conditioning_enabled, updated_at = CURRENT_TIMESTAMP
				RETURNING *
			`;

    const parsed = personaConfigSchema.safeParse(row);
    if (!parsed.success) {
      await log.error("Failed to validate persona conditioning toggle update", parsed.error, {
        tomoriId,
        errorType: "SchemaValidationError",
        metadata: {
          operation: "setPersonaConditioningEnabled",
          conditioningType,
          enabled,
        },
      });
      return false;
    }

    return true;
  } catch (error) {
    await log.error("Failed to update persona conditioning toggle", error, {
      tomoriId,
      errorType: "DatabaseUpdateError",
      metadata: {
        operation: "setPersonaConditioningEnabled",
        conditioningType,
        enabled,
      },
    });
    return false;
  }
}

export async function setServerConditioningEnabled(
  serverId: number,
  conditioningType: ConditioningType,
  enabled: boolean,
): Promise<number> {
  const column = conditioningType === "reward" ? "reward_conditioning_enabled" : "punish_conditioning_enabled";

  try {
    const updatedRows =
      column === "reward_conditioning_enabled"
        ? await sql<Array<{ tomori_id: number }>>`
				INSERT INTO persona_configs (tomori_id, reward_conditioning_enabled)
				SELECT tomori_id, ${enabled}
				FROM tomoris
				WHERE server_id = ${serverId}
				ON CONFLICT (tomori_id)
				DO UPDATE SET
					reward_conditioning_enabled = EXCLUDED.reward_conditioning_enabled,
					updated_at = CURRENT_TIMESTAMP
				RETURNING tomori_id
			`
        : await sql<Array<{ tomori_id: number }>>`
				INSERT INTO persona_configs (tomori_id, punish_conditioning_enabled)
				SELECT tomori_id, ${enabled}
				FROM tomoris
				WHERE server_id = ${serverId}
				ON CONFLICT (tomori_id)
				DO UPDATE SET
					punish_conditioning_enabled = EXCLUDED.punish_conditioning_enabled,
					updated_at = CURRENT_TIMESTAMP
				RETURNING tomori_id
			`;

    return updatedRows.length;
  } catch (error) {
    await log.error("Failed to update server-wide conditioning toggle", error, {
      serverId,
      errorType: "DatabaseUpdateError",
      metadata: {
        operation: "setServerConditioningEnabled",
        conditioningType,
        enabled,
      },
    });
    return 0;
  }
}

export async function loadConditioningGroupsForPersona(
  serverId: number,
  personaLineageId: number,
  conditioningType?: ConditioningType,
): Promise<ConditioningGroup[]> {
  try {
    const rows =
      conditioningType === undefined
        ? await sql<Array<ConditioningGroupRow>>`
				SELECT
					ch.conditioning_id,
					ch.conditioning_type,
					ch.action_key,
					ch.reason_text,
					ch.reason_normalized,
					ch.count,
					ch.updated_at,
					u.user_disc_id
				FROM conditioning_history ch
				JOIN users u ON u.user_id = ch.user_id
				WHERE ch.server_id = ${serverId}
				  AND ch.persona_lineage_id = ${personaLineageId}
				ORDER BY ch.updated_at DESC, ch.conditioning_id DESC
			`
        : await sql<Array<ConditioningGroupRow>>`
				SELECT
					ch.conditioning_id,
					ch.conditioning_type,
					ch.action_key,
					ch.reason_text,
					ch.reason_normalized,
					ch.count,
					ch.updated_at,
					u.user_disc_id
				FROM conditioning_history ch
				JOIN users u ON u.user_id = ch.user_id
				WHERE ch.server_id = ${serverId}
				  AND ch.persona_lineage_id = ${personaLineageId}
				  AND ch.conditioning_type = ${conditioningType}
				ORDER BY ch.updated_at DESC, ch.conditioning_id DESC
			`;

    const groups = new Map<string, ConditioningGroup>();

    for (const row of rows) {
      const parsedType = conditioningTypeSchema.safeParse(row.conditioning_type);
      if (!parsedType.success) {
        log.warn(`Skipping conditioning row with invalid type for server ${serverId}`);
        continue;
      }

      const key = `${parsedType.data}:${row.action_key}:${row.reason_normalized}`;
      const existing = groups.get(key);

      if (!existing) {
        groups.set(key, {
          conditioningType: parsedType.data,
          actionKey: row.action_key,
          reasonText: row.reason_text,
          reasonNormalized: row.reason_normalized,
          totalCount: row.count,
          updatedAt: row.updated_at,
          userDiscIds: [row.user_disc_id],
          conditioningIds: [row.conditioning_id],
        });
        continue;
      }

      existing.totalCount += row.count;
      existing.conditioningIds.push(row.conditioning_id);
      if (!existing.userDiscIds.includes(row.user_disc_id)) {
        existing.userDiscIds.push(row.user_disc_id);
      }
      if (row.updated_at > existing.updatedAt) {
        existing.updatedAt = row.updated_at;
        existing.reasonText = row.reason_text;
      }
    }

    return Array.from(groups.values()).sort((a, b) => {
      const timestampDiff = b.updatedAt.getTime() - a.updatedAt.getTime();
      if (timestampDiff !== 0) return timestampDiff;
      return b.totalCount - a.totalCount;
    });
  } catch (error) {
    await log.error("Failed to load conditioning groups", error, {
      serverId,
      errorType: "DatabaseReadError",
      metadata: {
        operation: "loadConditioningGroupsForPersona",
        personaLineageId,
        conditioningType,
      },
    });
    return [];
  }
}

export async function deleteConditioningGroupsForPersona(
  serverId: number,
  personaLineageId: number,
  conditioningType: ConditioningType,
  groups: Array<Pick<ConditioningGroup, "actionKey" | "reasonNormalized">>,
): Promise<number> {
  if (groups.length === 0) return 0;

  try {
    let deletedCount = 0;

    await sql.transaction(async (tx) => {
      for (const group of groups) {
        const deletedRows = await tx<Array<{ conditioning_id: number }>>`
					DELETE FROM conditioning_history
					WHERE server_id = ${serverId}
					  AND persona_lineage_id = ${personaLineageId}
					  AND conditioning_type = ${conditioningType}
					  AND action_key = ${group.actionKey}
					  AND reason_normalized = ${group.reasonNormalized}
					RETURNING conditioning_id
				`;
        deletedCount += deletedRows.length;
      }
    });

    return deletedCount;
  } catch (error) {
    await log.error("Failed to delete conditioning groups", error, {
      serverId,
      errorType: "DatabaseDeleteError",
      metadata: {
        operation: "deleteConditioningGroupsForPersona",
        personaLineageId,
        conditioningType,
        groupCount: groups.length,
      },
    });
    return 0;
  }
}
