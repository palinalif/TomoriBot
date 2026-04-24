import { sql } from "@/utils/db/client";
import { log } from "../src/utils/misc/logger";
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

config();

// ---------------------------------------------------------------------------
// scripts/maintenance/backupMemories.ts
//   bun run backup:memories  → export ALL personal memories across all users
//
//   Iterates every user in the database and writes their personal_memories
//   array to individual JSON files. Users with no memories are skipped.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserRow {
  user_id: number;
  user_disc_id: string;
  user_nickname: string;
  personal_memories: string[];
}

interface UserEntry {
  user_disc_id: string;
  user_nickname: string;
  memory_count: number;
  filename: string;
}

interface BundleManifest {
  exported_at: string;
  bot_version: string;
  total_users: number;
  total_memories: number;
  users: UserEntry[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runBackup(): Promise<void> {
  log.section("MEMORIES BACKUP");
  log.info("Exporting all personal memories from the database...");

  // 1. Verify database credentials
  if (!process.env.POSTGRES_PASSWORD && !process.env.DATABASE_URL) {
    log.error("POSTGRES_PASSWORD or DATABASE_URL must be set in .env");
    process.exit(1);
  }

  // 2. Create timestamped output directory
  const backupsRoot = join(process.cwd(), "backups");
  if (!existsSync(backupsRoot)) mkdirSync(backupsRoot, { recursive: true });

  const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "").replace("T", "_");
  const bundleDir = join(backupsRoot, `memories_${timestamp}`);
  mkdirSync(bundleDir, { recursive: true });
  log.info(`Output directory: ${bundleDir}`);

  // 3. Load bot version
  const { version } = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8")) as { version: string };

  // 4. Fetch all users that have personal memories
  const users = await sql<UserRow[]>`
    SELECT user_id, user_disc_id, user_nickname, personal_memories
    FROM users
    WHERE personal_memories IS NOT NULL
      AND array_length(personal_memories, 1) > 0
    ORDER BY user_id ASC
  `;

  if (users.length === 0) {
    log.warn("No users with personal memories found. Nothing to export.");
    process.exit(0);
  }

  log.info(`Found ${users.length} user(s) with personal memories`);

  const manifest: BundleManifest = {
    exported_at: new Date().toISOString(),
    bot_version: version,
    total_users: 0,
    total_memories: 0,
    users: [],
  };

  // 5. Export each user's memories
  for (const user of users) {
    const memories = user.personal_memories ?? [];
    if (memories.length === 0) continue;

    // Sanitize nickname for filename (replace non-word chars with underscores)
    const safeName =
      (user.user_nickname ?? "unknown")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 50) || `user_${user.user_id}`;

    const filename = `${safeName}_${user.user_disc_id}.json`;

    const payload = {
      user_disc_id: user.user_disc_id,
      user_nickname: user.user_nickname,
      exported_at: new Date().toISOString(),
      personal_memories: memories,
    };

    writeFileSync(join(bundleDir, filename), `${JSON.stringify(payload, null, 2)}\n`);

    log.success(`  ${user.user_nickname}: ${memories.length} memories`);

    manifest.users.push({
      user_disc_id: user.user_disc_id,
      user_nickname: user.user_nickname,
      memory_count: memories.length,
      filename,
    });
    manifest.total_memories += memories.length;
  }

  // 6. Write manifest
  manifest.total_users = manifest.users.length;
  writeFileSync(join(bundleDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  // 7. Summary
  log.section("BACKUP COMPLETE");
  log.info(`Location:       ${bundleDir}`);
  log.info(`Users:          ${manifest.total_users}`);
  log.info(`Total memories: ${manifest.total_memories}`);
}

runBackup().catch((error) => {
  log.error("Memories backup failed:");
  console.error(error);
  process.exit(1);
});
