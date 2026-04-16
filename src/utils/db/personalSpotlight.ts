import { sql } from "@/utils/db/client";

type PersonalSpotlightAggregateRow = {
  server_id: number | string | bigint;
  user_id: number | string | bigint;
  channel_disc_id: string;
  auto_trigger_tomori_id: number | string | bigint | null;
  expires_at: Date | string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  persona_ids: Array<number | string | bigint> | null;
};

export interface PersonalSpotlightStatus {
  serverId: number;
  userId: number;
  channelDiscId: string;
  personaIds: number[];
  autoTriggerPersonaId: number | null;
  expiresAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

function normalizeNumber(value: number | string | bigint | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

function normalizeNumberArray(values: Array<number | string | bigint> | null | undefined): number[] {
  const normalized =
    values?.map((value) => normalizeNumber(value)).filter((value): value is number => value !== null && value > 0) ??
    [];

  return [...new Set(normalized)].sort((left, right) => left - right);
}

function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapAggregateRow(row: PersonalSpotlightAggregateRow): PersonalSpotlightStatus | null {
  const serverId = normalizeNumber(row.server_id);
  const userId = normalizeNumber(row.user_id);

  if (!serverId || !userId || !row.channel_disc_id) {
    return null;
  }

  return {
    serverId,
    userId,
    channelDiscId: row.channel_disc_id,
    personaIds: normalizeNumberArray(row.persona_ids),
    autoTriggerPersonaId: normalizeNumber(row.auto_trigger_tomori_id),
    expiresAt: normalizeDate(row.expires_at),
    createdAt: normalizeDate(row.created_at),
    updatedAt: normalizeDate(row.updated_at),
  };
}

async function deleteExpiredPersonalSpotlights(
  serverId: number,
  userId: number,
  channelDiscId?: string,
): Promise<void> {
  if (channelDiscId) {
    await sql`
      DELETE FROM personal_spotlights
      WHERE server_id = ${serverId}
        AND user_id = ${userId}
        AND channel_disc_id = ${channelDiscId}
        AND expires_at IS NOT NULL
        AND expires_at <= CURRENT_TIMESTAMP
    `;
    return;
  }

  await sql`
    DELETE FROM personal_spotlights
    WHERE server_id = ${serverId}
      AND user_id = ${userId}
      AND expires_at IS NOT NULL
      AND expires_at <= CURRENT_TIMESTAMP
  `;
}

export async function replacePersonalSpotlight(
  serverId: number,
  userId: number,
  channelDiscId: string,
  personaIds: number[],
  autoTriggerPersonaId: number | null,
  expiresAt: Date | null,
): Promise<void> {
  const uniquePersonaIds = [...new Set(personaIds)].filter((personaId) => Number.isInteger(personaId) && personaId > 0);

  if (uniquePersonaIds.length === 0) {
    throw new Error("Personal spotlight requires at least one persona");
  }

  if (autoTriggerPersonaId !== null && !uniquePersonaIds.includes(autoTriggerPersonaId)) {
    throw new Error("Auto-trigger persona must belong to the spotlight persona set");
  }

  await sql.transaction(async (tx) => {
    await tx`
      INSERT INTO personal_spotlights (
        server_id,
        user_id,
        channel_disc_id,
        auto_trigger_tomori_id,
        expires_at
      )
      VALUES (
        ${serverId},
        ${userId},
        ${channelDiscId},
        ${autoTriggerPersonaId},
        ${expiresAt}
      )
      ON CONFLICT (server_id, user_id, channel_disc_id)
      DO UPDATE SET
        auto_trigger_tomori_id = EXCLUDED.auto_trigger_tomori_id,
        expires_at = EXCLUDED.expires_at,
        updated_at = CURRENT_TIMESTAMP
    `;

    await tx`
      DELETE FROM personal_spotlight_personas
      WHERE server_id = ${serverId}
        AND user_id = ${userId}
        AND channel_disc_id = ${channelDiscId}
    `;

    for (const personaId of uniquePersonaIds) {
      await tx`
        INSERT INTO personal_spotlight_personas (
          server_id,
          user_id,
          channel_disc_id,
          tomori_id
        )
        VALUES (
          ${serverId},
          ${userId},
          ${channelDiscId},
          ${personaId}
        )
      `;
    }
  });
}

export async function removePersonalSpotlight(
  serverId: number,
  userId: number,
  channelDiscId: string,
): Promise<boolean> {
  const result = await sql`
    DELETE FROM personal_spotlights
    WHERE server_id = ${serverId}
      AND user_id = ${userId}
      AND channel_disc_id = ${channelDiscId}
  `;

  return result.count > 0;
}

export async function getPersonalSpotlightStatus(
  serverId: number,
  userId: number,
  channelDiscId: string,
): Promise<PersonalSpotlightStatus | null> {
  await deleteExpiredPersonalSpotlights(serverId, userId, channelDiscId);

  const [row] = await sql<PersonalSpotlightAggregateRow[]>`
    SELECT
      ps.server_id,
      ps.user_id,
      ps.channel_disc_id,
      ps.auto_trigger_tomori_id,
      ps.expires_at,
      ps.created_at,
      ps.updated_at,
      COALESCE(
        ARRAY_AGG(psp.tomori_id ORDER BY psp.tomori_id) FILTER (WHERE psp.tomori_id IS NOT NULL),
        ARRAY[]::INT[]
      ) AS persona_ids
    FROM personal_spotlights ps
    LEFT JOIN personal_spotlight_personas psp
      ON psp.server_id = ps.server_id
      AND psp.user_id = ps.user_id
      AND psp.channel_disc_id = ps.channel_disc_id
    WHERE ps.server_id = ${serverId}
      AND ps.user_id = ${userId}
      AND ps.channel_disc_id = ${channelDiscId}
    GROUP BY
      ps.server_id,
      ps.user_id,
      ps.channel_disc_id,
      ps.auto_trigger_tomori_id,
      ps.expires_at,
      ps.created_at,
      ps.updated_at
  `;

  const status = row ? mapAggregateRow(row) : null;
  if (!status) {
    return null;
  }

  if (status.personaIds.length > 0) {
    return status;
  }

  await removePersonalSpotlight(serverId, userId, channelDiscId);
  return null;
}

export async function getActivePersonalSpotlightsForUser(
  serverId: number,
  userId: number,
): Promise<PersonalSpotlightStatus[]> {
  await deleteExpiredPersonalSpotlights(serverId, userId);

  const rows = await sql<PersonalSpotlightAggregateRow[]>`
    SELECT
      ps.server_id,
      ps.user_id,
      ps.channel_disc_id,
      ps.auto_trigger_tomori_id,
      ps.expires_at,
      ps.created_at,
      ps.updated_at,
      COALESCE(
        ARRAY_AGG(psp.tomori_id ORDER BY psp.tomori_id) FILTER (WHERE psp.tomori_id IS NOT NULL),
        ARRAY[]::INT[]
      ) AS persona_ids
    FROM personal_spotlights ps
    LEFT JOIN personal_spotlight_personas psp
      ON psp.server_id = ps.server_id
      AND psp.user_id = ps.user_id
      AND psp.channel_disc_id = ps.channel_disc_id
    WHERE ps.server_id = ${serverId}
      AND ps.user_id = ${userId}
    GROUP BY
      ps.server_id,
      ps.user_id,
      ps.channel_disc_id,
      ps.auto_trigger_tomori_id,
      ps.expires_at,
      ps.created_at,
      ps.updated_at
    ORDER BY ps.channel_disc_id ASC
  `;

  const emptyChannelIds: string[] = [];
  const spotlights: PersonalSpotlightStatus[] = [];

  for (const row of rows) {
    const status = mapAggregateRow(row);
    if (!status) {
      continue;
    }

    if (status.personaIds.length === 0) {
      emptyChannelIds.push(status.channelDiscId);
      continue;
    }

    spotlights.push(status);
  }

  if (emptyChannelIds.length > 0) {
    await Promise.all(emptyChannelIds.map((channelDiscId) => removePersonalSpotlight(serverId, userId, channelDiscId)));
  }

  return spotlights;
}

export function isPersonaAllowedByPersonalSpotlight(
  spotlightStatus: PersonalSpotlightStatus | null | undefined,
  tomoriId: number | null | undefined,
): boolean {
  if (!spotlightStatus) {
    return true;
  }

  if (!Number.isInteger(tomoriId) || !tomoriId) {
    return false;
  }

  return spotlightStatus.personaIds.includes(tomoriId);
}

export function filterPersonasByPersonalSpotlight<T extends { tomori_id?: number | null | undefined }>(
  personas: readonly T[],
  spotlightStatus: PersonalSpotlightStatus | null | undefined,
): T[] {
  if (!spotlightStatus) {
    return [...personas];
  }

  return personas.filter((persona) => isPersonaAllowedByPersonalSpotlight(spotlightStatus, persona.tomori_id));
}
