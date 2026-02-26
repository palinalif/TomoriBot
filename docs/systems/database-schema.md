# 5. Database Schema and Data Model

This document summarizes the current PostgreSQL schema used by TomoriBot.

## Schema Sources

- Main schema: `src/db/schema.sql`
- RAG schema: `src/db/schema_rag.sql` (loaded only when RAG is enabled)

## Main Tables (Current)

### Core identity/config

- `servers`
- `tomoris`
- `tomori_configs`
- `persona_configs`
- `users`

### Model registries

- `llms`
- `image_diffusion_models`
- `embedding_models`

### Presets and prompts

- `tomori_presets`
- `system_prompt_presets`

### Memory and expression data

- `server_memories`
- `personal_memories`
- `server_emojis`
- `server_stickers`

### Permissions/privacy/routing

- `personalization_blacklist`
- `channel_whitelist`

### Ops and reliability

- `cooldowns` (UNLOGGED)
- `reminders`
- `error_logs`
- `opt_api_keys`
- `api_key_rotation`

### Quota system

- `image_quota_configs`
- `image_quotas`
- `serverwide_quotas`

### Bridge integration

- `matrix_channel_links`

## Optional RAG Tables

When enabled (`RUN_ENV=production` or `ACTIVATE_LOCAL_RAG=true`):

- `documents`
- `document_chunks`

Also requires pgvector (`CREATE EXTENSION IF NOT EXISTS vector`).

## Notable Data Model Decisions

### Multi-persona

- `tomoris` now supports multiple personas per server (`is_alter` flag).
- `persona_lineage_id` supports cross-server memory identity matching.
- Persona names are constrained unique per server (case-insensitive, trimmed).

### Server config scoping

- `tomori_configs.server_id` is the primary modern scope.
- `tomori_configs.tomori_id` remains as a nullable legacy pointer.

### Memory split

- `server_memories`: shared server-level memory
- `personal_memories`: user + persona lineage scoped memory

### Cooldown storage

`cooldowns` uses explicit scope columns:

- `cooldown_type`
- `server_disc_id`
- `user_disc_id`
- `channel_disc_id`
- `command_category`
- `expiry_time`

### API key security

Encrypted columns are stored as `BYTEA` with key version tracking:

- `tomori_configs.api_key` + `tomori_configs.key_version`
- `opt_api_keys.api_key` + `opt_api_keys.key_version`
- `api_key_rotation.api_key` + `api_key_rotation.key_version`

## Migration Style

Schema is idempotent and startup-safe:

- `CREATE TABLE IF NOT EXISTS`
- helper functions like `add_column_if_not_exists` and `drop_column_if_exists`
- guarded `DO $$ ... $$` blocks for conditional constraint/index/column changes

## Operational Notes

- `cleanup_expired_cooldowns()` is defined in schema and used by startup cleanup + optional pg_cron.
- Quota cleanup helpers exist for old image quota rows (`cleanup_old_image_quotas()`).
- RAG tables are intentionally separate so local development can run without pgvector unless enabled.
