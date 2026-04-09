import { sql } from "@/utils/db/client";
import { log } from "@/utils/misc/logger";
import { keyManager } from "@/utils/security/keyManager";

export const MANAGED_WEBHOOK_KIND_SHARED_CHANNEL = "shared_channel" as const;
export type ManagedWebhookKind = typeof MANAGED_WEBHOOK_KIND_SHARED_CHANNEL;

type ManagedDiscordWebhookRow = {
  managed_webhook_id: number;
  guild_disc_id: string;
  kind: ManagedWebhookKind;
  channel_disc_id: string;
  webhook_disc_id: string;
  webhook_token: Buffer;
  key_version: number | null;
  created_at?: Date;
  updated_at?: Date;
};

export async function upsertManagedDiscordWebhook(params: {
  guildDiscId: string;
  kind?: ManagedWebhookKind;
  channelDiscId: string;
  webhookDiscId: string;
  rawToken: string;
}): Promise<boolean> {
  const { guildDiscId, kind = MANAGED_WEBHOOK_KIND_SHARED_CHANNEL, channelDiscId, webhookDiscId, rawToken } = params;

  if (!guildDiscId || !channelDiscId || !webhookDiscId || !rawToken.trim()) {
    log.warn("[ManagedWebhookDb] Missing required parameters for webhook upsert");
    return false;
  }

  try {
    const currentKey = keyManager.getCurrentKey();
    const currentVersion = keyManager.getCurrentVersion();

    await sql`
      INSERT INTO discord_managed_webhooks (
        guild_disc_id,
        kind,
        channel_disc_id,
        webhook_disc_id,
        webhook_token,
        key_version
      )
      VALUES (
        ${guildDiscId},
        ${kind},
        ${channelDiscId},
        ${webhookDiscId},
        pgp_sym_encrypt(${rawToken.trim()}, ${currentKey}, 'compress-algo=1, cipher-algo=aes256'),
        ${currentVersion}
      )
      ON CONFLICT (kind, channel_disc_id)
      DO UPDATE SET
        guild_disc_id = EXCLUDED.guild_disc_id,
        webhook_disc_id = EXCLUDED.webhook_disc_id,
        webhook_token = EXCLUDED.webhook_token,
        key_version = EXCLUDED.key_version,
        updated_at = CURRENT_TIMESTAMP
    `;

    return true;
  } catch (error) {
    log.error(`[ManagedWebhookDb] Failed to upsert webhook for guild ${guildDiscId}, channel ${channelDiscId}`, error);
    return false;
  }
}

export async function loadManagedDiscordWebhookByChannel(
  channelDiscId: string,
  kind: ManagedWebhookKind = MANAGED_WEBHOOK_KIND_SHARED_CHANNEL,
): Promise<ManagedDiscordWebhookRow | null> {
  if (!channelDiscId) {
    return null;
  }

  try {
    const [row] = await sql`
      SELECT managed_webhook_id, guild_disc_id, kind, channel_disc_id, webhook_disc_id, webhook_token, key_version,
             created_at, updated_at
      FROM discord_managed_webhooks
      WHERE channel_disc_id = ${channelDiscId}
        AND kind = ${kind}
      LIMIT 1
    `;

    return (row as ManagedDiscordWebhookRow | undefined) ?? null;
  } catch (error) {
    log.error(`[ManagedWebhookDb] Failed to load stored webhook for channel ${channelDiscId}`, error);
    return null;
  }
}

export async function loadManagedDiscordWebhookByChannelAndWebhookId(
  channelDiscId: string,
  webhookDiscId: string,
  kind: ManagedWebhookKind = MANAGED_WEBHOOK_KIND_SHARED_CHANNEL,
): Promise<ManagedDiscordWebhookRow | null> {
  if (!channelDiscId || !webhookDiscId) {
    return null;
  }

  try {
    const [row] = await sql`
      SELECT managed_webhook_id, guild_disc_id, kind, channel_disc_id, webhook_disc_id, webhook_token, key_version,
             created_at, updated_at
      FROM discord_managed_webhooks
      WHERE channel_disc_id = ${channelDiscId}
        AND webhook_disc_id = ${webhookDiscId}
        AND kind = ${kind}
      LIMIT 1
    `;

    return (row as ManagedDiscordWebhookRow | undefined) ?? null;
  } catch (error) {
    log.error(
      `[ManagedWebhookDb] Failed to load stored webhook for channel ${channelDiscId} and webhook ${webhookDiscId}`,
      error,
    );
    return null;
  }
}

export async function deleteManagedDiscordWebhook(
  channelDiscId: string,
  webhookDiscId?: string | null,
  kind: ManagedWebhookKind = MANAGED_WEBHOOK_KIND_SHARED_CHANNEL,
): Promise<boolean> {
  if (!channelDiscId) {
    return false;
  }

  try {
    const result =
      webhookDiscId && webhookDiscId.trim().length > 0
        ? await sql`
            DELETE FROM discord_managed_webhooks
            WHERE channel_disc_id = ${channelDiscId}
              AND webhook_disc_id = ${webhookDiscId}
              AND kind = ${kind}
          `
        : await sql`
            DELETE FROM discord_managed_webhooks
            WHERE channel_disc_id = ${channelDiscId}
              AND kind = ${kind}
          `;

    return result.count > 0;
  } catch (error) {
    log.error(
      `[ManagedWebhookDb] Failed to delete stored webhook for channel ${channelDiscId}${webhookDiscId ? ` and webhook ${webhookDiscId}` : ""}`,
      error,
    );
    return false;
  }
}

export async function decryptManagedDiscordWebhookToken(row: ManagedDiscordWebhookRow): Promise<string | null> {
  if (!row.webhook_token || row.webhook_token.length === 0) {
    return null;
  }

  try {
    const keyVersion = row.key_version || 1;
    const key = keyManager.getKey(keyVersion);

    const [result] = await sql`
      SELECT pgp_sym_decrypt(${row.webhook_token}, ${key}) AS decrypted_token
    `;

    if (!result?.decrypted_token) {
      log.warn(`[ManagedWebhookDb] Decryption returned empty for stored webhook ${row.webhook_disc_id}`);
      return null;
    }

    const decryptedToken = result.decrypted_token.toString();
    const currentVersion = keyManager.getCurrentVersion();
    if (keyVersion !== currentVersion) {
      const currentKey = keyManager.getCurrentKey();

      await sql`
        UPDATE discord_managed_webhooks
        SET webhook_token = pgp_sym_encrypt(${decryptedToken}, ${currentKey}, 'compress-algo=1, cipher-algo=aes256'),
            key_version = ${currentVersion},
            updated_at = CURRENT_TIMESTAMP
        WHERE managed_webhook_id = ${row.managed_webhook_id}
      `;
    }

    return decryptedToken;
  } catch (error) {
    log.error(`[ManagedWebhookDb] Failed to decrypt stored webhook token for ${row.webhook_disc_id}`, error);
    return null;
  }
}
