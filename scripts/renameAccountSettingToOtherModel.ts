/**
 * Migration: Rename account-setting → other-model
 *
 * This migration renames the OpenRouter "account-setting" feature to "other-model"
 * across the database to better reflect its actual behavior (user specifies any
 * OpenRouter model, not just their account default).
 *
 * Changes:
 * 1. Rename llms row: llm_codename 'account-setting' → 'other-model', update descriptions
 * 2. Rename tomori_configs columns:
 *    - account_setting_actual_model → other_model_codename
 *    - account_setting_capabilities → other_model_capabilities
 *    - account_setting_capabilities_fetched_at → other_model_capabilities_fetched_at
 *
 * Usage: bun scripts/renameAccountSettingToOtherModel.ts
 */

import { sql } from "@/utils/db/client";
import { log } from "@/utils/misc/logger";

async function renameAccountSettingToOtherModel(): Promise<void> {
  try {
    log.info("Starting migration: Rename account-setting → other-model...");

    // 1. Update LLM row codename and descriptions
    const llmResult = await sql`
      UPDATE llms
      SET llm_codename = 'other-model',
          llm_description = 'Advanced: Use any OpenRouter model by entering its codename',
          ja_description = '上級者向け：コードネームを入力して任意のOpenRouterモデルを使用'
      WHERE llm_codename = 'account-setting'
      RETURNING llm_id
    `;

    if (llmResult.length > 0) {
      log.info(`✓ Updated LLM row (id=${llmResult[0]?.llm_id}) codename to 'other-model'`);
    } else {
      log.warn("  No LLM row found with codename 'account-setting' — already renamed or not seeded");
    }

    // 2. Rename DB columns (metadata-only, no data rewrite required)
    await sql`
      ALTER TABLE tomori_configs
      RENAME COLUMN account_setting_actual_model TO other_model_codename
    `;
    log.info("✓ Renamed column: account_setting_actual_model → other_model_codename");

    await sql`
      ALTER TABLE tomori_configs
      RENAME COLUMN account_setting_capabilities TO other_model_capabilities
    `;
    log.info("✓ Renamed column: account_setting_capabilities → other_model_capabilities");

    await sql`
      ALTER TABLE tomori_configs
      RENAME COLUMN account_setting_capabilities_fetched_at TO other_model_capabilities_fetched_at
    `;
    log.info("✓ Renamed column: account_setting_capabilities_fetched_at → other_model_capabilities_fetched_at");

    log.success("Migration completed: account-setting renamed to other-model");
  } catch (error) {
    if (error instanceof Error && error.message.includes("does not exist")) {
      log.warn("Some columns or rows may already be renamed — check manually if needed.");
      log.warn(`Detail: ${error.message}`);
    } else {
      log.error("Migration failed", error as Error);
      throw error;
    }
  }
}

// Run migration
renameAccountSettingToOtherModel()
  .then(() => {
    log.info("Migration finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    log.error("Migration failed", error as Error);
    process.exit(1);
  });
