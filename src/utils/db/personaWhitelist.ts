import { sql } from "@/utils/db/client";
import type { ChannelPersonaWhitelistRow } from "@/types/db/schema";
import type { WhitelistCheckResult } from "@/types/misc/channelWhitelist";

type PersonaWhitelistStatus = Pick<WhitelistCheckResult, "hasActivePersonaWhitelist" | "whitelistedPersonaIds">;

/**
 * Replace the full persona whitelist set for a channel.
 * Passing an empty array clears the channel-specific persona whitelist.
 */
export async function replaceChannelPersonaWhitelist(
  serverId: number,
  channelDiscId: string,
  tomoriIds: number[],
): Promise<void> {
  const uniqueTomoriIds = [...new Set(tomoriIds)];

  await sql.transaction(async (tx) => {
    await tx`
      DELETE FROM channel_persona_whitelist
      WHERE server_id = ${serverId} AND channel_disc_id = ${channelDiscId}
    `;

    for (const tomoriId of uniqueTomoriIds) {
      await tx`
        INSERT INTO channel_persona_whitelist (server_id, channel_disc_id, tomori_id)
        VALUES (${serverId}, ${channelDiscId}, ${tomoriId})
      `;
    }
  });
}

/**
 * Remove a single persona whitelist entry from a channel.
 * @returns True if an entry was deleted, false if not found.
 */
export async function removeChannelPersonaWhitelist(
  serverId: number,
  channelDiscId: string,
  tomoriId: number,
): Promise<boolean> {
  const result = await sql`
    DELETE FROM channel_persona_whitelist
    WHERE server_id = ${serverId}
      AND channel_disc_id = ${channelDiscId}
      AND tomori_id = ${tomoriId}
  `;

  return result.count > 0;
}

/**
 * Get the persona whitelist entries for a single channel.
 */
export async function getChannelWhitelistPersonas(
  serverId: number,
  channelDiscId: string,
): Promise<ChannelPersonaWhitelistRow[]> {
  const result = await sql`
    SELECT *
    FROM channel_persona_whitelist
    WHERE server_id = ${serverId} AND channel_disc_id = ${channelDiscId}
    ORDER BY created_at ASC, tomori_id ASC
  `;

  return result as ChannelPersonaWhitelistRow[];
}

/**
 * Get all persona whitelist entries for a server.
 */
export async function getAllWhitelistPersonas(serverId: number): Promise<ChannelPersonaWhitelistRow[]> {
  const result = await sql`
    SELECT *
    FROM channel_persona_whitelist
    WHERE server_id = ${serverId}
    ORDER BY channel_disc_id ASC, created_at ASC, tomori_id ASC
  `;

  return result as ChannelPersonaWhitelistRow[];
}

/**
 * Check whether a persona is allowed by the effective channel persona whitelist.
 * When no persona whitelist is active for the channel, all personas are allowed.
 */
export function isPersonaAllowedByWhitelistStatus(
  whitelistStatus: PersonaWhitelistStatus | null | undefined,
  tomoriId: number | null | undefined,
): boolean {
  if (!whitelistStatus?.hasActivePersonaWhitelist) {
    return true;
  }

  if (!Number.isInteger(tomoriId) || !tomoriId) {
    return false;
  }

  return whitelistStatus.whitelistedPersonaIds?.includes(tomoriId) ?? false;
}

/**
 * Filter a persona list down to only entries allowed by the effective channel persona whitelist.
 * When no persona whitelist is active for the channel, the original list is returned as-is.
 */
export function filterPersonasByWhitelist<T extends { tomori_id?: number | null | undefined }>(
  personas: readonly T[],
  whitelistStatus: PersonaWhitelistStatus | null | undefined,
): T[] {
  if (!whitelistStatus?.hasActivePersonaWhitelist) {
    return [...personas];
  }

  return personas.filter((persona) => isPersonaAllowedByWhitelistStatus(whitelistStatus, persona.tomori_id));
}
