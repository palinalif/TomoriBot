import type { CustomEndpointRow } from "@/types/db/schema";
import { customEndpointSchema } from "@/types/db/schema";
import { sql } from "@/utils/db/client";
import { log } from "@/utils/misc/logger";
import { buildServerCustomProviderName } from "@/utils/provider/customProviderUtils";
import { decryptApiKey } from "@/utils/security/crypto";

export interface SpeechEndpointResult {
  endpoint: CustomEndpointRow;
  /** Empty string when requires_auth = false (local endpoint with no auth). */
  apiKey: string;
}

/**
 * Resolves the active speech or transcription endpoint for a server by querying
 * `custom_endpoints` directly (capability-first lookup, bypassing the LLM/model chain).
 *
 * @param serverId - Database server_id
 * @param capability - "speech" or "transcription"
 * @returns Endpoint row + decrypted API key, or null if none is registered
 */
async function resolveActiveEndpointByCapability(
  serverId: number,
  capability: "speech" | "transcription",
): Promise<SpeechEndpointResult | null> {
  try {
    // 1. Find the active (is_default) custom endpoint for this capability on the server.
    const rows = await sql`
      SELECT * FROM custom_endpoints
      WHERE server_id = ${serverId}
        AND capability = ${capability}
        AND user_id IS NULL
        AND is_default = true
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      return null;
    }

    const parsed = customEndpointSchema.safeParse(rows[0]);
    if (!parsed.success) {
      log.warn(
        `[SpeechResolver] Failed to parse ${capability} endpoint for server ${serverId}: ${parsed.error.message}`,
      );
      return null;
    }

    const endpoint = parsed.data;

    // 2. Endpoints that don't require auth (local servers) need no key lookup.
    if (!endpoint.requires_auth) {
      return { endpoint, apiKey: "" };
    }

    // 3. Credentials are stored in saved_provider_configs keyed by the internal provider name:
    //    "custom:s{serverId}:{label}" — mirrors buildServerCustomProviderName.
    const providerName = buildServerCustomProviderName(serverId, endpoint.label);
    const [configRow] = await sql`
      SELECT api_key, key_version FROM saved_provider_configs
      WHERE server_id = ${serverId}
        AND provider = ${providerName}
      LIMIT 1
    `;

    if (!configRow?.api_key) {
      log.warn(
        `[SpeechResolver] No credentials found for ${capability} endpoint "${endpoint.label}" on server ${serverId}`,
      );
      return null;
    }

    let apiKey: string;
    try {
      apiKey = await decryptApiKey(configRow.api_key, configRow.key_version ?? 1);
    } catch {
      log.warn(`[SpeechResolver] Failed to decrypt credentials for ${capability} endpoint on server ${serverId}`);
      return null;
    }

    if (!apiKey) {
      return null;
    }

    return { endpoint, apiKey };
  } catch (error) {
    log.warn(`[SpeechResolver] Error resolving ${capability} endpoint for server ${serverId}`, error);
    return null;
  }
}

/**
 * Resolves the active speech (TTS) endpoint and credentials for a server.
 * Returns null when no speech endpoint is registered.
 */
export async function resolveActiveSpeechEndpoint(serverId: number): Promise<SpeechEndpointResult | null> {
  return resolveActiveEndpointByCapability(serverId, "speech");
}

/**
 * Resolves the active transcription (STT) endpoint and credentials for a server.
 * Returns null when no transcription endpoint is registered.
 */
export async function resolveActiveTranscriptionEndpoint(serverId: number): Promise<SpeechEndpointResult | null> {
  return resolveActiveEndpointByCapability(serverId, "transcription");
}
