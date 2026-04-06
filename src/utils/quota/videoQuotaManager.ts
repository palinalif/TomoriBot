import { sql } from "@/utils/db/client";
import { log } from "@/utils/misc/logger";
import type { SQL } from "bun";
import type { VideoQuotaConfigRow, VideoQuotaRow, VideoServerwideQuotaRow } from "@/types/db/schema";
import { videoQuotaConfigSchema, videoQuotaSchema, videoServerwideQuotaSchema } from "@/types/db/schema";

/**
 * Result of video quota check operations.
 * Shares the same shape as image quota checks for consistency.
 */
export interface VideoQuotaCheckResult {
  allowed: boolean;
  reason?: "user_quota_exceeded" | "serverwide_quota_exceeded" | "disabled";
  userRemaining?: number;
  serverwideRemaining?: number;
  resetTime?: Date;
}

/**
 * Get or create server's video quota configuration.
 * Creates default config if not exists (3 daily user quota, unlimited serverwide).
 * Lower default than image quotas because video generation is more expensive.
 */
export async function getVideoQuotaConfig(serverId: number): Promise<VideoQuotaConfigRow> {
  try {
    // 1. Try to fetch existing config
    const [existing] = await sql<
      VideoQuotaConfigRow[]
    >`SELECT * FROM video_quota_configs WHERE server_id = ${serverId}`;

    if (existing) {
      return videoQuotaConfigSchema.parse(existing);
    }

    // 2. Create default config if not exists
    const [newConfig] = await sql<VideoQuotaConfigRow[]>`
      INSERT INTO video_quota_configs (server_id, daily_user_quota, serverwide_quota, serverwide_quota_resets_in, enabled)
      VALUES (${serverId}, 3, 0, 365, true)
      RETURNING *
    `;

    log.info("Created default video quota config");

    return videoQuotaConfigSchema.parse(newConfig);
  } catch (error) {
    log.error("Failed to get video quota config", error);
    return {
      server_id: serverId,
      daily_user_quota: 3,
      serverwide_quota: 0,
      serverwide_quota_resets_in: 365,
      enabled: true,
    };
  }
}

/**
 * Check if user can generate a video based on daily quota.
 * Returns remaining quota and whether generation is allowed.
 */
export async function checkUserDailyVideoQuota(
  serverId: number,
  userDiscId: string,
  config: VideoQuotaConfigRow,
): Promise<VideoQuotaCheckResult> {
  // 1. If daily user quota is 0 (unlimited), allow
  if (config.daily_user_quota === 0) {
    return { allowed: true };
  }

  try {
    // 2. Get current date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];

    // 3. Get or create user's quota record for today
    const [userQuota] = await sql<VideoQuotaRow[]>`
      INSERT INTO video_quotas (server_id, user_disc_id, usage_count, quota_date)
      VALUES (${serverId}, ${userDiscId}, 0, ${today}::date)
      ON CONFLICT (server_id, user_disc_id, quota_date)
      DO UPDATE SET server_id = EXCLUDED.server_id
      RETURNING *
    `;

    const parsedQuota = videoQuotaSchema.parse(userQuota);

    // 4. Check if user has exceeded their daily quota
    const remaining = config.daily_user_quota - parsedQuota.usage_count;

    if (remaining <= 0) {
      const resetTime = new Date();
      resetTime.setHours(24, 0, 0, 0);

      return {
        allowed: false,
        reason: "user_quota_exceeded",
        userRemaining: 0,
        resetTime,
      };
    }

    return {
      allowed: true,
      userRemaining: remaining,
    };
  } catch (error) {
    log.error("Failed to check user daily video quota", error);
    return { allowed: true };
  }
}

/**
 * Check if server has remaining server-wide video quota.
 */
export async function checkServerwideVideoQuota(
  serverId: number,
  config: VideoQuotaConfigRow,
): Promise<VideoQuotaCheckResult> {
  // 1. If serverwide quota is 0 (unlimited), allow
  if (config.serverwide_quota === 0) {
    return { allowed: true };
  }

  try {
    // 2. Get or create server-wide quota record
    const [serverwideQuota] = await sql<VideoServerwideQuotaRow[]>`
      INSERT INTO video_serverwide_quotas (
        server_id,
        usage_count,
        quota_period_start,
        quota_period_end
      )
      VALUES (
        ${serverId},
        0,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP + (${config.serverwide_quota_resets_in} || ' days')::interval
      )
      ON CONFLICT (server_id)
      DO UPDATE SET server_id = EXCLUDED.server_id
      RETURNING *
    `;

    const parsedQuota = videoServerwideQuotaSchema.parse(serverwideQuota);

    // 3. Check if quota period has expired (needs reset)
    const now = new Date();
    const periodEnd = new Date(parsedQuota.quota_period_end);

    if (now >= periodEnd) {
      const [resetQuota] = await sql<VideoServerwideQuotaRow[]>`
        UPDATE video_serverwide_quotas
        SET
          usage_count = 0,
          quota_period_start = CURRENT_TIMESTAMP,
          quota_period_end = CURRENT_TIMESTAMP + (${config.serverwide_quota_resets_in} || ' days')::interval
        WHERE server_id = ${serverId}
        RETURNING *
      `;

      const parsedResetQuota = videoServerwideQuotaSchema.parse(resetQuota);

      return {
        allowed: true,
        serverwideRemaining: config.serverwide_quota,
        resetTime: new Date(parsedResetQuota.quota_period_end),
      };
    }

    // 4. Check if server has exceeded its quota
    const remaining = config.serverwide_quota - parsedQuota.usage_count;

    if (remaining <= 0) {
      return {
        allowed: false,
        reason: "serverwide_quota_exceeded",
        serverwideRemaining: 0,
        resetTime: periodEnd,
      };
    }

    return {
      allowed: true,
      serverwideRemaining: remaining,
      resetTime: periodEnd,
    };
  } catch (error) {
    log.error("Failed to check serverwide video quota", error);
    return { allowed: true };
  }
}

/**
 * Check all video quotas (user daily + server-wide).
 * Returns combined result indicating if generation is allowed.
 */
export async function checkVideoQuota(serverId: number, userDiscId: string): Promise<VideoQuotaCheckResult> {
  try {
    // 1. Get quota configuration
    const config = await getVideoQuotaConfig(serverId);

    // 2. If quota system is disabled, allow all
    if (!config.enabled) {
      return { allowed: true };
    }

    // 3. Check user daily quota first (most common limit)
    const userCheck = await checkUserDailyVideoQuota(serverId, userDiscId, config);
    if (!userCheck.allowed) {
      return userCheck;
    }

    // 4. Check server-wide quota
    const serverwideCheck = await checkServerwideVideoQuota(serverId, config);
    if (!serverwideCheck.allowed) {
      return serverwideCheck;
    }

    // 5. Both checks passed
    return {
      allowed: true,
      userRemaining: userCheck.userRemaining,
      serverwideRemaining: serverwideCheck.serverwideRemaining,
      resetTime: serverwideCheck.resetTime,
    };
  } catch (error) {
    log.error("Failed to check video quota", error);
    return { allowed: true };
  }
}

/**
 * Increment both user daily and server-wide video quotas after successful generation.
 * Should only be called AFTER video generation succeeds.
 */
export async function incrementVideoQuota(serverId: number, userDiscId: string): Promise<void> {
  try {
    const today = new Date().toISOString().split("T")[0];

    await sql.begin(async (tx: SQL) => {
      // Increment user quota
      await tx`
        INSERT INTO video_quotas (server_id, user_disc_id, usage_count, quota_date)
        VALUES (${serverId}, ${userDiscId}, 1, ${today}::date)
        ON CONFLICT (server_id, user_disc_id, quota_date)
        DO UPDATE SET usage_count = video_quotas.usage_count + 1
      `;

      // Increment server-wide quota
      await tx`
        UPDATE video_serverwide_quotas
        SET usage_count = usage_count + 1
        WHERE server_id = ${serverId}
      `;
    });

    log.info("Incremented video quotas");
  } catch (error) {
    log.error("Failed to increment video quota", error);
  }
}
