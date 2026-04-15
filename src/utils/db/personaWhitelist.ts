import { sql } from "@/utils/db/client";
import type { ChannelPersonaWhitelistRow } from "@/types/db/schema";
import type { WhitelistCheckResult } from "@/types/misc/channelWhitelist";

type PersonaWhitelistStatus = Pick<
  WhitelistCheckResult,
  "hasActivePersonaWhitelist" | "restrictedPersonaIds" | "whitelistedPersonaIds"
>;

/**
 * Replace the full channel whitelist set for a persona.
 * Passing an empty array clears the persona-specific channel restriction.
 */
export async function replacePersonaWhitelistChannels(
  serverId: number,
  tomoriId: number,
  channelDiscIds: string[],
): Promise<void> {
  const uniqueChannelDiscIds = [...new Set(channelDiscIds)];

  await sql.transaction(async (tx) => {
    await tx`
      DELETE FROM channel_persona_whitelist
      WHERE server_id = ${serverId} AND tomori_id = ${tomoriId}
    `;

    for (const channelDiscId of uniqueChannelDiscIds) {
      await tx`
        INSERT INTO channel_persona_whitelist (server_id, channel_disc_id, tomori_id)
        VALUES (${serverId}, ${channelDiscId}, ${tomoriId})
      `;
    }
  });
}

/**
 * Remove a single persona-channel whitelist entry.
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
 * Get the channel whitelist entries for a single persona.
 */
export async function getPersonaWhitelistChannels(
  serverId: number,
  tomoriId: number,
): Promise<ChannelPersonaWhitelistRow[]> {
  const result = await sql`
    SELECT *
    FROM channel_persona_whitelist
    WHERE server_id = ${serverId} AND tomori_id = ${tomoriId}
    ORDER BY channel_disc_id ASC, created_at ASC
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
    ORDER BY tomori_id ASC, channel_disc_id ASC, created_at ASC
  `;

  return result as ChannelPersonaWhitelistRow[];
}

/**
 * Check whether a persona is allowed by the effective persona-channel whitelist.
 * Restricted personas are allowed only in their configured channels; unrestricted personas are always allowed.
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

  if (!(whitelistStatus.restrictedPersonaIds?.includes(tomoriId) ?? false)) {
    return true;
  }

  return whitelistStatus.whitelistedPersonaIds?.includes(tomoriId) ?? false;
}

/**
 * Filter a persona list down to only entries allowed by the effective persona-channel whitelist.
 * When no persona whitelist is active anywhere in the server, the original list is returned as-is.
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
