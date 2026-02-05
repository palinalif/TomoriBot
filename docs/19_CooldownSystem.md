# Cooldown System

## Overview

TomoriBot's cooldown system provides flexible rate-limiting for automatic message trigger responses. The system prevents spam while offering multiple scoping strategies and exemption rules. It uses a PostgreSQL UNLOGGED table for high-performance temporary storage and integrates with the channel whitelist system for granular per-channel control.

## Database Architecture

### Cooldowns Table

**Location:** `src/db/schema.sql:716-721`

```sql
CREATE UNLOGGED TABLE IF NOT EXISTS cooldowns (
	user_disc_id TEXT NOT NULL,
	command_category TEXT NOT NULL,
	expiry_time BIGINT NOT NULL,
	PRIMARY KEY (user_disc_id, command_category)
);
```

**Design Decisions:**

- **UNLOGGED Table**: Optimized for performance (~5-10x faster than logged tables)
	- Data not written to WAL (Write-Ahead Log)
	- No crash recovery (acceptable for temporary cooldown data)
	- No persistent state depends on cooldowns
- **Composite Primary Key**: `(user_disc_id, command_category)` enables atomic UPSERT operations
- **Flexible Keys**: Column names are semantically flexible to support multiple scoping strategies (see Key Mapping Strategy)

**Column Semantics:**

| Column | Type | Purpose |
|--------|------|---------|
| `user_disc_id` | TEXT | Cooldown scope identifier (user/channel/server ID) |
| `command_category` | TEXT | Cooldown type identifier with scope suffix |
| `expiry_time` | BIGINT | Unix timestamp in milliseconds (JavaScript-compatible) |

### Cleanup Function

**Location:** `src/db/schema.sql:724-736`

```sql
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
```

**Purpose:** Removes expired cooldown entries. Returns count of deleted rows.

**Invocation:**
- **Production:** Hourly via pg_cron (see `src/db/pgcron.sql:40-52`)
- **Development:** On application startup (see `src/index.ts:221-237`)

## Cooldown Types

**Location:** `src/types/db/schema.ts:17-23`

```typescript
export enum CooldownType {
	OFF = 0,                    // No cooldown on message triggers (default)
	PER_USER = 1,              // Each user has their own cooldown per server
	PER_CHANNEL = 2,           // Each channel has its own cooldown
	SERVER_WIDE = 3,           // Everyone waits (server managers exempt)
	STRICT_SERVER_WIDE = 4,    // Everyone waits (no exceptions)
}
```

### Scoping Behavior

| Type | Scope | Exemptions | Use Case |
|------|-------|------------|----------|
| **OFF** | None | N/A | No rate limiting |
| **PER_USER** | Per user per server | Managers | Individual user rate limits |
| **PER_CHANNEL** | Per channel | Managers | Channel-specific rate limits |
| **SERVER_WIDE** | Entire server | Managers | Global server cooldown with admin override |
| **STRICT_SERVER_WIDE** | Entire server | None | Absolute global cooldown |

### Manager Exemption Rules

**Who qualifies as "manager":**
- Users with `ManageGuild` Discord permission

**Exemption behavior:**
- **Types 0, 4:** No exemptions apply
- **Types 1-3:** Managers bypass cooldowns
- **Testing override:** Set `DISABLE_COOLDOWN_EXEMPTIONS=true` to disable exemptions

**Implementation:** `src/utils/db/messageCooldown.ts:78-97` (`isExemptFromCooldown`)

## Key Mapping Strategy

To avoid schema proliferation, the cooldown system reuses a single table with creative key mapping:

**Function:** `getCooldownKeyPair(cooldownType, userDiscId, channelDiscId, serverDiscId)`
**Location:** `src/utils/db/messageCooldown.ts:35-68`

| Cooldown Type | `user_disc_id` | `command_category` |
|---------------|----------------|---------------------|
| `PER_USER` | User's Discord ID | `__msg_trigger__${serverId}` |
| `PER_CHANNEL` | Channel's Discord ID | `__msg_trigger_channel__` |
| `SERVER_WIDE` | Server's Discord ID | `__msg_trigger_server__` |
| `STRICT_SERVER_WIDE` | Server's Discord ID | `__msg_trigger_server__` |

**Example:**
- User `123456789` in server `999888777` with `PER_USER` cooldown:
	- `user_disc_id = "123456789"`
	- `command_category = "__msg_trigger__999888777"`

**Rationale:** Single table + flexible keys = no schema changes when adding new cooldown types.

## Configuration

### Database Storage

**Table:** `tomori_configs`
**Location:** `src/types/db/schema.ts:151-152`

| Column | Type | Range | Default | Purpose |
|--------|------|-------|---------|---------|
| `cooldown_type` | INTEGER | 0-4 | 0 (OFF) | Which cooldown strategy to use |
| `cooldown_length` | INTEGER | 1-86400 | 5 | Duration in seconds |

**Schema Migration:**
```sql
SELECT add_column_if_not_exists('tomori_configs', 'cooldown_type', 'INTEGER', '0');
SELECT add_column_if_not_exists('tomori_configs', 'cooldown_length', 'INTEGER', '5');
```

### Slash Command

**Command:** `/config cooldown <type> <length>`
**Location:** `src/commands/config/cooldown.ts`

**Parameters:**
- `cooldown_type` (required): Choice 0-4 with localized labels
- `cooldown_length` (required): Integer 1-86400 seconds

**Validation:**
- Type must be valid enum value (0-4)
- Length must be 1-86400 seconds (1 second to 24 hours)
- Detects no-change scenarios to avoid unnecessary updates
- Zod schema validation on updated data

**Side Effects:**
- Updates `tomori_configs` table
- Invalidates `TomoriStateCache` for the server (5-min TTL)
- Next message fetch gets fresh configuration

## Channel Whitelist Integration

**Table:** `channel_whitelist`
**Location:** `src/db/schema.sql:667-690`

```sql
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
```

### Whitelist Priority Rules

**If ANY channel is whitelisted:**
1. **Non-whitelisted channels:** Blocked completely (treated as 999999s cooldown)
2. **Whitelisted channels:** Use channel-specific `cooldown_type` and `cooldown_length` instead of global settings

**Special Values:**
- `cooldown_type = 0`: Disable cooldowns for this channel
- `cooldown_length = 0`: Instant responses, no cooldown

**Cache:** `channelWhitelistCache` (5-minute TTL)
**Location:** `src/utils/cache/channelWhitelistCache.ts`

### Whitelist Check Flow

```
Message Received
    │
    ├─ Load channel whitelist cache
    │  (channelWhitelistCache)
    │
    ├─ If ANY whitelist exists:
    │  └─ If current channel NOT whitelisted:
    │     └─ BLOCK (infinite cooldown)
    │
    └─ Use channel-specific settings if whitelisted,
       else use global settings
```

## Core API

### Check Cooldown

**Function:** `checkMessageTriggerCooldown(message, config)`
**Location:** `src/utils/db/messageCooldown.ts:105-242`

**Purpose:** Determine if a message is currently on cooldown

**Process:**
1. Check channel whitelist status
2. Block non-whitelisted channels if whitelist exists
3. Determine effective cooldown settings (channel-specific or global)
4. Return "OFF" status if cooldowns disabled
5. Check manager exemption
6. Query database for active cooldown
7. Calculate remaining seconds

**Returns:**
```typescript
interface CooldownCheckResult {
	isOnCooldown: boolean;
	remainingSeconds: number;
	cooldownType: CooldownType;
}
```

**Fail-Safe:** Returns `{ isOnCooldown: false }` if database query fails (fail-open design)

### Set Cooldown

**Function:** `setMessageTriggerCooldown(message, config)`
**Location:** `src/utils/db/messageCooldown.ts:249-330`

**Purpose:** Create/update cooldown entry after successful response

**Process:**
1. Determine effective cooldown settings (same logic as check)
2. Skip if `cooldown_type === OFF`
3. Calculate expiry time: `Date.now() + (cooldownLength * 1000)`
4. UPSERT cooldown row
5. Verify write succeeded

**Database Operation:**
```typescript
await sql`
	INSERT INTO cooldowns (user_disc_id, command_category, expiry_time)
	VALUES (${entityId}, ${category}, ${expiryTime})
	ON CONFLICT (user_disc_id, command_category) DO UPDATE
	SET expiry_time = ${expiryTime}
`;
```

**Thread Safety:** `ON CONFLICT DO UPDATE` ensures atomic operation (no race conditions)

### Cleanup API

**File:** `src/utils/db/cooldownsCleanup.ts`

```typescript
export async function cleanupExpiredCooldowns(): Promise<CooldownsCleanupResult>
```
Deletes expired cooldowns. Returns `{ success: boolean, deletedCount: number, error?: string }`.

```typescript
export async function clearAllCooldowns(): Promise<CooldownsCleanupResult>
```
**DESTRUCTIVE:** Clears ALL cooldowns. Use only in development/testing.

## Message Trigger Integration

**Location:** `src/events/messageCreate/tomoriChat.ts`

### Pre-Queue Check (Line 1079)

Performed early in message processing, **before** queueing:

```typescript
const preQueueCooldownResult = await checkMessageTriggerCooldown(
	message,
	earlyTomoriState.config,
);
if (preQueueCooldownResult.isOnCooldown) {
	// Show warning embed with remaining time
	await sendStandardEmbed(channel, cooldownLocale, {
		titleKey: "general.message_cooldown_title",
		descriptionKey: "general.message_cooldown",
		descriptionVars: {
			seconds: preQueueCooldownResult.remainingSeconds.toString(),
			botName: earlyTomoriState.tomori_nickname,
		},
		footerKey: getCooldownTypeFooterKey(preQueueCooldownResult.cooldownType),
	});
	return; // Reject message
}
```

**Why pre-queue check?**
- Prevents unnecessary queue processing for cooldown-blocked messages
- Shows immediate feedback to user

### Main Check (Line 1814)

Performed again **before** sending response (after LLM generation):

```typescript
const cooldownResult = await checkMessageTriggerCooldown(message, tomoriState.config);
if (cooldownResult.isOnCooldown) {
	// Show warning embed (same as pre-queue)
	return;
}
```

**Why double-check?**
- Handles race conditions (multiple messages sent rapidly)
- Prevents cooldown bypass via concurrent messages

### Set Cooldown (Line 1851)

Applied **after** successful response:

```typescript
if (!isManuallyTriggered && !isStopResponse && !isSelfMessage) {
	await setMessageTriggerCooldown(message, tomoriState.config);
}
```

**Skipped for:**
- Manual command triggers (`/respond` slash command)
- Stop responses (user said "stop")
- Self-messages (persona replying to itself in multi-persona scenarios)

## User Feedback

### Warning Embed

**Localization Keys:** `src/locales/en-US.ts`

```typescript
message_cooldown_title: `⌛ Please wait!`,
message_cooldown: `This server's managers have configured a cooldown. Please wait **{seconds}** seconds before triggering **{botName}** again.`,
```

**Footer Keys:** (dynamically selected based on cooldown type)

| Cooldown Type | Footer Key |
|---------------|------------|
| `PER_USER` | `message_cooldown_footer_per_user` |
| `PER_CHANNEL` | `message_cooldown_footer_per_channel` |
| `SERVER_WIDE` | `message_cooldown_footer_server_wide` |
| `STRICT_SERVER_WIDE` | `message_cooldown_footer_strict` |

**Mapping Function:** `getCooldownTypeFooterKey(cooldownType)`
**Location:** `src/utils/db/messageCooldown.ts:18-27`

## Expiration & Cleanup

### Development Mode

**Location:** `src/index.ts:221-237`

Cleanup runs on application startup:

```typescript
const { cleanupExpiredCooldowns } = await import("./utils/db/cooldownsCleanup");
const cleanupResult = await cleanupExpiredCooldowns();
if (cleanupResult.success) {
	log.success(
		`Cooldowns cleanup completed: ${cleanupResult.deletedCount} expired entries removed`,
	);
}
```

**Frequency:** Once per app restart (sufficient for development)

### Production Mode

**Location:** `src/db/pgcron.sql:40-52`

pg_cron scheduled job:

```sql
INSERT INTO cron.job (jobname, schedule, command, nodename, nodeport, database, username)
VALUES (
	'tomoribot_cooldown_cleanup',
	'0 * * * *', -- Run at the start of every hour
	'SELECT cleanup_expired_cooldowns();',
	'localhost',
	5432,
	current_database(),
	current_user
);
```

**Frequency:** Hourly (top of every hour)

**Why hourly?**
- Cooldowns typically 5-60 seconds (short-lived)
- Hourly cleanup sufficient to prevent table bloat
- Low overhead (single DELETE query)

## Performance Characteristics

### Database Performance

| Metric | Value | Rationale |
|--------|-------|-----------|
| **Table Type** | UNLOGGED | 5-10x faster than logged tables |
| **Lookup Speed** | O(1) | Primary key on `(user_disc_id, command_category)` |
| **Write Speed** | O(1) | UPSERT with primary key |
| **Storage Overhead** | Minimal | Cooldowns automatically deleted on expiry |

### Cache Integration

**Tomori State Cache:**
- **TTL:** 5 minutes
- **Invalidation:** On `/config cooldown` command
- Contains global `cooldown_type` and `cooldown_length`

**Channel Whitelist Cache:**
- **TTL:** 5 minutes
- **Invalidation:** On whitelist modifications
- Contains channel-specific cooldown overrides

**Impact:** Most cooldown checks avoid database queries (fetch from cache)

### Fail-Safe Design

**Database Errors:**
- Cooldown check returns "not on cooldown" (fail-open)
- Bot continues functioning even if cooldown system fails
- Errors logged for debugging

**Data Loss Tolerance:**
- UNLOGGED table data lost on database crash
- **Acceptable:** Cooldowns are temporary state
- No persistent business logic depends on cooldown data

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│         Message Received (tomoriChat)           │
└────────────────────┬────────────────────────────┘
                     │
                     ├─ 1. Check Whitelist Status
                     │    (channelWhitelistCache, 5-min TTL)
                     │    └─ Block non-whitelisted if whitelist exists
                     │
                     ├─ 2. Pre-Queue Cooldown Check
                     │    (checkMessageTriggerCooldown)
                     │    ├─ Load effective config (channel > global)
                     │    ├─ Check manager exemption
                     │    └─ Query cooldowns table
                     │       └─ WHERE expiry_time > NOW()
                     │
                     ├─ 3. Show Warning If On Cooldown
                     │    (sendStandardEmbed)
                     │    └─ Display remaining seconds + cooldown type
                     │
                     ├─ 4. Process Message (if not on cooldown)
                     │    └─ Generate LLM response
                     │
                     ├─ 5. Main Cooldown Check (race condition guard)
                     │    (checkMessageTriggerCooldown)
                     │
                     └─ 6. Set Cooldown After Success
                          (setMessageTriggerCooldown)
                          └─ UPSERT cooldowns table
                             └─ expiry_time = NOW() + cooldown_length
```

## Related Systems

### Whitelist Cache

**File:** `src/utils/cache/channelWhitelistCache.ts`

- **TTL:** 5 minutes
- **Stores:** `WhitelistCheckResult` with channel-specific cooldown settings
- **Invalidation:** Per-server or per-channel

**Impact on Cooldowns:**
- Determines effective cooldown settings (channel > global)
- Controls channel blocking when whitelist active

### Tomori State Cache

**File:** `src/utils/cache/tomoriStateCache.ts`

- **TTL:** 5 minutes
- **Stores:** Global `cooldown_type` and `cooldown_length` in `config` object
- **Invalidation:** On `/config cooldown` command

**Impact on Cooldowns:**
- Provides fallback cooldown settings when channel not whitelisted
- Reduces database queries for cooldown configuration

### Rate Limiter

**File:** `src/utils/security/rateLimiter.ts`

**Separate from cooldowns!**
- Different purpose: API abuse prevention vs spam prevention
- Different scoping: IP/user vs message triggers
- Different thresholds: Requests per minute vs seconds between triggers

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DISABLE_COOLDOWN_EXEMPTIONS` | `false` | Disable manager exemptions (testing) |

## Potential Improvements

Based on the documented architecture, here are areas for potential enhancement:

### 1. Cooldown Type Naming Inconsistency

**Current State:**
- Database column: `cooldown_type` (INTEGER 0-4)
- Cache uses `CooldownType` enum
- Whitelist cache returns `cooldownType` (camelCase)

**Issue:** Inconsistent naming between snake_case (DB) and camelCase (code)

**Suggestion:** Consider standardizing on camelCase for TypeScript interfaces

### 2. Double-Check Pattern Complexity

**Current State:**
- Pre-queue check at line 1079
- Main check at line 1814

**Issue:** Code duplication + potential for behavior divergence

**Suggestion:**
- Consider wrapping both checks + set in a single transaction-like function
- Or document explicitly why double-check is necessary (race conditions)

### 3. Fail-Open vs Fail-Closed Trade-off

**Current State:** Database errors return "not on cooldown" (fail-open)

**Issue:** Could allow spam during database outages

**Alternative:** Consider fail-closed (reject on error) with circuit breaker pattern

### 4. Magic String Prefixes

**Current State:**
- `__msg_trigger__${serverId}`
- `__msg_trigger_channel__`
- `__msg_trigger_server__`

**Issue:** String prefixes defined inline in `getCooldownKeyPair`

**Suggestion:**
- Extract to constants: `const MSG_TRIGGER_PREFIX = "__msg_trigger__"` etc.
- Add JSDoc explaining key strategy

### 5. No Per-User-Per-Channel Cooldown Type

**Current State:** Only PER_USER (server-wide per user) or PER_CHANNEL

**Potential Enhancement:** Add `PER_USER_PER_CHANNEL` for most granular control

**Use Case:** High-activity servers with users in multiple channels

### 6. Cooldown Metrics Missing

**Current State:** Cleanup reports deleted count, but no metrics on:
- How often cooldowns are triggered
- Average remaining time when users hit cooldowns
- Distribution of cooldown types across servers

**Suggestion:** Add optional metrics collection for server operators

### 7. UNLOGGED Table Trade-off Not Explicit

**Current State:** UNLOGGED table used for performance

**Documentation Gap:** Not explicitly documented that cooldowns reset on crash

**Suggestion:** Add warning in configuration command or docs that database crashes reset cooldowns

### 8. Whitelist Blocking Behavior

**Current State:** Non-whitelisted channels treated as 999999s cooldown

**Issue:** Magic number hardcoded, no user feedback explaining whitelist

**Suggestion:**
- Use constant: `const WHITELIST_BLOCK_COOLDOWN = 999999`
- Different error message for whitelist blocks vs cooldown

### 9. No Gradual Cooldown Increase

**Current State:** Fixed cooldown length regardless of spam frequency

**Enhancement Idea:** Progressive cooldown (double on rapid retries)

**Example:** 5s → 10s → 20s → 40s for repeated cooldown violations

### 10. Cache Invalidation Consistency

**Current State:** `/config cooldown` invalidates TomoriStateCache

**Potential Issue:** Channel whitelist cache not invalidated when global config changes

**Suggestion:** Consider invalidating both caches on config changes

## Proposed Schema Refactor: Explicit Columns

### Executive Summary

**Recommendation:** Refactor the cooldown table from "creative key mapping" to explicit columns for improved maintainability, clarity, and debuggability.

**Priority:** Medium (current system works, but refactor significantly improves code quality)

**Complexity:** Low (cooldowns are short-lived, migration is trivial)

### Current Schema Problems

The existing schema uses semantic overloading to avoid additional columns:

```sql
-- Current: Ambiguous column semantics
CREATE UNLOGGED TABLE IF NOT EXISTS cooldowns (
	user_disc_id TEXT NOT NULL,        -- Sometimes user, channel, or server ID
	command_category TEXT NOT NULL,    -- Contains magic strings like __msg_trigger__${serverId}
	expiry_time BIGINT NOT NULL,
	PRIMARY KEY (user_disc_id, command_category)
);
```

**Critical Issues:**

1. **Magic String Dependency**
   - `__msg_trigger__${serverId}` for PER_USER
   - `__msg_trigger_channel__` for PER_CHANNEL
   - `__msg_trigger_server__` for SERVER_WIDE
   - String parsing required in queries

2. **Column Semantic Overloading**
   - `user_disc_id` sometimes contains channel IDs or server IDs
   - Impossible to enforce foreign key constraints
   - Confusing for database administrators

3. **Requires Mapping Function**
   - `getCooldownKeyPair()` needed to translate cooldown type → key strategy
   - 70 lines of documentation required to explain system
   - High cognitive overhead for new contributors

4. **Difficult Debugging**
   - `SELECT * FROM cooldowns` output is meaningless without context
   - Cannot easily query "all cooldowns for user X" or "all cooldowns in channel Y"

### Proposed New Schema

```sql
CREATE UNLOGGED TABLE IF NOT EXISTS cooldowns (
	-- Explicit cooldown metadata
	cooldown_id SERIAL,                        -- Optional: useful for logging/debugging
	cooldown_type INT NOT NULL,                -- CooldownType enum (1-4)
	server_disc_id TEXT NOT NULL,              -- Always the server/guild ID

	-- Scope-specific identifiers (nullable based on type)
	user_disc_id TEXT,                         -- User ID (populated for PER_USER)
	channel_disc_id TEXT,                      -- Channel ID (populated for PER_CHANNEL)

	-- Expiry tracking
	expiry_time BIGINT NOT NULL,               -- Unix timestamp in milliseconds
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Optional: useful for analytics

	-- Composite unique constraint for UPSERT operations
	CONSTRAINT uq_cooldown_scope UNIQUE (
		cooldown_type,
		server_disc_id,
		COALESCE(user_disc_id, ''),           -- Handle NULLs in unique constraint
		COALESCE(channel_disc_id, '')
	)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_cooldowns_expiry
	ON cooldowns(expiry_time)
	WHERE expiry_time > EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000;  -- Partial index for active cooldowns

CREATE INDEX IF NOT EXISTS idx_cooldowns_user
	ON cooldowns(user_disc_id, server_disc_id)
	WHERE user_disc_id IS NOT NULL;  -- Fast user cooldown lookups

CREATE INDEX IF NOT EXISTS idx_cooldowns_channel
	ON cooldowns(channel_disc_id)
	WHERE channel_disc_id IS NOT NULL;  -- Fast channel cooldown lookups
```

### Column Specifications

| Column | Type | Nullable | Purpose | Populated For |
|--------|------|----------|---------|---------------|
| `cooldown_id` | SERIAL | No | Optional identifier for logging | All types |
| `cooldown_type` | INT | No | CooldownType enum (1-4) | All types |
| `server_disc_id` | TEXT | No | Discord guild/server ID | All types |
| `user_disc_id` | TEXT | Yes | Discord user ID | `PER_USER` only |
| `channel_disc_id` | TEXT | Yes | Discord channel ID | `PER_CHANNEL` only |
| `expiry_time` | BIGINT | No | Unix timestamp (milliseconds) | All types |
| `created_at` | TIMESTAMP | No | Cooldown creation time | All types (optional) |

### Data Population Rules

| Cooldown Type | `user_disc_id` | `channel_disc_id` | `server_disc_id` |
|---------------|----------------|-------------------|------------------|
| `PER_USER` (1) | ✅ User ID | ❌ NULL | ✅ Server ID |
| `PER_CHANNEL` (2) | ❌ NULL | ✅ Channel ID | ✅ Server ID |
| `SERVER_WIDE` (3) | ❌ NULL | ❌ NULL | ✅ Server ID |
| `STRICT_SERVER_WIDE` (4) | ❌ NULL | ❌ NULL | ✅ Server ID |

### Benefits of Explicit Columns

#### 1. Self-Documenting Schema

**Before (requires documentation):**
```sql
SELECT * FROM cooldowns;
-- user_disc_id  | command_category              | expiry_time
-- 123456789     | __msg_trigger__999888777      | 1738800000000
-- What does this mean? ¯\_(ツ)_/¯
```

**After (immediately clear):**
```sql
SELECT * FROM cooldowns;
-- cooldown_type | server_disc_id | user_disc_id | channel_disc_id | expiry_time
-- 1 (PER_USER)  | 999888777      | 123456789    | NULL            | 1738800000000
-- ✅ Clear: User 123456789 in server 999888777 has a PER_USER cooldown
```

#### 2. Easier Queries

**Before (requires key mapping knowledge):**
```typescript
// Check PER_USER cooldown (must know key strategy)
await sql`
	SELECT * FROM cooldowns
	WHERE user_disc_id = ${userId}
	AND command_category = ${'__msg_trigger__' + serverId}
`;
```

**After (intuitive SQL):**
```typescript
// Check PER_USER cooldown (obvious)
await sql`
	SELECT * FROM cooldowns
	WHERE cooldown_type = ${CooldownType.PER_USER}
	AND server_disc_id = ${serverId}
	AND user_disc_id = ${userId}
`;
```

#### 3. Type Safety & Constraints

**Before (no constraints possible):**
```sql
-- Cannot add foreign keys (user_disc_id sometimes contains channel IDs)
-- Cannot add CHECK constraints (ambiguous semantics)
```

**After (proper constraints):**
```sql
-- Add CHECK constraints for data integrity
ALTER TABLE cooldowns ADD CONSTRAINT chk_per_user_has_user
	CHECK (cooldown_type != 1 OR user_disc_id IS NOT NULL);

ALTER TABLE cooldowns ADD CONSTRAINT chk_per_channel_has_channel
	CHECK (cooldown_type != 2 OR channel_disc_id IS NOT NULL);

-- Could even add foreign keys if you have servers/users tables
ALTER TABLE cooldowns ADD CONSTRAINT fk_server
	FOREIGN KEY (server_disc_id) REFERENCES servers(server_disc_id) ON DELETE CASCADE;
```

#### 4. Future-Proof Extensibility

**Adding PER_USER_PER_CHANNEL cooldown type:**

**Before:**
```typescript
// Need new magic string strategy
case CooldownType.PER_USER_PER_CHANNEL:
	return {
		entityId: `${userId}:${channelId}`,  // More string munging
		category: `__msg_trigger_user_channel__${serverId}`,
	};
```

**After:**
```typescript
// Just populate both columns (no code changes needed!)
await sql`
	INSERT INTO cooldowns (cooldown_type, server_disc_id, user_disc_id, channel_disc_id, expiry_time)
	VALUES (5, ${serverId}, ${userId}, ${channelId}, ${expiryTime})
	ON CONFLICT (cooldown_type, server_disc_id, COALESCE(user_disc_id, ''), COALESCE(channel_disc_id, ''))
	DO UPDATE SET expiry_time = ${expiryTime}
`;
```

#### 5. Better Debugging & Analytics

**Useful Queries (impossible with current schema):**

```sql
-- Find all cooldowns for a specific user across all servers
SELECT * FROM cooldowns WHERE user_disc_id = '123456789';

-- Find all active cooldowns in a channel
SELECT * FROM cooldowns
WHERE channel_disc_id = '987654321'
AND expiry_time > EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000;

-- Count cooldowns by type (for analytics)
SELECT cooldown_type, COUNT(*)
FROM cooldowns
GROUP BY cooldown_type;

-- Find servers with most strict cooldowns
SELECT server_disc_id, COUNT(*) as cooldown_count
FROM cooldowns
WHERE cooldown_type = 4  -- STRICT_SERVER_WIDE
GROUP BY server_disc_id
ORDER BY cooldown_count DESC;
```

### Code Changes Required

#### 1. Remove Key Mapping Function

**Delete:** `src/utils/db/messageCooldown.ts:35-68` (`getCooldownKeyPair()`)

**Rationale:** No longer needed with explicit columns

#### 2. Update Check Function

**File:** `src/utils/db/messageCooldown.ts:105-242`

**Before:**
```typescript
const { entityId, category } = getCooldownKeyPair(
	effectiveCooldownType,
	message.author.id,
	message.channel.id,
	serverId,
);

const [result] = await sql`
	SELECT * FROM cooldowns
	WHERE user_disc_id = ${entityId}
	AND command_category = ${category}
	AND expiry_time > ${now}
`;
```

**After:**
```typescript
// Build query conditions based on cooldown type
const conditions = {
	cooldown_type: effectiveCooldownType,
	server_disc_id: serverId,
	user_disc_id: effectiveCooldownType === CooldownType.PER_USER ? message.author.id : null,
	channel_disc_id: effectiveCooldownType === CooldownType.PER_CHANNEL ? message.channel.id : null,
};

const [result] = await sql`
	SELECT * FROM cooldowns
	WHERE cooldown_type = ${conditions.cooldown_type}
	AND server_disc_id = ${conditions.server_disc_id}
	AND (${conditions.user_disc_id}::TEXT IS NULL OR user_disc_id = ${conditions.user_disc_id})
	AND (${conditions.channel_disc_id}::TEXT IS NULL OR channel_disc_id = ${conditions.channel_disc_id})
	AND expiry_time > ${now}
`;
```

#### 3. Update Set Function

**File:** `src/utils/db/messageCooldown.ts:249-330`

**Before:**
```typescript
const { entityId, category } = getCooldownKeyPair(
	effectiveCooldownType,
	message.author.id,
	message.channel.id,
	serverId,
);

await sql`
	INSERT INTO cooldowns (user_disc_id, command_category, expiry_time)
	VALUES (${entityId}, ${category}, ${expiryTime})
	ON CONFLICT (user_disc_id, command_category) DO UPDATE
	SET expiry_time = ${expiryTime}
`;
```

**After:**
```typescript
await sql`
	INSERT INTO cooldowns (
		cooldown_type,
		server_disc_id,
		user_disc_id,
		channel_disc_id,
		expiry_time
	)
	VALUES (
		${effectiveCooldownType},
		${serverId},
		${effectiveCooldownType === CooldownType.PER_USER ? message.author.id : null},
		${effectiveCooldownType === CooldownType.PER_CHANNEL ? message.channel.id : null},
		${expiryTime}
	)
	ON CONFLICT ON CONSTRAINT uq_cooldown_scope
	DO UPDATE SET expiry_time = ${expiryTime}
`;
```

### Migration Strategy

Since cooldowns are **short-lived** (5-60 second TTL), migration is trivial:

#### Option 1: Zero-Downtime Truncate (Recommended)

```sql
-- Step 1: Backup current cooldowns (optional, they expire quickly)
CREATE TABLE cooldowns_backup AS SELECT * FROM cooldowns;

-- Step 2: Drop old table
DROP TABLE cooldowns;

-- Step 3: Create new schema
CREATE UNLOGGED TABLE cooldowns (...);  -- New schema from above

-- Step 4: Deploy updated code
-- Old cooldowns lost, but they regenerate within 5-60 seconds
```

**Downtime:** None (users just experience cooldown resets)

**Duration:** < 1 minute

#### Option 2: Gradual Migration (Zero Data Loss)

```sql
-- Step 1: Add new columns to existing table
ALTER TABLE cooldowns ADD COLUMN cooldown_type INT;
ALTER TABLE cooldowns ADD COLUMN server_disc_id TEXT;
ALTER TABLE cooldowns ADD COLUMN new_user_disc_id TEXT;
ALTER TABLE cooldowns ADD COLUMN new_channel_disc_id TEXT;

-- Step 2: Backfill existing cooldowns (parse magic strings)
UPDATE cooldowns SET
	cooldown_type = CASE
		WHEN command_category LIKE '__msg_trigger__%' THEN 1  -- PER_USER
		WHEN command_category = '__msg_trigger_channel__' THEN 2  -- PER_CHANNEL
		WHEN command_category = '__msg_trigger_server__' THEN 3  -- SERVER_WIDE
	END,
	server_disc_id = CASE
		WHEN command_category LIKE '__msg_trigger__%'
		THEN SUBSTRING(command_category FROM '__msg_trigger__(.*)$')
		ELSE user_disc_id  -- SERVER_WIDE uses server ID in user_disc_id column
	END,
	new_user_disc_id = CASE
		WHEN command_category LIKE '__msg_trigger__%' THEN user_disc_id
		ELSE NULL
	END,
	new_channel_disc_id = CASE
		WHEN command_category = '__msg_trigger_channel__' THEN user_disc_id
		ELSE NULL
	END;

-- Step 3: Deploy code using new columns

-- Step 4: Drop old columns after 24 hours
ALTER TABLE cooldowns DROP COLUMN command_category;
ALTER TABLE cooldowns DROP COLUMN user_disc_id;
ALTER TABLE cooldowns RENAME COLUMN new_user_disc_id TO user_disc_id;
ALTER TABLE cooldowns RENAME COLUMN new_channel_disc_id TO channel_disc_id;
```

**Downtime:** None

**Duration:** Deploy over 24 hours

### Testing Checklist

After migration, verify:

- [ ] PER_USER cooldowns work (different users can trigger independently)
- [ ] PER_CHANNEL cooldowns work (different channels have separate cooldowns)
- [ ] SERVER_WIDE cooldowns work (entire server blocked)
- [ ] STRICT_SERVER_WIDE cooldowns work (managers also blocked)
- [ ] Manager exemptions still work (types 1-3)
- [ ] Channel whitelist overrides still work
- [ ] Cooldown warnings show correct remaining time
- [ ] Cleanup function still removes expired cooldowns
- [ ] UPSERT operations handle concurrent messages (no duplicate key errors)

### Performance Impact

**Storage Increase:**
- Current: ~80 bytes/row (2 TEXT columns + 1 BIGINT)
- Proposed: ~140 bytes/row (5 TEXT columns + 2 INT + 1 BIGINT + 1 TIMESTAMP)
- **Impact:** +75% storage per row, but cooldowns are short-lived

**Example:**
- 1000 concurrent cooldowns: 80 KB → 140 KB (+60 KB)
- **Verdict:** Negligible (cooldowns table rarely exceeds 10,000 rows)

**Query Performance:**
- Explicit indexes on `user_disc_id` and `channel_disc_id` improve lookups
- No string parsing required (faster queries)
- **Verdict:** Neutral to slightly faster

### Recommendation Summary

| Factor | Score | Notes |
|--------|-------|-------|
| **Code Clarity** | ⭐⭐⭐⭐⭐ | Eliminates magic strings, self-documenting |
| **Maintainability** | ⭐⭐⭐⭐⭐ | Easier for new contributors |
| **Debugging** | ⭐⭐⭐⭐⭐ | Database queries immediately understandable |
| **Extensibility** | ⭐⭐⭐⭐⭐ | Adding new cooldown types trivial |
| **Migration Effort** | ⭐⭐⭐⭐⭐ | Trivial (cooldowns short-lived) |
| **Performance Cost** | ⭐⭐⭐⭐ | Minimal storage increase |
| **Type Safety** | ⭐⭐⭐⭐⭐ | Enables constraints and foreign keys |

**Overall:** ⭐⭐⭐⭐⭐ **Strongly Recommended**

The explicit column approach trades minor storage overhead for massive gains in code clarity, maintainability, and debugging. Given that cooldowns are short-lived temporary data, the migration is essentially free.

## Summary

TomoriBot's cooldown system provides:

✅ **Flexible Scoping:** Four strategies (per-user, per-channel, server-wide, strict)
✅ **Manager Exemptions:** Server managers can bypass (except STRICT mode)
✅ **Per-Channel Overrides:** Whitelist system allows channel-specific settings
✅ **High Performance:** UNLOGGED table + composite keys + caching
✅ **Automatic Cleanup:** Hourly pg_cron job (production) or startup (dev)
✅ **User Feedback:** Embed shows remaining time + cooldown type
✅ **Fail-Safe:** Database errors don't block messages
✅ **Thread-Safe:** UPSERT operations prevent race conditions

The architecture elegantly reuses a single table with creative key strategies, avoiding schema proliferation while supporting multiple scoping levels and future extensibility.

---

## Future Roadmap

This section documents planned improvements to the cooldown and quota systems. Once implemented, content will be moved to the appropriate sections above and this roadmap will be updated.

### 🚧 Phase 1: Cooldown Schema Refactor

**Status:** 📋 Planned

**Goal:** Replace "creative key mapping" with explicit columns for improved maintainability and clarity.

**Motivation:**
- Eliminate magic strings (`__msg_trigger__*`)
- Self-documenting schema
- Enable proper constraints and foreign keys
- Easier debugging and analytics

**New Schema:**
```sql
CREATE UNLOGGED TABLE IF NOT EXISTS cooldowns (
	-- Explicit cooldown metadata
	cooldown_id SERIAL,
	cooldown_type INT NOT NULL,                -- CooldownType enum (1-4)
	server_disc_id TEXT NOT NULL,              -- Always the server/guild ID

	-- Scope-specific identifiers (nullable based on type)
	user_disc_id TEXT,                         -- User ID (populated for PER_USER)
	channel_disc_id TEXT,                      -- Channel ID (populated for PER_CHANNEL)

	-- Expiry tracking
	expiry_time BIGINT NOT NULL,               -- Unix timestamp in milliseconds
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

	-- Composite unique constraint for UPSERT operations
	CONSTRAINT uq_cooldown_scope UNIQUE (
		cooldown_type,
		server_disc_id,
		COALESCE(user_disc_id, ''),
		COALESCE(channel_disc_id, '')
	)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_cooldowns_expiry
	ON cooldowns(expiry_time)
	WHERE expiry_time > EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000;

CREATE INDEX IF NOT EXISTS idx_cooldowns_user
	ON cooldowns(user_disc_id, server_disc_id)
	WHERE user_disc_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cooldowns_channel
	ON cooldowns(channel_disc_id)
	WHERE channel_disc_id IS NOT NULL;
```

**Implementation Checklist:**

- [ ] **Schema Migration**
  - [ ] Create migration script with Option 1 (Zero-Downtime Truncate)
  - [ ] Test migration in development environment
  - [ ] Schedule production migration (< 1 minute downtime)

- [ ] **Code Refactoring**
  - [ ] Delete `getCooldownKeyPair()` function (`src/utils/db/messageCooldown.ts:35-68`)
  - [ ] Update `checkMessageTriggerCooldown()` to use explicit columns
  - [ ] Update `setMessageTriggerCooldown()` to use explicit columns
  - [ ] Update all SQL queries to use new schema

- [ ] **Testing**
  - [ ] Verify PER_USER cooldowns work
  - [ ] Verify PER_CHANNEL cooldowns work
  - [ ] Verify SERVER_WIDE cooldowns work
  - [ ] Verify STRICT_SERVER_WIDE cooldowns work
  - [ ] Verify manager exemptions still work
  - [ ] Verify channel whitelist overrides still work
  - [ ] Verify concurrent messages don't cause race conditions

- [ ] **Documentation**
  - [ ] Update this doc to reflect new schema
  - [ ] Move "Proposed Schema Refactor" content to main sections
  - [ ] Update code comments in cooldown utilities

**Migration Strategy:** Zero-Downtime Truncate (recommended)
- Cooldowns are short-lived (5-60s), so data loss is acceptable
- Users experience cooldown resets, but they regenerate within seconds
- Total downtime: < 1 minute

---

### 🚧 Phase 2: Command Reorganization

**Status:** 📋 Planned (depends on Phase 1 completion)

**Goal:** Reorganize cooldown commands for better discoverability and logical grouping.

**Changes:**

#### 2.1: Move `/config cooldown` → `/server cooldown triggers`

**Rationale:**
- Cooldowns are server-level settings, not persona configuration
- Groups with other server management commands (`/server trigger`, `/server whitelist`)
- More intuitive for server administrators

**Current:**
```
/config cooldown <type> <length>
```

**New:**
```
/server cooldown triggers <type> <length>
```

**File Changes:**
- Move: `src/commands/config/cooldown.ts` → `src/commands/serverconfig/cooldown/triggers.ts`
- Update locale keys: `config.cooldown.*` → `server.cooldown.triggers.*`
- Command registry automatically picks up new location

**Locale Key Updates:**
```typescript
// Before
"config.cooldown.title": "⏱️ Cooldown Settings Updated",
"config.cooldown.description": "...",

// After
"server.cooldown.triggers.title": "⏱️ Message Trigger Cooldown Updated",
"server.cooldown.triggers.description": "...",
```

#### 2.2: Extend Cooldowns to `/bot` Commands

**Rationale:**
- `/bot` commands (e.g., `/bot respond`) elicit bot responses, same as message triggers
- Should share the same cooldown pool to prevent abuse
- Maintains consistent rate limiting across all interaction types

**Implementation:**

1. **Extract cooldown logic into shared utilities:**
```typescript
// src/utils/db/cooldownManager.ts (NEW FILE)

/**
 * Check if a cooldown is active for the given scope.
 * Works for both message triggers and slash commands.
 */
export async function checkCooldown(
	cooldownType: CooldownType,
	serverId: string,
	userId: string,
	channelId: string
): Promise<CooldownCheckResult> {
	// Use new explicit schema to query cooldowns table
	const [result] = await sql`
		SELECT * FROM cooldowns
		WHERE cooldown_type = ${cooldownType}
		AND server_disc_id = ${serverId}
		AND (${userId}::TEXT IS NULL OR user_disc_id = ${userId})
		AND (${channelId}::TEXT IS NULL OR channel_disc_id = ${channelId})
		AND expiry_time > ${Date.now()}
	`;

	if (result) {
		const remainingMs = result.expiry_time - Date.now();
		return {
			isOnCooldown: true,
			remainingSeconds: Math.ceil(remainingMs / 1000),
			cooldownType,
		};
	}

	return {
		isOnCooldown: false,
		remainingSeconds: 0,
		cooldownType,
	};
}

/**
 * Set a cooldown for the given scope.
 * Works for both message triggers and slash commands.
 */
export async function setCooldown(
	cooldownType: CooldownType,
	serverId: string,
	userId: string,
	channelId: string,
	cooldownLength: number
): Promise<void> {
	const expiryTime = Date.now() + cooldownLength * 1000;

	await sql`
		INSERT INTO cooldowns (
			cooldown_type,
			server_disc_id,
			user_disc_id,
			channel_disc_id,
			expiry_time
		)
		VALUES (
			${cooldownType},
			${serverId},
			${cooldownType === CooldownType.PER_USER ? userId : null},
			${cooldownType === CooldownType.PER_CHANNEL ? channelId : null},
			${expiryTime}
		)
		ON CONFLICT ON CONSTRAINT uq_cooldown_scope
		DO UPDATE SET expiry_time = ${expiryTime}
	`;
}
```

2. **Update message trigger handler:**
```typescript
// src/events/messageCreate/tomoriChat.ts

import { checkCooldown, setCooldown } from "@/utils/db/cooldownManager";

// Pre-queue cooldown check
const cooldownResult = await checkCooldown(
	tomoriState.config.cooldown_type,
	serverId,
	message.author.id,
	message.channel.id
);

if (cooldownResult.isOnCooldown) {
	// Show cooldown warning
	return;
}

// ... generate response ...

// Set cooldown after successful response
await setCooldown(
	tomoriState.config.cooldown_type,
	serverId,
	message.author.id,
	message.channel.id,
	tomoriState.config.cooldown_length
);
```

3. **Update `/bot` commands:**
```typescript
// src/commands/bot/respond.ts

import { checkCooldown, setCooldown } from "@/utils/db/cooldownManager";

// Check cooldown before responding
const cooldownResult = await checkCooldown(
	tomoriState.config.cooldown_type,
	interaction.guild.id,
	interaction.user.id,
	interaction.channel.id
);

if (cooldownResult.isOnCooldown) {
	await replyInfoEmbed(interaction, locale, {
		titleKey: "general.message_cooldown_title",
		descriptionKey: "general.bot_command_cooldown",
		descriptionVars: {
			seconds: cooldownResult.remainingSeconds.toString(),
			botName: tomoriState.tomori_nickname,
		},
		footerKey: getCooldownTypeFooterKey(cooldownResult.cooldownType),
	});
	return;
}

// ... generate response ...

// Set cooldown after successful response
await setCooldown(
	tomoriState.config.cooldown_type,
	interaction.guild.id,
	interaction.user.id,
	interaction.channel.id,
	tomoriState.config.cooldown_length
);
```

**Behavior:**
- Message trigger and `/bot respond` **share the same cooldown**
- If user triggers bot via message, `/bot respond` is also on cooldown (and vice versa)
- Manager exemptions apply to both (except STRICT_SERVER_WIDE mode)
- Channel whitelist rules apply to both

**Implementation Checklist:**

- [ ] **Create Shared Utilities**
  - [ ] Create `src/utils/db/cooldownManager.ts`
  - [ ] Implement `checkCooldown()` with new schema
  - [ ] Implement `setCooldown()` with new schema
  - [ ] Add JSDoc comments explaining shared usage

- [ ] **Refactor Message Trigger Handler**
  - [ ] Update `src/events/messageCreate/tomoriChat.ts` to use `cooldownManager`
  - [ ] Remove old `checkMessageTriggerCooldown()` calls
  - [ ] Remove old `setMessageTriggerCooldown()` calls
  - [ ] Test message trigger cooldowns still work

- [ ] **Update `/bot` Commands**
  - [ ] Add cooldown check to `src/commands/bot/respond.ts`
  - [ ] Add cooldown set to `src/commands/bot/respond.ts`
  - [ ] Update locale keys for bot command cooldown messages
  - [ ] Test `/bot respond` cooldowns work

- [ ] **Command File Migration**
  - [ ] Move `src/commands/config/cooldown.ts` → `src/commands/serverconfig/cooldown/triggers.ts`
  - [ ] Update locale keys in all locales (`en-US.ts`, `ja.ts`)
  - [ ] Update command registration (automatic via folder structure)
  - [ ] Test new command path works

- [ ] **Deprecation**
  - [ ] Delete old `src/utils/db/messageCooldown.ts` (after migration)
  - [ ] Clean up unused imports

- [ ] **Testing**
  - [ ] Verify message trigger cooldowns work after refactor
  - [ ] Verify `/bot respond` cooldowns work
  - [ ] Verify shared cooldown pool (trigger message → `/bot respond` blocked)
  - [ ] Verify manager exemptions apply to both
  - [ ] Verify whitelist rules apply to both

---

### 🚧 Phase 3: Image Generation Quota System

**Status:** 📋 Planned (independent of Phases 1-2, can be implemented in parallel)

**Goal:** Add usage-based quotas for image generation with per-user and server-wide limits.

**Motivation:**
- Image generation is expensive (API costs, compute resources)
- Need to prevent abuse and manage costs
- Quotas provide fairer long-term limits than short cooldowns
- Rolling window reset is more flexible than fixed schedules

**System Design:**

#### 3.1: Quota vs Cooldown Distinction

| Feature | Cooldowns | Quotas |
|---------|-----------|--------|
| **Type** | Time-based rate limiting | Usage-based limiting |
| **Duration** | Short-lived (5-60 seconds) | Long-lived (days/weeks) |
| **Reset** | Automatic expiry | Scheduled reset on timer |
| **Use Case** | Spam prevention | Resource management |
| **Table Type** | UNLOGGED (ephemeral) | Logged (persistent) |

**Quotas are fundamentally different from cooldowns and require separate infrastructure.**

#### 3.2: Database Schema

**Image Quota Tracking Table:**
```sql
CREATE TABLE IF NOT EXISTS image_quotas (
	quota_id SERIAL PRIMARY KEY,
	server_disc_id TEXT NOT NULL,
	user_disc_id TEXT,                        -- NULL for server-wide quotas
	usage_count INT NOT NULL DEFAULT 0,
	first_usage_timestamp BIGINT,            -- When first image generated (starts timer)
	last_reset_timestamp BIGINT,             -- When quota last reset
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT uq_image_quota_scope UNIQUE (server_disc_id, user_disc_id)
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_image_quotas_reset
	ON image_quotas(first_usage_timestamp)
	WHERE first_usage_timestamp IS NOT NULL;
```

**Image Quota Configuration Table:**
```sql
CREATE TABLE IF NOT EXISTS image_quota_configs (
	server_disc_id TEXT PRIMARY KEY,
	per_user_quota INT NOT NULL,              -- Max images per user per period
	per_user_reset_days INT NOT NULL,         -- Days before user quota resets
	server_quota INT NOT NULL,                -- Max images for entire server per period
	server_reset_days INT NOT NULL,           -- Days before server quota resets
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

	FOREIGN KEY (server_disc_id) REFERENCES servers(server_disc_id) ON DELETE CASCADE
);
```

**Example Data:**
```sql
-- Server 999888777 config: 10 images/user/week, 100 images/server/month
INSERT INTO image_quota_configs (server_disc_id, per_user_quota, per_user_reset_days, server_quota, server_reset_days)
VALUES ('999888777', 10, 7, 100, 30);

-- User 123456789 usage tracking
INSERT INTO image_quotas (server_disc_id, user_disc_id, usage_count, first_usage_timestamp)
VALUES ('999888777', '123456789', 3, 1738800000000);  -- 3 images used, timer started

-- Server-wide usage tracking (user_disc_id = NULL)
INSERT INTO image_quotas (server_disc_id, user_disc_id, usage_count, first_usage_timestamp)
VALUES ('999888777', NULL, 45, 1738600000000);  -- 45 images used server-wide
```

#### 3.3: Rolling Window Reset Logic

**Reset Behavior:**
- Timer starts on **first usage** (not when quota is configured)
- Quota resets **N days after first usage**
- After reset, timer restarts on next usage (rolling window)

**Example Flow (7-day reset):**
```
Day 1, 10:00 AM: User generates first image
  - first_usage_timestamp = Day 1, 10:00 AM
  - usage_count = 1
  - Reset scheduled for Day 8, 10:00 AM

Day 3, 2:00 PM: User generates 5 more images
  - usage_count = 6
  - Reset still scheduled for Day 8, 10:00 AM

Day 8, 10:00 AM: Quota resets (via cleanup job)
  - usage_count = 0
  - first_usage_timestamp = NULL
  - last_reset_timestamp = Day 8, 10:00 AM

Day 10, 5:00 PM: User generates image
  - first_usage_timestamp = Day 10, 5:00 PM (NEW timer)
  - usage_count = 1
  - Reset scheduled for Day 17, 5:00 PM
```

**Advantages:**
- Fair for all users (timer starts on their first usage)
- No quota hoarding (can't wait until reset to use all at once)
- More forgiving than fixed schedules

#### 3.4: Quota Check & Update Logic

**Check Quota Before Image Generation:**
```typescript
// src/utils/quota/imageQuotaManager.ts (NEW FILE)

/**
 * Check if user and server have remaining image quota.
 * Returns { allowed: boolean, reason?: string }
 */
export async function checkImageQuota(
	serverId: string,
	userId: string
): Promise<QuotaCheckResult> {
	// Load config
	const [config] = await sql`
		SELECT * FROM image_quota_configs
		WHERE server_disc_id = ${serverId}
	`;

	if (!config) {
		// No quota configured, allow unlimited
		return { allowed: true };
	}

	// Check user quota
	const [userQuota] = await sql`
		SELECT * FROM image_quotas
		WHERE server_disc_id = ${serverId}
		AND user_disc_id = ${userId}
	`;

	if (userQuota && userQuota.usage_count >= config.per_user_quota) {
		// User quota exceeded
		const resetTime = userQuota.first_usage_timestamp + (config.per_user_reset_days * 24 * 60 * 60 * 1000);
		const remainingMs = resetTime - Date.now();
		const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));

		return {
			allowed: false,
			reason: 'user_quota_exceeded',
			remainingDays,
			quotaLimit: config.per_user_quota,
		};
	}

	// Check server quota
	const [serverQuota] = await sql`
		SELECT * FROM image_quotas
		WHERE server_disc_id = ${serverId}
		AND user_disc_id IS NULL
	`;

	if (serverQuota && serverQuota.usage_count >= config.server_quota) {
		// Server quota exceeded
		const resetTime = serverQuota.first_usage_timestamp + (config.server_reset_days * 24 * 60 * 60 * 1000);
		const remainingMs = resetTime - Date.now();
		const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));

		return {
			allowed: false,
			reason: 'server_quota_exceeded',
			remainingDays,
			quotaLimit: config.server_quota,
		};
	}

	return { allowed: true };
}
```

**Increment Quota After Image Generation:**
```typescript
/**
 * Increment usage count for user and server quotas.
 * Uses atomic increment to prevent race conditions.
 */
export async function incrementImageQuota(
	serverId: string,
	userId: string
): Promise<void> {
	const now = Date.now();

	// Increment user quota (with UPSERT)
	await sql`
		INSERT INTO image_quotas (server_disc_id, user_disc_id, usage_count, first_usage_timestamp)
		VALUES (${serverId}, ${userId}, 1, ${now})
		ON CONFLICT (server_disc_id, user_disc_id)
		DO UPDATE SET
			usage_count = image_quotas.usage_count + 1,
			first_usage_timestamp = COALESCE(image_quotas.first_usage_timestamp, ${now}),
			updated_at = CURRENT_TIMESTAMP
	`;

	// Increment server quota (atomic, prevents race conditions)
	await sql`
		INSERT INTO image_quotas (server_disc_id, user_disc_id, usage_count, first_usage_timestamp)
		VALUES (${serverId}, NULL, 1, ${now})
		ON CONFLICT (server_disc_id, user_disc_id)
		DO UPDATE SET
			usage_count = image_quotas.usage_count + 1,
			first_usage_timestamp = COALESCE(image_quotas.first_usage_timestamp, ${now}),
			updated_at = CURRENT_TIMESTAMP
	`;
}
```

**Concurrency Safety:**
- `ON CONFLICT DO UPDATE SET usage_count = usage_count + 1` is atomic
- Multiple concurrent image generations won't cause race conditions
- `COALESCE(first_usage_timestamp, ${now})` ensures timer only set once

#### 3.5: Quota Reset Cleanup Job

**Function:**
```sql
CREATE OR REPLACE FUNCTION cleanup_expired_image_quotas()
RETURNS INTEGER AS $$
DECLARE
	deleted_count INTEGER := 0;
	reset_count INTEGER := 0;
BEGIN
	-- Reset user quotas where reset period has passed
	UPDATE image_quotas uq
	SET
		usage_count = 0,
		first_usage_timestamp = NULL,
		last_reset_timestamp = EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000,
		updated_at = CURRENT_TIMESTAMP
	FROM image_quota_configs cfg
	WHERE uq.server_disc_id = cfg.server_disc_id
	AND uq.user_disc_id IS NOT NULL
	AND uq.first_usage_timestamp IS NOT NULL
	AND uq.first_usage_timestamp + (cfg.per_user_reset_days * 24 * 60 * 60 * 1000) < EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000;

	GET DIAGNOSTICS reset_count = ROW_COUNT;

	-- Reset server quotas where reset period has passed
	UPDATE image_quotas uq
	SET
		usage_count = 0,
		first_usage_timestamp = NULL,
		last_reset_timestamp = EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000,
		updated_at = CURRENT_TIMESTAMP
	FROM image_quota_configs cfg
	WHERE uq.server_disc_id = cfg.server_disc_id
	AND uq.user_disc_id IS NULL
	AND uq.first_usage_timestamp IS NOT NULL
	AND uq.first_usage_timestamp + (cfg.server_reset_days * 24 * 60 * 60 * 1000) < EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000;

	GET DIAGNOSTICS deleted_count = ROW_COUNT;

	RETURN reset_count + deleted_count;
END;
$$ LANGUAGE plpgsql;
```

**pg_cron Schedule:**
```sql
-- Run daily at midnight
INSERT INTO cron.job (jobname, schedule, command, nodename, nodeport, database, username)
VALUES (
	'tomoribot_image_quota_reset',
	'0 0 * * *',  -- Daily at midnight
	'SELECT cleanup_expired_image_quotas();',
	'localhost',
	5432,
	current_database(),
	current_user
)
ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule;
```

#### 3.6: New Command: `/server quota imagegen`

**Command Definition:**
```typescript
// src/commands/serverconfig/quota/imagegen.ts

{
	name: "imagegen",
	description: "Configure image generation quotas",
	options: [
		{
			name: "per_user_quota",
			description: "Maximum images per user per period (1-1000)",
			type: ApplicationCommandOptionType.Integer,
			required: true,
			min_value: 1,
			max_value: 1000,
		},
		{
			name: "per_user_reset_days",
			description: "Days before user quota resets (1-365)",
			type: ApplicationCommandOptionType.Integer,
			required: true,
			min_value: 1,
			max_value: 365,
		},
		{
			name: "server_quota",
			description: "Maximum images for entire server per period (1-10000)",
			type: ApplicationCommandOptionType.Integer,
			required: true,
			min_value: 1,
			max_value: 10000,
		},
		{
			name: "server_reset_days",
			description: "Days before server quota resets (1-365)",
			type: ApplicationCommandOptionType.Integer,
			required: true,
			min_value: 1,
			max_value: 365,
		},
	],
}
```

**Execution:**
```typescript
export async function execute(interaction: ChatInputCommandInteraction) {
	const serverId = interaction.guild?.id;
	if (!serverId) return;

	const perUserQuota = interaction.options.getInteger("per_user_quota", true);
	const perUserResetDays = interaction.options.getInteger("per_user_reset_days", true);
	const serverQuota = interaction.options.getInteger("server_quota", true);
	const serverResetDays = interaction.options.getInteger("server_reset_days", true);

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	// Upsert configuration
	await sql`
		INSERT INTO image_quota_configs (
			server_disc_id,
			per_user_quota,
			per_user_reset_days,
			server_quota,
			server_reset_days
		)
		VALUES (${serverId}, ${perUserQuota}, ${perUserResetDays}, ${serverQuota}, ${serverResetDays})
		ON CONFLICT (server_disc_id)
		DO UPDATE SET
			per_user_quota = ${perUserQuota},
			per_user_reset_days = ${perUserResetDays},
			server_quota = ${serverQuota},
			server_reset_days = ${serverResetDays},
			updated_at = CURRENT_TIMESTAMP
	`;

	await replyInfoEmbed(interaction, locale, {
		titleKey: "server.quota.imagegen.title",
		descriptionKey: "server.quota.imagegen.success",
		descriptionVars: {
			perUserQuota: perUserQuota.toString(),
			perUserResetDays: perUserResetDays.toString(),
			serverQuota: serverQuota.toString(),
			serverResetDays: serverResetDays.toString(),
		},
	});
}
```

#### 3.7: Quota Status Command (Optional)

**Command:** `/status imagequota`

Shows current quota usage and remaining quota:
```
📊 Image Generation Quota Status

👤 Your Usage: 3 / 10 images
⏱️ Resets in: 4 days

🌐 Server Usage: 45 / 100 images
⏱️ Resets in: 12 days
```

#### 3.8: Integration with Image Generation

**Update Image Generation Tool:**
```typescript
// src/tools/functionCalls/imageGenerationTool.ts

import { checkImageQuota, incrementImageQuota } from "@/utils/quota/imageQuotaManager";

export async function execute(...) {
	// Check quota before generating
	const quotaCheck = await checkImageQuota(serverId, userId);

	if (!quotaCheck.allowed) {
		if (quotaCheck.reason === 'user_quota_exceeded') {
			return {
				error: `You've reached your image generation quota (${quotaCheck.quotaLimit} images). Quota resets in ${quotaCheck.remainingDays} days.`,
			};
		}

		if (quotaCheck.reason === 'server_quota_exceeded') {
			return {
				error: `This server has reached its image generation quota (${quotaCheck.quotaLimit} images). Quota resets in ${quotaCheck.remainingDays} days.`,
			};
		}
	}

	// Generate image
	const imageUrl = await generateImage(prompt);

	// Increment quota after success
	await incrementImageQuota(serverId, userId);

	return { imageUrl };
}
```

**Update `/generate image` Command:**
```typescript
// src/commands/bot/generate.ts

export async function execute(interaction: ChatInputCommandInteraction) {
	// Same quota check as tool
	const quotaCheck = await checkImageQuota(serverId, userId);

	if (!quotaCheck.allowed) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "bot.generate.quota_exceeded_title",
			descriptionKey: quotaCheck.reason === 'user_quota_exceeded'
				? "bot.generate.user_quota_exceeded"
				: "bot.generate.server_quota_exceeded",
			descriptionVars: {
				limit: quotaCheck.quotaLimit.toString(),
				days: quotaCheck.remainingDays.toString(),
			},
		});
		return;
	}

	// ... generate image ...

	await incrementImageQuota(serverId, userId);
}
```

#### 3.9: Implementation Checklist

- [ ] **Database Schema**
  - [ ] Create `image_quotas` table
  - [ ] Create `image_quota_configs` table
  - [ ] Create `cleanup_expired_image_quotas()` function
  - [ ] Add pg_cron job for daily cleanup
  - [ ] Test schema in development environment

- [ ] **Quota Manager Utility**
  - [ ] Create `src/utils/quota/imageQuotaManager.ts`
  - [ ] Implement `checkImageQuota()`
  - [ ] Implement `incrementImageQuota()`
  - [ ] Add JSDoc comments
  - [ ] Add unit tests for atomic increment

- [ ] **Configuration Command**
  - [ ] Create `src/commands/serverconfig/quota/imagegen.ts`
  - [ ] Add locale keys for all languages
  - [ ] Add validation for quota values
  - [ ] Test command in development

- [ ] **Status Command (Optional)**
  - [ ] Create `src/commands/status/imagequota.ts`
  - [ ] Add locale keys for all languages
  - [ ] Show user and server usage
  - [ ] Show remaining time until reset

- [ ] **Image Generation Integration**
  - [ ] Update `src/tools/functionCalls/imageGenerationTool.ts` to check quotas
  - [ ] Update `src/commands/bot/generate.ts` to check quotas
  - [ ] Add quota increment after successful generation
  - [ ] Add user-facing error messages for quota exceeded

- [ ] **Localization**
  - [ ] Add quota configuration keys (`server.quota.imagegen.*`)
  - [ ] Add quota exceeded error keys (`bot.generate.quota_exceeded_*`)
  - [ ] Add quota status keys (`status.imagequota.*`)
  - [ ] Translate to all supported languages

- [ ] **Testing**
  - [ ] Configure quota via `/server quota imagegen`
  - [ ] Generate images up to user quota limit
  - [ ] Verify user quota exceeded message
  - [ ] Generate images up to server quota limit
  - [ ] Verify server quota exceeded message
  - [ ] Wait for reset period (or manually reset in DB)
  - [ ] Verify quotas reset correctly
  - [ ] Test concurrent image generation (race condition test)
  - [ ] Verify atomic increment works correctly

- [ ] **Documentation**
  - [ ] Move this roadmap content to main documentation sections
  - [ ] Document quota system in `19_CooldownSystem.md` (or create `20_QuotaSystem.md`)
  - [ ] Add quota configuration to `.env.example` (if any env vars needed)
  - [ ] Update README with quota command examples

#### 3.10: Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Separate Table** | ✅ Yes | Quotas are persistent, cooldowns are ephemeral |
| **Reset Logic** | Rolling window | Fairer, prevents quota hoarding |
| **Concurrency** | Atomic increment | Prevents race conditions with multiple concurrent generations |
| **Cleanup Frequency** | Daily at midnight | Sufficient for day-based reset periods |
| **Quota Defaults** | No defaults | Require explicit configuration per server |
| **Status Command** | Optional | Nice-to-have for user transparency |

---

### 🎯 Implementation Priority

**Recommended Order:**

1. **Phase 1: Cooldown Schema Refactor** (foundation for Phase 2)
   - Simplifies code for future changes
   - Relatively low risk (cooldowns regenerate quickly)
   - Estimated time: 2-3 hours

2. **Phase 2: Command Reorganization** (depends on Phase 1)
   - Improves command discoverability
   - Extends cooldowns to `/bot` commands
   - Estimated time: 3-4 hours

3. **Phase 3: Image Quota System** (independent, can be parallel)
   - Adds new functionality
   - More complex (quota tracking, reset logic)
   - Estimated time: 6-8 hours

**Total Estimated Time:** 11-15 hours

---

### 📝 Notes for Implementers

- **Cache Invalidation:** After Phase 2 command reorganization, update cache invalidation calls to match new command structure
- **Locale Key Migration:** Use search/replace for locale key updates (e.g., `config.cooldown.` → `server.cooldown.triggers.`)
- **Testing Strategy:** Test each phase independently before moving to next
- **Rollback Plan:** Phase 1 can be rolled back by restoring old schema (cooldowns regenerate). Phases 2-3 have no rollback risk (additive changes)
- **User Communication:** Announce quota system introduction to server admins before enabling (manage expectations on image generation limits)
