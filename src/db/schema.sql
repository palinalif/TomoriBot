-- Create function for updated_at trigger
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a function to add columns if they don't exist
CREATE OR REPLACE FUNCTION add_column_if_not_exists(
    _table TEXT, 
    _column TEXT, 
    _datatype TEXT,
    _default_value TEXT DEFAULT NULL,
    _constraint TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    _column_exists BOOLEAN;
BEGIN
    -- Check if the column already exists
    SELECT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = _table 
        AND column_name = _column
    ) INTO _column_exists;
    
    -- If it doesn't exist, add it
    IF NOT _column_exists THEN
        IF _default_value IS NULL AND _constraint IS NULL THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', 
                         _table, _column, _datatype);
        ELSIF _constraint IS NULL THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s DEFAULT %s', 
                         _table, _column, _datatype, _default_value);
        ELSIF _default_value IS NULL THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s %s', 
                         _table, _column, _datatype, _constraint);
        ELSE
            EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s DEFAULT %s %s', 
                         _table, _column, _datatype, _default_value, _constraint);
        END IF;
        
        RAISE NOTICE 'Added column %.% of type %', _table, _column, _datatype;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create a function to drop columns if they exist (idempotent)
CREATE OR REPLACE FUNCTION drop_column_if_exists(
    _table TEXT,
    _column TEXT
) RETURNS VOID AS $$
DECLARE
    _column_exists BOOLEAN;
BEGIN
    -- Check if the column exists
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = _table
        AND column_name = _column
    ) INTO _column_exists;

    -- If it exists, drop it
    IF _column_exists THEN
        EXECUTE format('ALTER TABLE %I DROP COLUMN %I',
                     _table, _column);
        RAISE NOTICE 'Dropped column %.%', _table, _column;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS servers (
  server_id SERIAL PRIMARY KEY,
  server_disc_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add DM channel identification column 
SELECT add_column_if_not_exists('servers', 'is_dm_channel', 'BOOLEAN', 'false');

-- Add registration_locale column for server region analytics 
SELECT add_column_if_not_exists('servers', 'registration_locale', 'TEXT');

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_servers_disc_id ON servers(server_disc_id);
CREATE INDEX IF NOT EXISTS idx_servers_is_dm_channel ON servers(is_dm_channel);

-- Create updated_at trigger for servers table
DROP TRIGGER IF EXISTS update_servers_timestamp ON servers;
CREATE TRIGGER update_servers_timestamp
BEFORE UPDATE ON servers
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TABLE IF NOT EXISTS tomoris (
  tomori_id SERIAL PRIMARY KEY,
  server_id INT NOT NULL,
  tomori_nickname TEXT NOT NULL,
  attribute_list TEXT[] DEFAULT '{}',
  sample_dialogues_in TEXT[] DEFAULT '{}', -- array index is soft id of sample dialogue pairs
  sample_dialogues_out TEXT[] DEFAULT '{}',
  autoch_counter INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Create updated_at trigger for tomoris table
DROP TRIGGER IF EXISTS update_tomoris_timestamp ON tomoris;
CREATE TRIGGER update_tomoris_timestamp
BEFORE UPDATE ON tomoris
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Add multi-persona support columns (January 2026)
-- is_alter: Distinguishes main persona (false) from alter personas (true)
SELECT add_column_if_not_exists('tomoris', 'is_alter', 'BOOLEAN', 'false');
-- webhook_avatar_url: Stores Discord CDN URL for alter persona avatars from import embed
SELECT add_column_if_not_exists('tomoris', 'webhook_avatar_url', 'TEXT');
-- alter_triggers: Trigger words for alter personas (main personas use tomori_configs.trigger_words)
SELECT add_column_if_not_exists('tomoris', 'alter_triggers', 'TEXT[]', 'ARRAY[]::TEXT[]');
-- persona_lineage_id: Shared identity namespace for cross-server personal memory pooling
SELECT add_column_if_not_exists('tomoris', 'persona_lineage_id', 'BIGINT');
-- nai_tags: Imageboard-style character tags for NovelAI self-portrait generation
SELECT add_column_if_not_exists('tomoris', 'nai_tags', 'TEXT[]', 'ARRAY[]::TEXT[]');

-- Create lineage sequence (start high so reserved low IDs stay available)
CREATE SEQUENCE IF NOT EXISTS persona_lineage_id_seq
	INCREMENT BY 1
	MINVALUE 10000
	START WITH 10000;

-- Backfill missing lineage IDs for existing personas
DO $$
BEGIN
	UPDATE tomoris
	SET persona_lineage_id = nextval('persona_lineage_id_seq')
	WHERE persona_lineage_id IS NULL;
END $$;

-- Ensure future personas get lineage IDs automatically
ALTER TABLE tomoris
	ALTER COLUMN persona_lineage_id SET DEFAULT nextval('persona_lineage_id_seq');
ALTER TABLE tomoris
	ALTER COLUMN persona_lineage_id SET NOT NULL;

-- Ensure sequence advances beyond highest existing lineage or reserved floor
SELECT setval(
	'persona_lineage_id_seq',
	GREATEST((SELECT COALESCE(MAX(persona_lineage_id), 0) FROM tomoris), 10000),
	true
);

-- Drop old unique constraint on server_id (allows multiple personas per server)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tomoris_server_id_key'
    ) THEN
        ALTER TABLE tomoris DROP CONSTRAINT tomoris_server_id_key;
        RAISE NOTICE 'Dropped unique constraint tomoris_server_id_key to allow multiple personas per server';
    END IF;
END $$;

-- Create index for efficient multi-persona queries (main persona is queried frequently)
CREATE INDEX IF NOT EXISTS idx_tomoris_server_is_alter ON tomoris(server_id, is_alter);
CREATE INDEX IF NOT EXISTS idx_tomoris_persona_lineage_id ON tomoris(persona_lineage_id);

-- Normalize legacy duplicate persona names within a server before enforcing uniqueness.
-- Keep the highest-priority row unchanged (main persona first, then most-recent),
-- and append a deterministic suffix to lower-priority duplicates.
WITH ranked_persona_names AS (
	SELECT
		tomori_id,
		server_id,
		ROW_NUMBER() OVER (
			PARTITION BY server_id, lower(btrim(tomori_nickname))
			ORDER BY is_alter ASC, updated_at DESC NULLS LAST, tomori_id DESC
		) AS name_rank
	FROM tomoris
)
UPDATE tomoris t
SET tomori_nickname = t.tomori_nickname || ' [dup-' || t.tomori_id::TEXT || ']'
FROM ranked_persona_names r
WHERE t.tomori_id = r.tomori_id
  AND r.name_rank > 1;

-- Hard guardrail: persona names must be unique per server (case-insensitive, trimmed).
CREATE UNIQUE INDEX IF NOT EXISTS idx_tomoris_server_nickname_ci_unique
ON tomoris(server_id, lower(btrim(tomori_nickname)));

CREATE TABLE IF NOT EXISTS llms (
  llm_id SERIAL PRIMARY KEY,
  llm_provider TEXT NOT NULL,
  llm_codename TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SELECT add_column_if_not_exists('llms', 'is_smartest', 'BOOLEAN', 'false');
SELECT add_column_if_not_exists('llms', 'is_default', 'BOOLEAN', 'false');
SELECT add_column_if_not_exists('llms', 'is_reasoning', 'BOOLEAN', 'false');
SELECT add_column_if_not_exists('llms', 'is_deprecated', 'BOOLEAN', 'false');
SELECT add_column_if_not_exists('llms', 'is_free', 'BOOLEAN', 'false');
SELECT add_column_if_not_exists('llms', 'has_tools', 'BOOLEAN', 'false');
SELECT add_column_if_not_exists('llms', 'sees_images', 'BOOLEAN', 'false');
SELECT add_column_if_not_exists('llms', 'sees_videos', 'BOOLEAN', 'false');
SELECT add_column_if_not_exists('llms', 'sees_youtube', 'BOOLEAN', 'false');
SELECT add_column_if_not_exists('llms', 'is_uncensored', 'BOOLEAN', 'false');
SELECT add_column_if_not_exists('llms', 'supports_structoutput', 'BOOLEAN', 'false');
SELECT add_column_if_not_exists('llms', 'llm_description', 'TEXT');
SELECT add_column_if_not_exists('llms', 'ja_description', 'TEXT');


-- Removed updated_at trigger for llms table (static metadata, rarely changes)
DROP TRIGGER IF EXISTS update_llms_timestamp ON llms;

-- Image Diffusion Models table for image generation models 
CREATE TABLE IF NOT EXISTS image_diffusion_models (
  diffusion_model_id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  codename TEXT NOT NULL UNIQUE,
  model_description TEXT,
  ja_description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_deprecated BOOLEAN DEFAULT false,
  is_free BOOLEAN DEFAULT false,
  is_uncensored BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Removed updated_at trigger for image_diffusion_models table (static metadata, rarely changes)
DROP TRIGGER IF EXISTS update_image_diffusion_models_timestamp ON image_diffusion_models;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_image_diffusion_models_provider ON image_diffusion_models(provider);
CREATE INDEX IF NOT EXISTS idx_image_diffusion_models_default ON image_diffusion_models(is_default, is_deprecated);

-- Embedding Models table for document embedding/search
CREATE TABLE IF NOT EXISTS embedding_models (
  embedding_model_id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  codename TEXT NOT NULL UNIQUE,
  model_family TEXT NOT NULL,
  model_description TEXT,
  ja_description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_deprecated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Removed updated_at trigger for embedding_models table (static metadata, rarely changes)
DROP TRIGGER IF EXISTS update_embedding_models_timestamp ON embedding_models;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_embedding_models_provider ON embedding_models(provider);
CREATE INDEX IF NOT EXISTS idx_embedding_models_default ON embedding_models(is_default, is_deprecated);
CREATE INDEX IF NOT EXISTS idx_embedding_models_family ON embedding_models(model_family);

CREATE TABLE IF NOT EXISTS tomori_configs (
  tomori_config_id SERIAL PRIMARY KEY,
  tomori_id INT UNIQUE, -- Legacy pointer (nullable; server_id is the primary linkage)
  server_id INT, -- Server-scoped config (nullable for legacy rows)
  llm_id INT NOT NULL,
  embedding_model_id INT,
  llm_temperature REAL NOT NULL DEFAULT 1.5 CHECK (llm_temperature >= 1.0 AND llm_temperature <= 2.0),
  api_key BYTEA, -- encrypted
  trigger_words TEXT[] DEFAULT '{}',
  autoch_disc_ids TEXT[] DEFAULT '{}',
  autoch_threshold INT DEFAULT 0, -- set to 0 for no autoch
	server_memteaching_enabled BOOLEAN DEFAULT true,
	attribute_memteaching_enabled BOOLEAN DEFAULT false,
  sampledialogue_memteaching_enabled BOOLEAN DEFAULT false,
  self_teaching_enabled BOOLEAN DEFAULT true,
  personal_memories_enabled BOOLEAN DEFAULT true,
  imagegen_enabled BOOLEAN DEFAULT true,
  videogen_enabled BOOLEAN DEFAULT true,
  humanizer_degree INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tomori_id) REFERENCES tomoris(tomori_id) ON DELETE SET NULL,
  FOREIGN KEY (llm_id) REFERENCES llms(llm_id) ON DELETE RESTRICT
);

-- Persona-scoped config table (trigger words + optional persona prompt)
CREATE TABLE IF NOT EXISTS persona_configs (
  tomori_id INT PRIMARY KEY,
  trigger_words TEXT[] DEFAULT '{}',
  persona_prompt TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tomori_id) REFERENCES tomoris(tomori_id) ON DELETE CASCADE
);

-- Create updated_at trigger for persona_configs table
DROP TRIGGER IF EXISTS update_persona_configs_timestamp ON persona_configs;
CREATE TRIGGER update_persona_configs_timestamp
BEFORE UPDATE ON persona_configs
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Backfill persona_configs trigger words from legacy locations
INSERT INTO persona_configs (tomori_id, trigger_words)
SELECT
	t.tomori_id,
	CASE
		WHEN t.is_alter THEN COALESCE(t.alter_triggers, ARRAY[]::TEXT[])
		ELSE COALESCE(tc_server.trigger_words, tc_legacy.trigger_words, ARRAY[]::TEXT[])
	END AS trigger_words
FROM tomoris t
LEFT JOIN LATERAL (
	SELECT trigger_words
	FROM tomori_configs
	WHERE server_id = t.server_id
	ORDER BY updated_at DESC NULLS LAST, tomori_config_id DESC
	LIMIT 1
) tc_server ON true
LEFT JOIN LATERAL (
	SELECT trigger_words
	FROM tomori_configs
	WHERE tomori_id = t.tomori_id
	ORDER BY updated_at DESC NULLS LAST, tomori_config_id DESC
	LIMIT 1
) tc_legacy ON true
ON CONFLICT (tomori_id) DO NOTHING;

-- Add server_id column for server-scoped configs (January 2026)
SELECT add_column_if_not_exists('tomori_configs', 'server_id', 'INTEGER');

-- Add hide_impersonation_embeds permission (February 2026)
SELECT add_column_if_not_exists('tomori_configs', 'hide_impersonation_embeds', 'BOOLEAN', 'false');

-- Allow tomori_id to be nullable and prevent cascade deletes from removing server-scoped config
DO $$
DECLARE
    fk_delete_action CHAR;
BEGIN
    -- Drop NOT NULL if present
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tomori_configs'
        AND column_name = 'tomori_id'
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE tomori_configs ALTER COLUMN tomori_id DROP NOT NULL;
    END IF;

    -- Detect current FK delete action (if any)
    SELECT confdeltype INTO fk_delete_action
    FROM pg_constraint
    WHERE conname = 'tomori_configs_tomori_id_fkey';

    -- Recreate FK with ON DELETE SET NULL if needed
    IF fk_delete_action IS NULL OR fk_delete_action <> 'n' THEN
        ALTER TABLE tomori_configs DROP CONSTRAINT IF EXISTS tomori_configs_tomori_id_fkey;
        ALTER TABLE tomori_configs
        ADD CONSTRAINT tomori_configs_tomori_id_fkey
        FOREIGN KEY (tomori_id)
        REFERENCES tomoris(tomori_id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- Backfill server_id for main persona configs (legacy rows)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tomori_configs' AND column_name = 'server_id'
    ) THEN
        UPDATE tomori_configs tc
        SET server_id = t.server_id
        FROM tomoris t
        WHERE tc.server_id IS NULL
          AND tc.tomori_id = t.tomori_id
          AND t.is_alter = false;
    END IF;
END $$;

-- Add foreign key to servers for server-scoped config
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tomori_configs_server_id_fkey'
    ) THEN
        ALTER TABLE tomori_configs
        ADD CONSTRAINT tomori_configs_server_id_fkey
        FOREIGN KEY (server_id)
        REFERENCES servers(server_id)
        ON DELETE CASCADE;
    END IF;
END $$;

-- Create unique index on server_id if no duplicates (NULLs allowed)
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT server_id
        FROM tomori_configs
        WHERE server_id IS NOT NULL
        GROUP BY server_id
        HAVING COUNT(*) > 1
    ) duplicates;

    IF duplicate_count = 0 THEN
        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_tomori_configs_server_id_unique ON tomori_configs(server_id) WHERE server_id IS NOT NULL';
    ELSE
        RAISE NOTICE 'Skipped unique index on tomori_configs.server_id due to duplicates';
    END IF;
END $$;

-- Non-unique index for server_id lookups (fallback if unique index skipped)
CREATE INDEX IF NOT EXISTS idx_tomori_configs_server_id ON tomori_configs(server_id);

-- Add columns for emoji and sticker usage permissions (May 5, 2025)
SELECT add_column_if_not_exists('tomori_configs', 'emoji_usage_enabled', 'BOOLEAN', 'true');
SELECT add_column_if_not_exists('tomori_configs', 'sticker_usage_enabled', 'BOOLEAN', 'true');

-- Add timezone offset column for server-wide timezone configuration 
SELECT add_column_if_not_exists('tomori_configs', 'timezone_offset', 'INTEGER', '0');

-- Rename google_search_enabled to web_search_enabled for Brave Search integration 
SELECT add_column_if_not_exists('tomori_configs', 'web_search_enabled', 'BOOLEAN', 'true');

-- Add pin message permission (November 2025)
SELECT add_column_if_not_exists('tomori_configs', 'pin_message_enabled', 'BOOLEAN', 'true');

-- Add image generation permission
SELECT add_column_if_not_exists('tomori_configs', 'imagegen_enabled', 'BOOLEAN', 'true');

-- Add hide respond embed permission (January 2026)
SELECT add_column_if_not_exists('tomori_configs', 'hide_respond_embed', 'BOOLEAN', 'false');

-- Add uncensor feature toggles (February 2026)
SELECT add_column_if_not_exists('tomori_configs', 'uncensor_injection_enabled', 'BOOLEAN', 'false');
SELECT add_column_if_not_exists('tomori_configs', 'uncensor_unicode_space_enabled', 'BOOLEAN', 'false');
SELECT add_column_if_not_exists('tomori_configs', 'uncensor_sanitize_enabled', 'BOOLEAN', 'false');

-- Add video generation permission (future use)
SELECT add_column_if_not_exists('tomori_configs', 'videogen_enabled', 'BOOLEAN', 'true');

-- Add diffusion model reference for image generation 
SELECT add_column_if_not_exists('tomori_configs', 'diffusion_model_id', 'INTEGER');

-- Add embedding model reference for document embedding
SELECT add_column_if_not_exists('tomori_configs', 'embedding_model_id', 'INTEGER');

-- Add custom system prompt column (December 2025)
SELECT add_column_if_not_exists('tomori_configs', 'system_prompt', 'TEXT', 'NULL');

-- Add message trigger cooldown columns (January 2026)
-- cooldown_type: 0=off, 1=per-user, 2=per-channel, 3=server-wide (managers exempt), 4=strict server-wide
SELECT add_column_if_not_exists('tomori_configs', 'cooldown_type', 'INTEGER', '0');
-- cooldown_length: Duration in seconds (1-86400, default 5)
SELECT add_column_if_not_exists('tomori_configs', 'cooldown_length', 'INTEGER', '5');

-- Self-reply chain limit for persona-to-persona triggering (January 2026)
-- 0 = disabled, default 3, max 10 enforced by command validation
SELECT add_column_if_not_exists('tomori_configs', 'self_reply_limit', 'INTEGER', '3');

-- Per-message multi-persona trigger cap (February 2026)
-- Minimum 1, default 3, max 10 enforced by command validation
SELECT add_column_if_not_exists('tomori_configs', 'triggered_persona_limit', 'INTEGER', '3');

-- Add custom endpoint URL for self-hosted OpenAI-compatible LLM endpoints (January 2026)
-- Only used when llm_provider is 'custom', blocked in production environment
SELECT add_column_if_not_exists('tomori_configs', 'custom_endpoint_url', 'TEXT');

-- Add custom model name for custom endpoints (January 2026)
-- Stores the actual model name for endpoints that require exact model names (e.g., Ollama's "gemma3:latest")
-- Optional field - if empty, provider will fall back to llm_codename
SELECT add_column_if_not_exists('tomori_configs', 'custom_model_name', 'TEXT');

-- Add RP channel IDs for per-channel emoji/sticker suppression (February 2026)
-- Channels in this list always suppress emojis and stickers regardless of global settings
SELECT add_column_if_not_exists('tomori_configs', 'rp_channel_ids', 'TEXT[]', 'ARRAY[]::TEXT[]');

-- Add foreign key constraint if the column was just created
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tomori_configs_diffusion_model_id_fkey'
    ) THEN
        ALTER TABLE tomori_configs
        ADD CONSTRAINT tomori_configs_diffusion_model_id_fkey
        FOREIGN KEY (diffusion_model_id)
        REFERENCES image_diffusion_models(diffusion_model_id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- Add foreign key constraint for embedding model if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tomori_configs_embedding_model_id_fkey'
    ) THEN
        ALTER TABLE tomori_configs
        ADD CONSTRAINT tomori_configs_embedding_model_id_fkey
        FOREIGN KEY (embedding_model_id)
        REFERENCES embedding_models(embedding_model_id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- Migrate existing google_search_enabled values to web_search_enabled if the old column exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'tomori_configs' AND column_name = 'google_search_enabled') THEN
        -- Copy values from old column to new column
        UPDATE tomori_configs 
        SET web_search_enabled = google_search_enabled 
        WHERE web_search_enabled IS NULL OR web_search_enabled != google_search_enabled;
        
        -- Drop the old column
        ALTER TABLE tomori_configs DROP COLUMN IF EXISTS google_search_enabled;
        RAISE NOTICE 'Migrated google_search_enabled to web_search_enabled and dropped old column';
    END IF;
END $$;

-- Create updated_at trigger for tomori_configs table
DROP TRIGGER IF EXISTS update_tomori_configs_timestamp ON tomori_configs;
CREATE TRIGGER update_tomori_configs_timestamp
BEFORE UPDATE ON tomori_configs
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TABLE IF NOT EXISTS tomori_presets (
  tomori_preset_id SERIAL PRIMARY KEY,
  tomori_preset_name TEXT NOT NULL UNIQUE,
  tomori_preset_desc TEXT NOT NULL,
  preset_attribute_list TEXT[] DEFAULT '{}',
  preset_sample_dialogues_in TEXT[] DEFAULT '{}', -- array index is soft id of sample dialogue pairs
  preset_sample_dialogues_out TEXT[] DEFAULT '{}',
  preset_language TEXT NOT NULL,
  preset_trigger_words TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Removed updated_at trigger for tomori_presets table (static metadata, rarely changes)
DROP TRIGGER IF EXISTS update_tomori_presets_timestamp ON tomori_presets;

-- Add preset avatar path column for profile pictures 
SELECT add_column_if_not_exists('tomori_presets', 'preset_avatar_path', 'TEXT');
SELECT add_column_if_not_exists('tomori_presets', 'preset_trigger_words', 'TEXT[]', 'ARRAY[]::TEXT[]');

-- Table: system_prompt_presets
-- Purpose: Store pre-made system prompt presets that users can apply
CREATE TABLE IF NOT EXISTS system_prompt_presets (
  system_prompt_preset_id SERIAL PRIMARY KEY,
  system_prompt_preset_name TEXT NOT NULL UNIQUE,
  system_prompt_preset_desc TEXT NOT NULL,
  ja_description TEXT,
  preset_prompt_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Removed updated_at trigger for system_prompt_presets table (static metadata, rarely changes)
DROP TRIGGER IF EXISTS update_system_prompt_presets_timestamp ON system_prompt_presets;

CREATE TABLE IF NOT EXISTS server_emojis (
  server_emoji_id SERIAL PRIMARY KEY,
  server_id INT NOT NULL,
  emoji_disc_id TEXT NOT NULL,
  emoji_name TEXT NOT NULL, -- e.g. TomoriGiggle -- Combine with emoji_disc_id for <:TomoriGiggle:123456789>
  emoji_desc TEXT DEFAULT '', -- Visual description of emoji (generated by LLM via /server emojis initialize)
  emotion_key TEXT, -- e.g. "joy", "sadness", "anger" (28 emotion categories, nullable if not initialized)
  is_global BOOLEAN DEFAULT false, -- If emoji is a Tomori global
  is_animated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (server_id, emoji_disc_id),
  FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Add emoji_desc column for LLM-generated visual descriptions (December 2025)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'server_emojis'
        AND column_name = 'emoji_desc'
    ) THEN
        ALTER TABLE server_emojis ADD COLUMN emoji_desc TEXT DEFAULT '';
        RAISE NOTICE 'Added server_emojis.emoji_desc column';
    END IF;
END $$;

-- Migrate emotion_key to nullable for graceful degradation (December 2025)
-- This allows emojis without initialization to still function (name-only)
DO $$
BEGIN
    -- Check if emotion_key is currently NOT NULL
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'server_emojis'
        AND column_name = 'emotion_key'
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE server_emojis ALTER COLUMN emotion_key DROP NOT NULL;
        RAISE NOTICE 'Made server_emojis.emotion_key nullable';
    END IF;
END $$;

-- Removed updated_at trigger for server_emojis table (uses DELETE+INSERT refresh pattern, not real updates)
DROP TRIGGER IF EXISTS update_server_emojis_timestamp ON server_emojis;

CREATE TABLE IF NOT EXISTS server_stickers (
  server_sticker_id SERIAL PRIMARY KEY,
  server_id INT NOT NULL,
  sticker_disc_id TEXT NOT NULL,
  sticker_name TEXT NOT NULL, -- e.g. Send as message payload
  sticker_desc TEXT DEFAULT '', -- Visual description of sticker (generated by LLM via /server stickers initialize)
  emotion_key TEXT, -- e.g. "joy", "sadness", "anger" (28 emotion categories, nullable if not initialized)
  is_global BOOLEAN DEFAULT false, -- If sticker is a Tomori global
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (server_id, sticker_disc_id),
  FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

SELECT add_column_if_not_exists('server_stickers', 'sticker_format', 'INT', '1'); -- Default to PNG (1)
-- Drop the old is_animated column from server_stickers (May 5, 2025)
SELECT drop_column_if_exists('server_stickers', 'is_animated');

-- Migrate emotion_key to nullable for graceful degradation (December 2025)
-- This allows stickers without initialization to still function (name-only)
DO $$
BEGIN
    -- Check if emotion_key is currently NOT NULL
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'server_stickers'
        AND column_name = 'emotion_key'
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE server_stickers ALTER COLUMN emotion_key DROP NOT NULL;
        RAISE NOTICE 'Made server_stickers.emotion_key nullable';
    END IF;
END $$;

-- Removed updated_at trigger for server_stickers table (uses DELETE+INSERT refresh pattern, not real updates)
DROP TRIGGER IF EXISTS update_server_stickers_timestamp ON server_stickers;

CREATE TABLE IF NOT EXISTS users (
  user_id SERIAL PRIMARY KEY,
  user_disc_id TEXT UNIQUE NOT NULL,
  user_nickname TEXT NOT NULL,
  language_pref TEXT DEFAULT 'en',
  personal_memories TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_disc_id ON users(user_disc_id);

-- Add registration_locale column for user region analytics
SELECT add_column_if_not_exists('users', 'registration_locale', 'TEXT');

-- Add cross-server short-term memory sharing opt-in (Phase 1: Short-term memory system)
SELECT add_column_if_not_exists('users', 'shortterm_cache_crossserver_opt_in', 'BOOLEAN', 'false');

-- Create updated_at trigger for users table
DROP TRIGGER IF EXISTS update_users_timestamp ON users;
CREATE TRIGGER update_users_timestamp
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Migration: Convert privacy_opt_out (BOOLEAN) to privacy_level (INTEGER)
-- Level 0 = MINIMAL privacy (full features, opted in), Level 1 = PARTIAL, Level 2 = FULL privacy (opted out)
DO $$
BEGIN
    -- Step 1: Add privacy_level column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'privacy_level'
    ) THEN
        ALTER TABLE users ADD COLUMN privacy_level INTEGER DEFAULT 0;
        RAISE NOTICE 'Added users.privacy_level column';
    END IF;

    -- Step 2: Migrate existing data from privacy_opt_out (only if old column exists)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'privacy_opt_out'
    ) THEN
        UPDATE users
        SET privacy_level = CASE
            WHEN privacy_opt_out = true THEN 2  -- Opted out → FULL privacy
            WHEN privacy_opt_out = false THEN 0  -- Opted in → MINIMAL privacy
            ELSE 0  -- Default to MINIMAL for NULL values
        END
        WHERE privacy_opt_out IS NOT NULL;

        RAISE NOTICE 'Migrated privacy_opt_out to privacy_level';

        -- Step 3: Drop old column after successful migration
        ALTER TABLE users DROP COLUMN IF EXISTS privacy_opt_out;
        RAISE NOTICE 'Dropped deprecated privacy_opt_out column';
    END IF;

    -- Step 4: Ensure privacy_level has NOT NULL constraint and valid range
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'privacy_level'
        AND is_nullable = 'YES'
    ) THEN
        -- Set default for existing NULL values
        UPDATE users SET privacy_level = 0 WHERE privacy_level IS NULL;

        -- Add NOT NULL constraint
        ALTER TABLE users ALTER COLUMN privacy_level SET NOT NULL;

        -- Add CHECK constraint for valid levels (0, 1, 2)
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_privacy_level_check;
        ALTER TABLE users ADD CONSTRAINT users_privacy_level_check
            CHECK (privacy_level IN (0, 1, 2));

        RAISE NOTICE 'Applied constraints to privacy_level column';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS server_memories (
  server_memory_id SERIAL PRIMARY KEY,
  server_id INT NOT NULL,
  tomori_id INT, -- Optional persona pointer for attribution (set to NULL if persona deleted)
  persona_lineage_id BIGINT NOT NULL, -- Shared persona identity for memory continuity across remove/re-import
  user_id INT, -- Creator of this server memory (nullable - set to NULL if user deleted)
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Add tomori_id column for existing databases
SELECT add_column_if_not_exists('server_memories', 'tomori_id', 'INTEGER');
-- Add lineage scope column for existing databases
SELECT add_column_if_not_exists('server_memories', 'persona_lineage_id', 'BIGINT');

-- Backfill server memories to the current main persona for each server
DO $$
BEGIN
	UPDATE server_memories sm
	SET tomori_id = main.tomori_id
	FROM (
		SELECT DISTINCT ON (server_id)
			server_id,
			tomori_id
		FROM tomoris
		WHERE is_alter = false
		ORDER BY server_id, updated_at DESC NULLS LAST, tomori_id DESC
	) main
	WHERE sm.tomori_id IS NULL
	  AND sm.server_id = main.server_id;
END $$;

-- Backfill server_memories.persona_lineage_id from linked persona rows
DO $$
BEGIN
	UPDATE server_memories sm
	SET persona_lineage_id = t.persona_lineage_id
	FROM tomoris t
	WHERE sm.persona_lineage_id IS NULL
	  AND sm.tomori_id = t.tomori_id;
END $$;

-- Backfill any remaining lineage NULLs to each server's current main persona lineage
DO $$
BEGIN
	UPDATE server_memories sm
	SET persona_lineage_id = main.persona_lineage_id
	FROM (
		SELECT DISTINCT ON (server_id)
			server_id,
			persona_lineage_id
		FROM tomoris
		WHERE is_alter = false
		ORDER BY server_id, updated_at DESC NULLS LAST, tomori_id DESC
	) main
	WHERE sm.persona_lineage_id IS NULL
	  AND sm.server_id = main.server_id;
END $$;

-- Final fallback for unusual servers without a current main persona
DO $$
BEGIN
	UPDATE server_memories sm
	SET persona_lineage_id = fallback.persona_lineage_id
	FROM (
		SELECT DISTINCT ON (server_id)
			server_id,
			persona_lineage_id
		FROM tomoris
		ORDER BY server_id, is_alter ASC, updated_at DESC NULLS LAST, tomori_id DESC
	) fallback
	WHERE sm.persona_lineage_id IS NULL
	  AND sm.server_id = fallback.server_id;
END $$;

-- Guard against orphaned persona pointers before enforcing tomori FK
UPDATE server_memories sm
SET tomori_id = NULL
WHERE sm.tomori_id IS NOT NULL
  AND NOT EXISTS (
  	SELECT 1
  	FROM tomoris t
  	WHERE t.tomori_id = sm.tomori_id
  );

-- Enforce NOT NULL only when all rows have been backfilled
DO $$
DECLARE
	unresolved_count INTEGER;
BEGIN
	SELECT COUNT(*) INTO unresolved_count
	FROM server_memories
	WHERE persona_lineage_id IS NULL;

	IF unresolved_count = 0 THEN
		ALTER TABLE server_memories
		ALTER COLUMN persona_lineage_id SET NOT NULL;
	ELSE
		RAISE NOTICE 'Skipping NOT NULL on server_memories.persona_lineage_id: % unresolved rows remain', unresolved_count;
	END IF;
END $$;

-- Ensure FK for server_memories.tomori_id exists with ON DELETE SET NULL
DO $$
DECLARE
	fk_delete_action CHAR;
BEGIN
	SELECT c.confdeltype
	INTO fk_delete_action
	FROM pg_constraint c
	WHERE c.conname = 'server_memories_tomori_id_fkey'
	LIMIT 1;

	IF fk_delete_action IS NULL THEN
		ALTER TABLE server_memories
		ADD CONSTRAINT server_memories_tomori_id_fkey
		FOREIGN KEY (tomori_id)
		REFERENCES tomoris(tomori_id)
		ON DELETE SET NULL;
	ELSIF fk_delete_action <> 'n' THEN
		ALTER TABLE server_memories
		DROP CONSTRAINT server_memories_tomori_id_fkey;
		ALTER TABLE server_memories
		ADD CONSTRAINT server_memories_tomori_id_fkey
		FOREIGN KEY (tomori_id)
		REFERENCES tomoris(tomori_id)
		ON DELETE SET NULL;
	END IF;
END $$;

-- Removed updated_at trigger for server_memories table (never updated after creation, only INSERT/DELETE)
DROP TRIGGER IF EXISTS update_server_memories_timestamp ON server_memories;
CREATE INDEX IF NOT EXISTS idx_server_memories_tomori_id ON server_memories(tomori_id);
CREATE INDEX IF NOT EXISTS idx_server_memories_tomori_created_at ON server_memories(tomori_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_server_memories_lineage_id ON server_memories(persona_lineage_id);
CREATE INDEX IF NOT EXISTS idx_server_memories_server_lineage_created_at ON server_memories(server_id, persona_lineage_id, created_at DESC);

-- Dedicated personal memories table (lineage-scoped)
CREATE TABLE IF NOT EXISTS personal_memories (
  personal_memory_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  persona_lineage_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Create updated_at trigger for personal_memories table
DROP TRIGGER IF EXISTS update_personal_memories_timestamp ON personal_memories;
CREATE TRIGGER update_personal_memories_timestamp
BEFORE UPDATE ON personal_memories
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Backfill existing users.personal_memories into global personal namespace (lineage 0)
INSERT INTO personal_memories (user_id, persona_lineage_id, content, created_at, updated_at)
SELECT
	u.user_id,
	0::BIGINT,
	legacy_memory,
	COALESCE(u.updated_at, CURRENT_TIMESTAMP),
	COALESCE(u.updated_at, CURRENT_TIMESTAMP)
FROM users u
CROSS JOIN LATERAL unnest(COALESCE(u.personal_memories, ARRAY[]::TEXT[])) AS legacy_memory
WHERE NOT EXISTS (
	SELECT 1
	FROM personal_memories pm
	WHERE pm.user_id = u.user_id
	  AND pm.persona_lineage_id = 0
);

CREATE INDEX IF NOT EXISTS idx_personal_memories_user_lineage_created_at
ON personal_memories(user_id, persona_lineage_id, created_at DESC);

-- Document/RAG schema is loaded separately when RAG is enabled

CREATE TABLE IF NOT EXISTS personalization_blacklist (
  server_id INT NOT NULL,
  user_disc_id TEXT NOT NULL, -- Discord ID of user who opted out (persists even if user deletes account)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (server_id, user_disc_id), -- composite key
  FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Create updated_at trigger for personalization_blacklist table
DROP TRIGGER IF EXISTS update_personalization_blacklist_timestamp ON personalization_blacklist;
CREATE TRIGGER update_personalization_blacklist_timestamp
BEFORE UPDATE ON personalization_blacklist
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Channel Whitelist Table
-- Stores per-channel cooldown overrides for server-wide whitelist system
-- When ANY channel is whitelisted, ONLY whitelisted channels can trigger the bot
CREATE TABLE IF NOT EXISTS channel_whitelist (
	server_id INT NOT NULL,
	channel_disc_id TEXT NOT NULL,
	cooldown_type INT NOT NULL DEFAULT 0,
	cooldown_length INT NOT NULL DEFAULT 0,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (server_id, channel_disc_id),
	FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Create indexes for channel_whitelist
CREATE INDEX IF NOT EXISTS idx_channel_whitelist_server ON channel_whitelist(server_id);
CREATE INDEX IF NOT EXISTS idx_channel_whitelist_active ON channel_whitelist(server_id, cooldown_length) WHERE cooldown_length > 0;

-- Create updated_at trigger for channel_whitelist table
DROP TRIGGER IF EXISTS update_channel_whitelist_timestamp ON channel_whitelist;
CREATE TRIGGER update_channel_whitelist_timestamp
BEFORE UPDATE ON channel_whitelist
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TABLE IF NOT EXISTS error_logs (
  error_log_id SERIAL PRIMARY KEY,
  -- Context IDs - Made nullable as errors can happen outside these contexts
  tomori_id INT NULL,
  user_id INT NULL,
  server_id INT NULL,
  -- Error Details
  error_type TEXT NOT NULL DEFAULT 'GenericError', -- Type/category of error
  error_message TEXT NOT NULL,                     -- Main error message
  stack_trace TEXT NULL,                           -- Dedicated column for stack trace
  error_metadata JSONB DEFAULT '{}',               -- Flexible JSON for extra context
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Foreign Keys - Changed to SET NULL to preserve logs even if related entity is deleted
  FOREIGN KEY (tomori_id) REFERENCES tomoris(tomori_id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE SET NULL
);

-- Removed updated_at trigger for error_logs table (error logging disabled, table no longer actively used)
DROP TRIGGER IF EXISTS update_error_logs_timestamp ON error_logs;

-- ============================================================================
-- COOLDOWNS TABLE MIGRATION
-- Migrates from "creative key mapping" to explicit columns
-- Safe to run repeatedly (idempotent)
-- ============================================================================

-- Drop old cooldowns table if it has the old schema (check for command_category column)
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_name = 'cooldowns'
		AND column_name = 'command_category'
	) THEN
		DROP TABLE IF EXISTS cooldowns CASCADE;
		RAISE NOTICE 'Dropped old cooldowns table (migration to explicit schema)';
	END IF;
END $$;

-- Create new cooldowns table with explicit columns
CREATE UNLOGGED TABLE IF NOT EXISTS cooldowns (
	cooldown_id SERIAL,
	cooldown_type INT NOT NULL,                -- CooldownType enum (1-5)
	server_disc_id TEXT,                       -- Server/guild ID (for types 1-4)
	user_disc_id TEXT,                         -- User ID (populated for PER_USER and COMMAND_CATEGORY)
	channel_disc_id TEXT,                      -- Channel ID (populated for PER_CHANNEL)
	command_category TEXT,                     -- Command category (populated for COMMAND_CATEGORY type 5)
	expiry_time BIGINT NOT NULL,               -- Unix timestamp in milliseconds
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add command_category column to existing tables (migration for Phase 1 users)
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_name = 'cooldowns'
		AND column_name = 'command_category'
	) THEN
		ALTER TABLE cooldowns ADD COLUMN command_category TEXT;
		RAISE NOTICE 'Added command_category column to cooldowns table';
	END IF;
END $$;

-- Make server_disc_id nullable for existing tables (migration for Phase 1 users)
DO $$
BEGIN
	-- Check if server_disc_id is currently NOT NULL
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_name = 'cooldowns'
		AND column_name = 'server_disc_id'
		AND is_nullable = 'NO'
	) THEN
		ALTER TABLE cooldowns ALTER COLUMN server_disc_id DROP NOT NULL;
		RAISE NOTICE 'Made server_disc_id nullable in cooldowns table';
	END IF;
END $$;

-- Drop old unique index if it exists (before recreating with new columns)
DROP INDEX IF EXISTS uq_cooldown_scope;

-- Unique index for UPSERT operations (handles NULLs properly)
-- This ensures one cooldown entry per unique combination of type + scope
CREATE UNIQUE INDEX uq_cooldown_scope
	ON cooldowns (
		cooldown_type,
		COALESCE(server_disc_id, ''),
		COALESCE(user_disc_id, ''),
		COALESCE(channel_disc_id, ''),
		COALESCE(command_category, '')
	);

-- Performance indexes for cooldown queries
CREATE INDEX IF NOT EXISTS idx_cooldowns_expiry
	ON cooldowns(expiry_time);

CREATE INDEX IF NOT EXISTS idx_cooldowns_user
	ON cooldowns(user_disc_id, server_disc_id)
	WHERE user_disc_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cooldowns_channel
	ON cooldowns(channel_disc_id)
	WHERE channel_disc_id IS NOT NULL;

-- Function to periodically clean up expired cooldowns
CREATE OR REPLACE FUNCTION cleanup_expired_cooldowns()
RETURNS INTEGER AS $$
DECLARE
	deleted_count INTEGER;
BEGIN
	DELETE FROM cooldowns
	WHERE expiry_time < EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000;

	GET DIAGNOSTICS deleted_count = ROW_COUNT;

	RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Make sure pgcrypto extension is enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Optional API keys table for encrypted storage of optional service credentials per guild
CREATE TABLE IF NOT EXISTS opt_api_keys (
  opt_api_key_id SERIAL PRIMARY KEY,
  server_id INT NOT NULL,                    -- Foreign key to servers table
  service_name TEXT NOT NULL,                -- 'brave-search', 'duckduckgo-search', etc.
  api_key BYTEA,                            -- Encrypted API key using pgcrypto
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (server_id, service_name),         -- One key per service per guild
  FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Create updated_at trigger for opt_api_keys table
DROP TRIGGER IF EXISTS update_opt_api_keys_timestamp ON opt_api_keys;
CREATE TRIGGER update_opt_api_keys_timestamp
BEFORE UPDATE ON opt_api_keys
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- pg_cron setup has been moved to a separate file: src/db/pgcron.sql
-- This allows optional execution based on the environment (production vs development)

-- Reminders table for user reminder functionality
CREATE TABLE IF NOT EXISTS reminders (
  reminder_id SERIAL PRIMARY KEY,
  server_id INT NOT NULL,
  channel_disc_id TEXT NOT NULL,                       -- Discord channel ID where reminder was set
  user_discord_id TEXT NOT NULL,                       -- Target user's Discord ID
  user_nickname TEXT NOT NULL,                         -- Target user's nickname for display
  reminder_purpose TEXT NOT NULL,                      -- What the reminder is for
  reminder_time TIMESTAMP WITH TIME ZONE NOT NULL,     -- When to trigger the reminder
  repetition_interval_hours INTEGER,                   -- Optional: repeat interval in hours for recurring reminders
  self_reminder BOOLEAN DEFAULT false,                 -- Optional: reminder targets the bot itself
  created_by_user_id INT,                              -- User who created this reminder (nullable - set to NULL if user deleted)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- Track which persona created the reminder (January 2026)
SELECT add_column_if_not_exists('reminders', 'persona_id', 'INTEGER');
-- Recurring reminders: optional repeat interval in hours (January 2026)
SELECT add_column_if_not_exists('reminders', 'repetition_interval_hours', 'INTEGER');
-- Self reminders (January 2026)
SELECT add_column_if_not_exists('reminders', 'self_reminder', 'BOOLEAN', 'false');
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'reminders_persona_id_fkey'
    ) THEN
        ALTER TABLE reminders
        ADD CONSTRAINT reminders_persona_id_fkey
        FOREIGN KEY (persona_id)
        REFERENCES tomoris(tomori_id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- Create index for efficient reminder queries
CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(reminder_time);
CREATE INDEX IF NOT EXISTS idx_reminders_server_id ON reminders(server_id);

-- Removed updated_at trigger for reminders table (never updated after creation, only INSERT/DELETE)
DROP TRIGGER IF EXISTS update_reminders_timestamp ON reminders;

-- Drop deprecated columns 
SELECT drop_column_if_exists('tomori_configs', 'teach_cost');
SELECT drop_column_if_exists('tomori_configs', 'gamba_limit');
SELECT drop_column_if_exists('users', 'tomocoins_held');
SELECT drop_column_if_exists('users', 'tomocoins_deposited');

-- Add key_version column to opt_api_keys for encryption key rotation (November 2025)
SELECT add_column_if_not_exists('opt_api_keys', 'key_version', 'INTEGER', '1');
CREATE INDEX IF NOT EXISTS idx_opt_api_keys_version ON opt_api_keys(key_version);

-- Add key_version column to tomori_configs for main API key rotation (November 2025)
SELECT add_column_if_not_exists('tomori_configs', 'key_version', 'INTEGER', '1');
CREATE INDEX IF NOT EXISTS idx_tomori_configs_key_version ON tomori_configs(key_version);

-- API Key Rotation table for load balancing and failover (January 2026)
-- Stores additional API keys for round-robin distribution and automatic failover
CREATE TABLE IF NOT EXISTS api_key_rotation (
  rotation_key_id SERIAL PRIMARY KEY,
  server_id INT NOT NULL,
  provider TEXT NOT NULL,                           -- Must match current provider in tomori_configs
  api_key BYTEA,                                    -- NULL if is_main_key_pointer = true
  key_version INTEGER DEFAULT 1,                    -- Encryption key version
  is_main_key_pointer BOOLEAN DEFAULT false,        -- true = use tomori_configs.api_key instead
  is_enabled BOOLEAN DEFAULT true,                  -- Manual or auto-disabled after errors
  usage_count BIGINT DEFAULT 0,                     -- For round-robin tracking
  error_count INTEGER DEFAULT 0,                    -- Consecutive errors
  last_used_at TIMESTAMP,
  last_error_at TIMESTAMP,                          -- For cooldown logic
  last_error_type TEXT,                             -- 'rate_limit' (60s) or 'api_error' (5min)
  last_error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Only one main key pointer per server (unique partial index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_key_rotation_main_pointer
  ON api_key_rotation(server_id) WHERE is_main_key_pointer = true;

-- Index for efficient key selection queries
CREATE INDEX IF NOT EXISTS idx_api_key_rotation_server_provider
  ON api_key_rotation(server_id, provider, is_enabled);

-- Create updated_at trigger for api_key_rotation table
DROP TRIGGER IF EXISTS update_api_key_rotation_timestamp ON api_key_rotation;
CREATE TRIGGER update_api_key_rotation_timestamp
BEFORE UPDATE ON api_key_rotation
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- ============================================================================
-- IMAGE QUOTA SYSTEM (Phase 3)
-- Prevents image generation abuse with per-user daily and server-wide quotas
-- ============================================================================

-- Server-level quota configuration
CREATE TABLE IF NOT EXISTS image_quota_configs (
	server_id INT PRIMARY KEY,
	daily_user_quota INT NOT NULL DEFAULT 10,                -- Per-user daily limit (0 = unlimited)
	serverwide_quota INT NOT NULL DEFAULT 0,                 -- Total server quota (0 = unlimited)
	serverwide_quota_resets_in INT NOT NULL DEFAULT 365,     -- Days before server quota resets (1-365)
	enabled BOOLEAN NOT NULL DEFAULT true,                   -- Master toggle for quota system
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Migration: Add updated_at column if it doesn't exist (for existing databases)
SELECT add_column_if_not_exists(
	'image_quota_configs',
	'updated_at',
	'TIMESTAMP',
	'CURRENT_TIMESTAMP'
);

-- Create updated_at trigger for image_quota_configs table
DROP TRIGGER IF EXISTS update_image_quota_configs_timestamp ON image_quota_configs;
CREATE TRIGGER update_image_quota_configs_timestamp
BEFORE UPDATE ON image_quota_configs
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- User quota usage tracking (resets daily at midnight server timezone)
CREATE TABLE IF NOT EXISTS image_quotas (
	quota_id SERIAL PRIMARY KEY,
	server_id INT NOT NULL,
	user_disc_id TEXT NOT NULL,                              -- User's Discord ID
	usage_count INT NOT NULL DEFAULT 0,                      -- Images generated today
	quota_date DATE NOT NULL,                                -- Date this quota is for (YYYY-MM-DD)
	last_reset TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	UNIQUE(server_id, user_disc_id, quota_date),
	FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Index for efficient quota lookups
CREATE INDEX IF NOT EXISTS idx_image_quotas_lookup
	ON image_quotas(server_id, user_disc_id, quota_date);

-- Index for cleanup queries (find old quota records)
CREATE INDEX IF NOT EXISTS idx_image_quotas_date
	ON image_quotas(quota_date);

-- Server-wide quota tracking (resets based on serverwide_quota_resets_in)
CREATE TABLE IF NOT EXISTS serverwide_quotas (
	server_id INT PRIMARY KEY,
	usage_count INT NOT NULL DEFAULT 0,                      -- Total images generated this period
	quota_period_start TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	quota_period_end TIMESTAMP NOT NULL,                     -- Calculated from period_start + resets_in days
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (server_id) REFERENCES servers(server_id) ON DELETE CASCADE
);

-- Migration: Rename last_updated to updated_at if needed (for existing databases)
DO $$
BEGIN
    -- Check if last_updated column exists and updated_at doesn't
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'serverwide_quotas' AND column_name = 'last_updated'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'serverwide_quotas' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE serverwide_quotas RENAME COLUMN last_updated TO updated_at;
    END IF;
END $$;

-- Create updated_at trigger for serverwide_quotas table
DROP TRIGGER IF EXISTS update_serverwide_quotas_timestamp ON serverwide_quotas;
CREATE TRIGGER update_serverwide_quotas_timestamp
BEFORE UPDATE ON serverwide_quotas
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Index for cleanup queries (find expired quota periods)
CREATE INDEX IF NOT EXISTS idx_serverwide_quotas_period_end
	ON serverwide_quotas(quota_period_end);

-- Function to clean up old user quota records (older than 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_image_quotas()
RETURNS INTEGER AS $$
DECLARE
	deleted_count INTEGER;
BEGIN
	DELETE FROM image_quotas
	WHERE quota_date < CURRENT_DATE - INTERVAL '7 days';

	GET DIAGNOSTICS deleted_count = ROW_COUNT;

	RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Example usage - This shows how to add columns to existing tables
-- You can add these calls whenever you need to introduce schema changes
-- SELECT add_column_if_not_exists('tomori_configs', 'new_feature_flag', 'BOOLEAN', 'false');
-- SELECT add_column_if_not_exists('users', 'avatar_url', 'TEXT');
-- SELECT add_column_if_not_exists('tomoris', 'response_count', 'INT', '0');
