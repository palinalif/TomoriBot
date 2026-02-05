# 16. In-Memory Caching System

This document describes TomoriBot's in-memory caching system, which reduces database queries by 60-70% through TTL-based caching with event-driven invalidation. The system includes **10 caches** covering server configuration, user data, webhooks, LLM capabilities, and short-term conversation memory.

## Table of Contents

- [Overview](#overview)
- [⚠️ Critical Rules](#️-critical-rules)
- [Why Caching?](#why-caching)
- [Cache Types](#cache-types)
  - [TomoriState Cache](#tomoristate-cache)
  - [User Cache](#user-cache)
  - [Emoji/Sticker Cache](#emojisticker-cache)
  - [Channel Whitelist Cache](#channel-whitelist-cache)
  - [Short-Term Memory Cache](#short-term-memory-cache)
  - [LLM Configuration Cache](#llm-configuration-cache)
  - [Webhook Cache](#webhook-cache)
  - [Preset Avatar Cache](#preset-avatar-cache)
  - [OpenRouter Capability Cache](#openrouter-capability-cache)
- [Configuration](#configuration)
- [Cache Invalidation](#cache-invalidation)
- [Cache Invalidation Anti-Patterns](#cache-invalidation-anti-patterns)
- [Adding Cache Support to New Code](#adding-cache-support-to-new-code)
- [Checklist for New Features](#checklist-for-new-features)
- [Monitoring and Debugging](#monitoring-and-debugging)
- [Architecture Decisions](#architecture-decisions)

---

## Overview

TomoriBot uses a TTL (Time-To-Live) based in-memory caching system to reduce database load. The system follows these principles:

1. **Read-through caching**: Cache miss triggers DB query, result is cached
2. **Event-driven invalidation**: Commands that modify data invalidate relevant caches
3. **Graceful fallback**: On DB errors, stale cache is returned if available
4. **Configurable TTLs**: Cache durations can be tuned via environment variables

---

## ⚠️ Critical Rules

> **ALWAYS INVALIDATE CACHES AFTER SUCCESSFUL DATABASE WRITES!**

**Failure to invalidate leads to:**
- ❌ Stale data shown to users
- ❌ Config changes not applying
- ❌ Memory updates not reflecting
- ❌ Cooldowns not working correctly
- ❌ Whitelist changes not taking effect

**Golden Rule:**
```typescript
// 1. Perform database write
await sql`UPDATE tomoris SET ... WHERE server_id = ${serverId}`;

// 2. ✅ IMMEDIATELY invalidate affected cache
invalidateTomoriStateCache(serverId);

// 3. Send success response
await replyInfoEmbed(interaction, locale, { ... });
```

**Never:**
- ❌ Invalidate BEFORE the database write (might fail after invalidation)
- ❌ Forget to invalidate in error handling paths
- ❌ Skip invalidation because "TTL will handle it" (causes stale data for TTL duration)
- ❌ Try to update cache manually (error-prone, use invalidation instead)

---

## Why Caching?

### The Problem

Before caching, every message triggered multiple database queries:

| Component | Queries per Message |
|-----------|---------------------|
| TomoriState (server config) | 3-4 queries |
| User data (author) | 2-3 queries |
| User data (per mention) | 2-3 queries × N |
| Emoji/Sticker lists | 2-4 queries |
| **Total** | **10-15+ queries** |

With high message volume, this resulted in excessive database costs.

### The Solution

Caching reduces this to **0-1 queries** for most messages:

| Scenario | Queries |
|----------|---------|
| All caches hit | 0 |
| TomoriState miss only | 3-4 |
| User cache miss only | 2-3 |
| First message after config change | Same as before (then cached) |

**Expected hit rate**: 60-70%+ in normal usage patterns.

---

## Cache Types

### TomoriState Cache

**Location**: `src/utils/cache/tomoriStateCache.ts`

**What it caches**: Complete server configuration loaded by `loadTomoriState()`.

| Data | Source Table |
|------|--------------|
| Bot personality, nickname, attributes | `tomoris` |
| API keys, temperature, permissions, triggers | `tomori_configs` |
| Model provider, codename, capabilities | `llms` |
| Server-wide learned facts | `server_memories` |

**Cache structure**:
```typescript
Map<serverDiscId, {
  state: TomoriState,  // Full bot config object
  cachedAt: number     // Timestamp for TTL check
}>
```

**Default TTL**: 10 minutes

**Key functions**:
```typescript
import {
  getCachedTomoriState,
  invalidateTomoriStateCache
} from "@/utils/cache/tomoriStateCache";

// Read (auto-caches on miss)
const state = await getCachedTomoriState(serverDiscId);

// Invalidate after DB write
invalidateTomoriStateCache(serverDiscId);
```

---

### User Cache

**Location**: `src/utils/cache/userCache.ts`

**What it caches**: User preferences and per-server blacklist status.

| Data | Source Table |
|------|--------------|
| Nickname, language, personal memories | `users` |
| Privacy level | `users` |
| Blacklist status (per server) | `personalization_blacklist` |

**Cache structure**:
```typescript
Map<userDiscId, {
  userRow: UserRow | null,
  privacyLevel: PrivacyLevel,
  blacklistStatus: Map<serverDiscId, boolean>,  // Lazy-loaded per server
  cachedAt: number
}>
```

**Default TTL**: 30 minutes

**Key functions**:
```typescript
import {
  getCachedUserRow,
  getCachedPrivacyLevel,
  getCachedBlacklistStatus,
  invalidateUserCache,
  invalidateUserBlacklistCache
} from "@/utils/cache/userCache";

// Read functions (auto-cache on miss)
const user = await getCachedUserRow(userDiscId);
const privacy = await getCachedPrivacyLevel(userDiscId);
const isBlacklisted = await getCachedBlacklistStatus(serverDiscId, userDiscId);

// Invalidate after user data change
invalidateUserCache(userDiscId);

// Invalidate only blacklist (more granular)
invalidateUserBlacklistCache(serverDiscId, userDiscId);
```

---

### Emoji/Sticker Cache

**Location**: `src/utils/cache/emojiStickerCache.ts`

**What it caches**: Server emoji and sticker lists for expression handling.

**Default TTL**: 10 minutes

**Key functions**:
```typescript
import {
  getCachedEmojiStickerData,
  invalidateEmojiStickerCache
} from "@/utils/cache/emojiStickerCache";
```

---

### Channel Whitelist Cache

**Location**: `src/utils/cache/channelWhitelistCache.ts`

**What it caches**: Channel whitelist status and per-channel cooldown overrides.

| Data | Source Table |
|------|--------------|
| Whitelist existence | `channel_whitelist` |
| Channel-specific cooldown settings | `channel_whitelist` |
| Blocked status for non-whitelisted channels | Derived |

**Cache structure**:
```typescript
Map<"serverDiscId:channelDiscId", {
  result: WhitelistCheckResult,  // Whitelist status + cooldown overrides
  expiresAt: number              // TTL expiry timestamp
}>
```

**Default TTL**: 5 minutes (configurable via `CHANNEL_WHITELIST_CACHE_TTL_MINUTES`)

**Key functions**:
```typescript
import {
  getCachedWhitelistStatus,
  invalidateWhitelistCache
} from "@/utils/cache/channelWhitelistCache";

// Read (auto-caches on miss)
const whitelistStatus = await getCachedWhitelistStatus(serverDiscId, channelDiscId);

// Invalidate entire server (all channels)
invalidateWhitelistCache(serverDiscId);

// Invalidate specific channel
invalidateWhitelistCache(serverDiscId, channelDiscId);
```

**When to invalidate:**
- ✅ After adding/removing channels from whitelist
- ✅ After changing channel-specific cooldown settings
- ✅ After modifying global cooldown settings (affects whitelist behavior)

**Used by:** `src/utils/db/messageCooldown.ts` (cooldown system)

---

### Short-Term Memory Cache

**Location**: `src/utils/cache/shortTermMemoryCache.ts`

**What it caches**: Recent conversations (last 10 messages per channel) and AI-generated summaries for cross-channel awareness.

| Data | Storage | TTL |
|------|---------|-----|
| Crude conversations (last 10 messages) | In-memory only | 12 hours (default) |
| AI-generated summaries | In-memory only | 24 hours (default) |

**Cache structure**:
```typescript
Map<"shortterm:userId:channelId", {
  messages: ShortTermMessage[],  // Last 10 condensed turns
  summary?: string,               // Tool-generated summary (optional)
  serverId: string,
  serverName?: string,
  channelId: string,
  channelName?: string,
  lastUpdated: number
}>
```

**Configuration** (environment variables):
- `SHORT_TERM_MEMORY_TTL_HOURS` - Crude conversation TTL (default: 12)
- `SHORT_TERM_MEMORY_SUMMARY_TTL_HOURS` - Summary TTL (default: 24)
- `SHORT_TERM_MEMORY_MAX_SUMMARY_LENGTH` - Max summary characters (default: 1500)
- `SHORT_TERM_MEMORY_MIN_MESSAGES_FOR_SUMMARY` - Min messages before prompting summary (default: 6)
- `SHORT_TERM_MEMORY_MAX_MESSAGES_PER_CHANNEL` - Messages stored per channel (default: 10)
- `SHORT_TERM_MEMORY_MAX_OTHER_CHANNELS` - Max other-channel memories in context (default: 3)

**Key functions**:
```typescript
import {
  getShortTermMemories,
  addShortTermMemory,
  updateShortTermMemorySummary,
  clearShortTermMemoryForUser,
  clearShortTermMemoryForChannel
} from "@/utils/cache/shortTermMemoryCache";

// Read memories for a user (returns up to N other channels)
const memories = await getShortTermMemories(userId, currentChannelId, maxOtherChannels);

// Add new message to conversation
await addShortTermMemory(userId, channelId, serverId, role, content, serverName, channelName);

// Update with AI-generated summary (via tool)
await updateShortTermMemorySummary(userId, channelId, summary);

// Clear all memories for a user (privacy)
clearShortTermMemoryForUser(userId);

// Clear memories for a specific channel
clearShortTermMemoryForChannel(channelId);
```

**When to invalidate:**
- ✅ User privacy request (`/personal cache crossserver off`)
- ✅ Channel deletion
- ✅ User requests data deletion

**Features:**
- Privacy-respecting cross-server sharing (user opt-in via `/personal cache crossserver`)
- Relative timestamps (e.g., "2 hours ago")
- AI-generated summaries replace crude conversations for efficiency
- Max N other-channel memories in context (configurable)

**Used by:** `src/events/messageCreate/tomoriChat.ts` (cross-channel context awareness)

---

### LLM Configuration Cache

**Location**: `src/utils/cache/llmCache.ts`

**What it caches**: LLM model configurations (providers, capabilities, metadata).

| Data | Source Table |
|------|--------------|
| Model provider, codename, capabilities | `llms` |
| Tool support, vision, reasoning flags | `llms` |

**Cache structure**:
```typescript
Map<llm_id, LlmRow>  // All LLM models loaded at startup
```

**Default TTL**: **No TTL** (warmed on startup, persistent until restart)

**Key functions**:
```typescript
import {
  initializeLLMCache,
  getCachedLLM,
  getAllCachedLLMs
} from "@/utils/cache/llmCache";

// Initialize at startup (called in src/index.ts)
await initializeLLMCache();

// Read (from cache only, no DB query)
const llm = getCachedLLM(llmId);
const allLLMs = getAllCachedLLMs();
```

**When to invalidate:**
- ✅ After adding new LLM models to database (restart bot or re-initialize cache)
- ✅ After modifying LLM capabilities/flags

**Note:** This cache is warmed on startup and does **not** invalidate during runtime. Changes to `llms` table require bot restart or manual cache re-initialization.

**Used by:** All LLM provider code, model selection commands

---

### Webhook Cache

**Location**: `src/utils/discord/webhookManager.ts`

**What it caches**: Discord webhooks for multi-persona avatar support.

**Cache structure**:
```typescript
// General webhooks (one per channel)
Map<channelId, Webhook>

// Persona-specific webhooks (per-persona avatars, non-production only)
Map<"channelId:personaId", Webhook>
```

**Default TTL**: **No TTL** (webhooks persist until manually deleted by users or bot restart)

**Key functions**:
```typescript
import {
  getOrCreateWebhook,
  getOrCreatePersonaWebhook,
  invalidateWebhookCache,
  invalidatePersonaWebhookCacheForPersona
} from "@/utils/discord/webhookManager";

// Get or create general webhook
const webhook = await getOrCreateWebhook(channel);

// Get or create persona-specific webhook (non-production)
const personaWebhook = await getOrCreatePersonaWebhook(channel, persona);

// Invalidate all webhooks for a channel
invalidateWebhookCache(channelId);

// Invalidate all webhooks for a specific persona
invalidatePersonaWebhookCacheForPersona(personaId);
```

**When to invalidate:**
- ✅ When user manually deletes webhook in Discord
- ✅ When persona avatar URL changes (`webhook_avatar_url` modified)
- ✅ When persona is deleted

**Token Validation:** Automatically recreates webhooks if token is missing (deleted by user).

**Used by:** Multi-persona chat responses

---

### Preset Avatar Cache

**Location**: `src/utils/image/avatarHelper.ts`

**What it caches**: Preset personality avatars as base64 data URIs for fast persona switching.

**Cache structure**:
```typescript
Map<preset_id, string | null>  // base64 data URI or null if no avatar
```

**Default TTL**: **No TTL** (warmed on startup, persistent until restart)

**Key functions**:
```typescript
import {
  initializePresetAvatarCache,
  getCachedPresetAvatar
} from "@/utils/image/avatarHelper";

// Initialize at startup (called in src/index.ts)
await initializePresetAvatarCache(presets);

// Read (from cache only, no file I/O)
const avatarDataUri = getCachedPresetAvatar(presetId);
```

**When to invalidate:**
- ✅ After modifying preset avatars on disk (restart bot or re-initialize cache)
- ✅ After adding/removing presets

**Note:** This cache is warmed on startup and does **not** invalidate during runtime. Changes to preset avatars require bot restart or manual cache re-initialization.

**Used by:** Persona switching commands, preset import/export

---

### OpenRouter Capability Cache

**Location**: `src/utils/cache/openrouterCapabilityCache.ts`

**What it caches**: OpenRouter model capabilities (tools, vision, structured output) fetched from OpenRouter API.

**Cache structure**:
```typescript
Map<llm_codename, ModelCapabilities>  // e.g., "anthropic/claude-3.5-sonnet"
```

**Default TTL**: **No TTL** (warmed on startup, persistent until restart)

**Key functions**:
```typescript
import {
  initializeOpenRouterCapabilityCache,
  getOpenRouterCapabilities
} from "@/utils/cache/openrouterCapabilityCache";

// Initialize at startup (called in src/index.ts)
await initializeOpenRouterCapabilityCache();

// Read (from cache only, no API call)
const capabilities = getOpenRouterCapabilities(llmCodename);
```

**When to invalidate:**
- ✅ After OpenRouter adds new models (restart bot or re-initialize cache)
- ✅ After OpenRouter changes model capabilities

**Note:** This cache fetches from OpenRouter API at startup to ensure accurate capabilities. Does **not** invalidate during runtime. Changes require bot restart.

**Used by:** OpenRouter provider, model capability checks

---

## Configuration

All cache TTLs are configurable via environment variables:

```bash
# .env or .env.local

# TomoriState cache: server config, personality, memories
TOMORI_STATE_CACHE_TTL_MINUTES=10

# User cache: user preferences, privacy level, personal memories
USER_CACHE_TTL_MINUTES=30

# Emoji/Sticker cache: server emoji and sticker lists
EMOJI_STICKER_CACHE_TTL_MINUTES=10

# Channel Whitelist cache: whitelist status and per-channel cooldown overrides
CHANNEL_WHITELIST_CACHE_TTL_MINUTES=5

# Short-Term Memory cache: conversation history and summaries
SHORT_TERM_MEMORY_TTL_HOURS=12                     # Crude conversation TTL
SHORT_TERM_MEMORY_SUMMARY_TTL_HOURS=24            # AI-generated summary TTL
SHORT_TERM_MEMORY_MAX_SUMMARY_LENGTH=1500         # Max summary characters
SHORT_TERM_MEMORY_MIN_MESSAGES_FOR_SUMMARY=6      # Min messages before prompting summary
SHORT_TERM_MEMORY_MAX_MESSAGES_PER_CHANNEL=10     # Messages stored per channel
SHORT_TERM_MEMORY_MAX_OTHER_CHANNELS=3            # Max other-channel memories in context
```

**Note:** LLM Config, Webhook, Preset Avatar, and OpenRouter Capability caches have **no TTL** (warmed on startup, persistent until restart).

### Tuning Guidelines

| Scenario | Recommended TTL |
|----------|-----------------|
| High-traffic servers | Lower (5-10 min) for fresher data |
| Low-traffic servers | Higher (30-60 min) to reduce DB load |
| Development/testing | Very low (1-2 min) for quick feedback |
| Config changes not reflecting | Check invalidation is working, or lower TTL |

---

## Cache Invalidation

### When to Invalidate

Caches must be invalidated **after successful database writes** that modify cached data.

| Action | Cache to Invalidate | Function |
|--------|---------------------|----------|
| `/config *` commands | TomoriState | `invalidateTomoriStateCache(serverDiscId)` |
| `/config cooldown` | TomoriState + Whitelist | `invalidateTomoriStateCache(serverDiscId)` + `invalidateWhitelistCache(serverDiscId)` |
| `/teach *` commands | TomoriState | `invalidateTomoriStateCache(serverDiscId)` |
| `/forget *` commands | TomoriState | `invalidateTomoriStateCache(serverDiscId)` |
| `/persona default` | TomoriState | `invalidateTomoriStateCache(serverDiscId)` |
| `/persona swap` (avatar change) | TomoriState + Webhook | `invalidateTomoriStateCache(serverDiscId)` + `invalidateWebhookCache(channelId)` |
| `/server trigger *` | TomoriState | `invalidateTomoriStateCache(serverDiscId)` |
| `/server whitelist *` | Whitelist | `invalidateWhitelistCache(serverDiscId, channelDiscId?)` |
| `/personal *` commands | User cache | `invalidateUserCache(userDiscId)` |
| `/personal cache crossserver off` | Short-Term Memory | `clearShortTermMemoryForUser(userDiscId)` |
| `/server blacklist` | Blacklist only | `invalidateUserBlacklistCache(serverId, userId)` |
| `remember_this_fact` tool (server) | TomoriState | `invalidateTomoriStateCache(serverDiscId)` |
| `remember_this_fact` tool (user) | User cache | `invalidateUserCache(targetUserDiscId)` |
| `update_short_term_memory` tool | Short-Term Memory | Automatic (cache updated directly) |
| Emoji/Sticker Discord events | Emoji/Sticker | `invalidateEmojiStickerCache(serverDiscId)` |

### Invalidation Pattern

```typescript
// 1. Perform database write
await sql`UPDATE tomori_configs SET ... WHERE ...`;

// 2. Invalidate cache BEFORE success response
invalidateTomoriStateCache(interaction.guild?.id ?? interaction.user.id);

// 3. Send success response
await replyInfoEmbed(interaction, locale, { ... });
```

**Important**: Always invalidate **after** the DB write succeeds but **before** the success message. This ensures the next message sees fresh data.

---

## Cache Invalidation Anti-Patterns

This section documents **common mistakes** that lead to stale cache bugs and how to avoid them.

### ❌ Anti-Pattern 1: Forgetting to Invalidate After DB Write

**Problem:** Cache contains stale data after database update.

```typescript
// ❌ BAD: Cache not invalidated after update
await sql`UPDATE tomoris SET autotrigger = ${newValue} WHERE server_id = ${serverId}`;
// Next request will use old cached value!
await replyInfoEmbed(interaction, locale, { ... });
```

**Solution:** Always invalidate immediately after successful write.

```typescript
// ✅ GOOD: Cache invalidated after update
await sql`UPDATE tomoris SET autotrigger = ${newValue} WHERE server_id = ${serverId}`;
invalidateTomoriStateCache(serverId);  // ✅ Cache refreshed on next access
await replyInfoEmbed(interaction, locale, { ... });
```

---

### ❌ Anti-Pattern 2: Invalidating Before DB Write

**Problem:** Cache invalidated before write completes. If write fails, cache is invalidated for no reason.

```typescript
// ❌ BAD: Invalidating too early
invalidateTomoriStateCache(serverId);  // ❌ Wrong order!
await sql`UPDATE tomoris SET ...`;     // Update might fail after invalidation
```

**Solution:** Always invalidate **after** successful write.

```typescript
// ✅ GOOD: Write first, then invalidate
await sql`UPDATE tomoris SET ...`;     // ✅ Update first
invalidateTomoriStateCache(serverId);  // Then invalidate
```

---

### ❌ Anti-Pattern 3: Not Invalidating in All Code Paths

**Problem:** Cache invalidated in success path but not in error handling or alternate paths.

```typescript
// ❌ BAD: Missing invalidation in error handling
try {
	await sql`UPDATE tomoris SET ...`;
	invalidateTomoriStateCache(serverId);  // ✅ Good
} catch (error) {
	await sql`UPDATE tomoris SET fallback_value = ...`;  // ❌ No invalidation!
	throw error;
}
```

**Solution:** Use `finally` block or invalidate in all paths.

```typescript
// ✅ GOOD: Invalidate in all paths
try {
	await sql`UPDATE tomoris SET ...`;
} catch (error) {
	await sql`UPDATE tomoris SET fallback_value = ...`;
	throw error;
} finally {
	invalidateTomoriStateCache(serverId);  // ✅ Always invalidate
}
```

---

### ❌ Anti-Pattern 4: Trying to Update Cache Manually

**Problem:** Manually updating cached values is error-prone and causes inconsistencies.

```typescript
// ❌ BAD: Manually updating cache
const cachedState = await getCachedTomoriState(serverId);
cachedState.autotrigger = newValue;  // ❌ Dangerous! Other fields might be stale
// No guarantee cache is updated correctly
```

**Solution:** Always invalidate and let the cache refresh on next access.

```typescript
// ✅ GOOD: Invalidate and let cache refresh naturally
await sql`UPDATE tomoris SET autotrigger = ${newValue} WHERE server_id = ${serverId}`;
invalidateTomoriStateCache(serverId);  // ✅ Next access gets fresh data from DB
```

---

### ❌ Anti-Pattern 5: Assuming TTL is Enough

**Problem:** Relying on TTL expiration instead of explicit invalidation causes stale data for TTL duration.

```typescript
// ❌ BAD: No invalidation, relying on TTL
await sql`UPDATE tomoris SET tomori_nickname = ${newNickname} WHERE server_id = ${serverId}`;
// User sees old nickname for up to 10 minutes (TTL duration)
```

**Solution:** Always invalidate explicitly, even with TTL.

```typescript
// ✅ GOOD: Explicit invalidation for immediate consistency
await sql`UPDATE tomoris SET tomori_nickname = ${newNickname} WHERE server_id = ${serverId}`;
invalidateTomoriStateCache(serverId);  // ✅ Changes visible immediately
```

**Rationale:** TTL is a safety net, not a replacement for proper invalidation.

---

### ❌ Anti-Pattern 6: Invalidating Wrong Cache

**Problem:** Invalidating unrelated cache or forgetting related caches.

```typescript
// ❌ BAD: Forgot to invalidate whitelist cache after changing cooldown settings
await sql`UPDATE tomori_configs SET cooldown_type = ${newType} WHERE server_id = ${serverId}`;
invalidateTomoriStateCache(serverId);  // ✅ Good, but not enough!
// Whitelist cache contains channel-specific cooldown settings - also needs invalidation!
```

**Solution:** Invalidate **all** affected caches.

```typescript
// ✅ GOOD: Invalidate all related caches
await sql`UPDATE tomori_configs SET cooldown_type = ${newType} WHERE server_id = ${serverId}`;
invalidateTomoriStateCache(serverId);       // ✅ Global config
invalidateWhitelistCache(serverId);         // ✅ Channel-specific overrides
```

---

### ❌ Anti-Pattern 7: Clearing Entire Cache Instead of Specific Entry

**Problem:** Clearing entire cache when only one entry needs invalidation.

```typescript
// ❌ BAD: Nuclear option - clears ALL servers
await sql`UPDATE tomoris SET ... WHERE server_id = ${serverId}`;
clearTomoriStateCache();  // ❌ Clears cache for ALL servers!
```

**Solution:** Invalidate only the affected entry.

```typescript
// ✅ GOOD: Targeted invalidation
await sql`UPDATE tomoris SET ... WHERE server_id = ${serverId}`;
invalidateTomoriStateCache(serverId);  // ✅ Only affects this server
```

**When to use `clearCache()`:** Only for debugging or bot restart scenarios.

---

### ✅ Cache Invalidation Best Practices

1. **Invalidate After Success:** Only invalidate after DB write succeeds
2. **Invalidate Before Response:** Always before sending success message to user
3. **Invalidate All Affected:** Consider all caches that might be affected
4. **Use Specific Invalidation:** Don't clear entire cache unless necessary
5. **Document Dependencies:** Add comments explaining which caches need invalidation
6. **Test Invalidation:** Verify changes appear immediately after commands

---

## Adding Cache Support to New Code

### For New Commands That Modify TomoriState

1. **Add import**:
```typescript
import {
  getCachedTomoriState,
  invalidateTomoriStateCache
} from "@/utils/cache/tomoriStateCache";
// Path varies by directory depth: ../../, ../../../, etc.
```

2. **Replace `loadTomoriState` calls**:
```typescript
// Before
const tomoriState = await loadTomoriState(serverId);

// After
const tomoriState = await getCachedTomoriState(serverId);
```

3. **Add invalidation before success message**:
```typescript
// After DB write, before success response
invalidateTomoriStateCache(interaction.guild?.id ?? interaction.user.id);
```

### For New Commands That Modify User Data

1. **Add import**:
```typescript
import { invalidateUserCache } from "@/utils/cache/userCache";
```

2. **Add invalidation after DB write**:
```typescript
// For user preference changes
invalidateUserCache(interaction.user.id);

// For blacklist changes
invalidateUserBlacklistCache(serverDiscId, targetUserDiscId);
```

### For New Tools That Modify Data

Tools (function calls) that write to the database also need invalidation. See `memoryTool.ts` for an example:

```typescript
// After successful server memory save
invalidateTomoriStateCache(serverId);

// After successful personal memory save
invalidateUserCache(targetUserDiscordIdArg);
```

---

## Checklist for New Features

Use this checklist when adding new commands, tools, or features to ensure proper cache handling:

### Before Writing Code

- [ ] **Does this feature read cached data?**
  - If yes, identify which cache(s) to use (`getCachedTomoriState`, `getCachedUserRow`, etc.)
  - Use cached versions instead of direct DB queries

- [ ] **Does this feature modify cached data?**
  - If yes, identify which cache(s) need invalidation
  - Plan invalidation points in the code

### During Implementation

- [ ] **Import cache functions**
  - Add imports for `getCached*` functions (for reads)
  - Add imports for `invalidate*` functions (for writes)

- [ ] **Replace direct DB queries with cached reads**
  - Replace `loadTomoriState()` with `getCachedTomoriState()`
  - Replace direct user queries with `getCachedUserRow()`

- [ ] **Add invalidation after DB writes**
  - Place invalidation **after** DB write succeeds
  - Place invalidation **before** success response to user

- [ ] **Handle all code paths**
  - Invalidate in success path
  - Invalidate in error/fallback paths (use `finally` if needed)
  - Don't skip invalidation in early returns

### After Implementation

- [ ] **Test that changes appear immediately**
  - Run the command/tool
  - Verify changes are visible on next message/command
  - Check that no stale data is shown

- [ ] **Test error scenarios**
  - What happens if DB write fails?
  - Is cache still valid or properly invalidated?

- [ ] **Check related caches**
  - Did you invalidate **all** affected caches?
  - Example: Cooldown changes affect both TomoriState and Whitelist caches

- [ ] **Add code comments**
  - Document which caches are affected
  - Explain why specific caches are invalidated

### Common Cache Combinations

| Feature Type | Caches to Consider |
|--------------|-------------------|
| Server config changes | TomoriState, Whitelist (if cooldown-related) |
| User preference changes | User cache |
| Persona changes | TomoriState, Webhook (if avatar changed) |
| Memory updates | TomoriState (server) or User (personal) |
| Cooldown changes | TomoriState, Whitelist |
| Blacklist changes | User cache (blacklist only) |
| LLM model changes | Requires bot restart (LLM cache warmed on startup) |

### Quick Reference: When to Invalidate Each Cache

| Cache | Invalidate When... | Function |
|-------|-------------------|----------|
| **TomoriState** | Server config, persona, memories, sample dialogues change | `invalidateTomoriStateCache(serverId)` |
| **User** | User preferences, language, personal memories change | `invalidateUserCache(userId)` |
| **User Blacklist** | Blacklist status changes | `invalidateUserBlacklistCache(serverId, userId)` |
| **Emoji/Sticker** | Rarely needed (auto-synced by Discord events) | `invalidateEmojiStickerCache(serverId)` |
| **Whitelist** | Channel whitelist added/removed, channel cooldowns change | `invalidateWhitelistCache(serverId, channelId?)` |
| **Short-Term Memory** | User requests data deletion, privacy changes | `clearShortTermMemoryForUser(userId)` |
| **Webhook** | Webhook deleted by user, persona avatar URL changes | `invalidateWebhookCache(channelId)` |
| **LLM Config** | ⚠️ Requires bot restart | N/A (startup-only cache) |
| **Preset Avatar** | ⚠️ Requires bot restart | N/A (startup-only cache) |
| **OpenRouter Capability** | ⚠️ Requires bot restart | N/A (startup-only cache) |

---

## Monitoring and Debugging

### Log Messages

The cache system logs all operations. Look for these patterns:

```
[TomoriState Cache] MISS for server 123456789 - loading from DB
[TomoriState Cache] Cached state for server 123456789 (tomori: BotName)
[TomoriState Cache] HIT for server 123456789 (age: 45s)
[TomoriState Cache] STALE for server 123456789 (age: 605s)
[TomoriState Cache] Invalidated cache for server 123456789

[User Cache] MISS for user 987654321 - loading from DB
[User Cache] Cached user 987654321 (nickname: UserName, privacy: 0)
[User Cache] HIT for user 987654321 (age: 120s)
[User Cache] Blacklist MISS for user 987654321 in server 123456789
[User Cache] Invalidated cache for user 987654321
```

### Cache Statistics

Each cache tracks hit/miss statistics:

```typescript
import { getTomoriStateCacheStats } from "@/utils/cache/tomoriStateCache";
import { getUserCacheStats } from "@/utils/cache/userCache";

const tomoriStats = getTomoriStateCacheStats();
// { hits: 150, misses: 23, hitRate: "86.71%", cacheSize: 5 }

const userStats = getUserCacheStats();
// { hits: 200, misses: 30, hitRate: "86.96%", cacheSize: 15,
//   blacklistHits: 50, blacklistMisses: 10, blacklistHitRate: "83.33%" }
```

### Troubleshooting

| Symptom | Possible Cause | Solution |
|---------|---------------|----------|
| Config changes not reflecting | Missing invalidation call | Add `invalidateTomoriStateCache()` after DB write |
| Old user data showing | Missing user invalidation | Add `invalidateUserCache()` after DB write |
| High cache miss rate | TTL too low | Increase TTL via env var |
| Stale data persisting | Invalidation not called | Check command/tool has invalidation |
| Memory growth | Cache not clearing | Check `clearCache()` functions exist |

### Manual Cache Clear

For debugging, you can clear caches programmatically:

```typescript
import { clearTomoriStateCache } from "@/utils/cache/tomoriStateCache";
import { clearUserCache } from "@/utils/cache/userCache";

clearTomoriStateCache();  // Clears all TomoriState entries
clearUserCache();         // Clears all user entries
```

---

## Architecture Decisions

### Why In-Memory (Not Redis)?

1. **Simplicity**: No additional infrastructure required
2. **Latency**: In-process memory access is faster than network calls
3. **Scale**: Single-instance bot doesn't need distributed cache
4. **Memory**: Estimated ~25MB total (well under container limits)

### Why TTL-Based?

1. **Self-healing**: Stale data eventually refreshes even if invalidation fails
2. **Simplicity**: No complex dependency tracking needed
3. **Predictable**: Easy to reason about cache behavior

### Why Event-Driven Invalidation?

1. **Immediate consistency**: Changes reflect on next message
2. **Targeted**: Only invalidates affected entries, not entire cache
3. **Efficient**: No polling or scheduled refreshes needed

### Trade-offs

| Benefit | Trade-off |
|---------|-----------|
| Reduced DB queries | Slightly stale data possible |
| Lower latency | Memory usage increases |
| Simple implementation | Must remember to invalidate |
| Configurable TTLs | Requires tuning for optimal performance |

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/utils/cache/tomoriStateCache.ts` | TomoriState caching |
| `src/utils/cache/userCache.ts` | User data and blacklist caching |
| `src/utils/cache/emojiStickerCache.ts` | Emoji/sticker list caching |
| `src/events/messageCreate/tomoriChat.ts` | Main consumer of cached data |
| `src/tools/functionCalls/memoryTool.ts` | Tool with cache invalidation |
| `src/commands/config/**/*.ts` | Commands with TomoriState invalidation |
| `src/commands/personal/**/*.ts` | Commands with User cache invalidation |
