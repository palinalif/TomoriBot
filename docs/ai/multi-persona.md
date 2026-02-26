# 17. Multi-Persona System

This document describes TomoriBot's multi-persona system: how main and alter personas are stored, triggered, and rendered (webhooks, embeds, stickers, reminders), plus operational details and limitations.

## Overview

TomoriBot supports **one main persona** plus **multiple alter personas** per server.

- **Main persona**: the default identity; responds to mentions, direct replies, and auto-message triggers.
- **Alter personas**: optional additional identities with their own trigger words and (optional) custom avatars.
- **Shared context**: all personas share the same conversation history and server memories.
- **Shared config**: all personas in a server share the same `tomori_configs` row.
- **Sequential responses**: if multiple personas match a trigger, they respond one-by-one via the channel queue.

## Data Model

### `tomoris`

Each persona is a row in `tomoris`.

Key columns:
- `is_alter`: `false` for main, `true` for alters.
- `alter_triggers`: trigger words for alters (main uses `tomori_configs.trigger_words`).
- `webhook_avatar_url`: stored CDN URL for alter avatars (from import embed).

### `tomori_configs`

Server-scoped config (shared by all personas):
- `server_id` is the primary linkage.
- `trigger_words` is used by **main persona only**.

### `reminders`

Reminders are tied to a persona to preserve the identity that set them:
- `persona_id` (nullable): the `tomori_id` that created the reminder.
- When missing or invalid, reminders **fall back to the main persona**.

## Triggering and Routing

### Direct replies and mentions

- **Reply to bot** (main persona messages) → main persona responds.
- **Reply to alter webhook message** → the matching alter responds.
  - Matching is done by webhook `author.username` → persona nickname (case-insensitive).
  - Ensure persona nicknames are unique.
- **Bot mention** → main persona responds.
- **Auto-message threshold** → main persona responds.

### Trigger words

Each persona checks its own trigger list:
- **Main**: `tomori_configs.trigger_words`.
- **Alter**: `tomoris.alter_triggers`.

If multiple personas match, they respond in deterministic order based on where their trigger first appears in the message. The per-message count is capped by `/config multitrigger`.

### Manual triggers

Manual triggers can specify `selectedPersonaId`. In that case, **only that persona responds** (fallbacks apply if missing).

## Response Pipeline (Multi-Persona)

High-level flow (per incoming message):

1. Identify matching personas.
2. Queue additional personas to ensure sequential replies.
3. For each persona:
   - Build context from shared history.
   - Use isolated function-call history per persona.
   - Stream response with persona-specific webhook settings if applicable.

**Important limitation**: later personas **do not** see earlier persona responses in their context (deferred for future refactor).

## Self-Reply Chain System

To prevent infinite loops where personas continuously trigger each other, TomoriBot implements a **self-reply chain limit**.

### Overview

- **Default limit**: 3 (configurable via `/config selfreply`, max 10)
- **Scope**: Per-channel (shared across all personas)
- **Purpose**: Limit cascading persona-to-persona triggers, not user-triggered responses

### Mental Model: Nested Array

Think of the self-reply chain as a nested array with size `limit + 1`:

```javascript
// With selfReplyLimit = 3
const selfReplyChain = [
  [User/Manual],     // Index 0: Bypass phase (up to /config multitrigger per message)
  [Level 1],         // Index 1: depth = 1
  [Level 2],         // Index 2: depth = 2
  [Level 3],         // Index 3: depth = 3 (limit reached!)
  [BLOCKED]          // Index 4+: Exceeds limit, all triggers blocked
];
```

**Key concepts:**
- Each **level** = one generation of persona responses
- Each trigger message can enqueue up to the configured multi-trigger cap
- **Depth** = how many generations deep the chain has gone
- **Limit** = maximum allowed depth (not counting the user/manual trigger)

### How It Works

#### **Bypass Phase (No Limit Applied)**

These triggers do NOT increment depth and can still trigger multiple personas (up to `/config multitrigger`):

✅ **User messages** → `isSelfMessage = false`
✅ **Slash commands** (`/respond`, `/impersonate`) → `isManuallyTriggered = true`
✅ **Queued multi-persona responses** → `isManuallyTriggered = true`
✅ **Reminders** → Special flags

**Example:**
```
User: "@A, @B, @C, @D"
└─ depth = 0 (bypass phase)
└─ All 4 personas respond ✅
```

#### **Chain Phase (Limit Applied)**

Once personas respond, their messages are processed and can trigger the chain:

⚠️ **Persona message triggers another persona** → `depth += 1`

**Example with limit = 3:**
```
User: "@A"                          → depth 0 (bypass)
  A: "@B, @C"                       → depth 1 (B, C respond)
  B: "@D"                           → depth 2 (D responds)
  C: "@E"                           → depth 3 (E responds, limit reached!)
  D: "@F"                           → depth 4 (BLOCKED ❌)
  E: "@G"                           → depth 4 (BLOCKED ❌)
```

#### **Important: Depth Increments Per Trigger Message**

If one persona mentions multiple personas, depth only increments **once**:

```
A: "@B, @C, @D, @E"  → depth +1
└─ B, C, D, E all respond (one trigger message = 1 depth)
```

**NOT** per responding persona:
```
❌ WRONG: B responds → depth +1, C responds → depth +1, etc.
✅ RIGHT: One message triggers B, C, D, E → depth +1 total
```

### Chain Reset

The chain resets (depth → 0) when:

1. **User sends a message** → Immediate reset
2. **30 minutes of inactivity** → Automatic reset (`SELF_REPLY_CHAIN_TTL_MS`)

### Configuration

**Database:** `tomori_configs.self_reply_limit`
- Default: 3
- Range: 0 (disabled) to 10 (max)
- 0 = Only user/manual triggers allowed, all persona chains blocked

**Command:** `/config selfreply`

**Database:** `tomori_configs.triggered_persona_limit`
- Default: 3
- Range: 1 to 10
- Caps how many personas one message can trigger

**Command:** `/config multitrigger`

### Example Flow

**Setup:** Limit = 3, Personas A, B, C, D, E

```
Level 0: User: "@A, @B"
         └─ depth = 0, bypass phase
         └─ A, B queued to respond

Level 1: A: "Ask @C!"
         B: "Yeah, ask @C and @D!"
         └─ depth = 1 (two messages, both increment depth)
         └─ C, D respond

Level 2: C: "Hmm, ask @E!"
         └─ depth = 2
         └─ E responds

Level 3: D: "I agree with @E!"
         └─ depth = 3 (limit reached!)
         └─ E responds (last allowed)

Level 4: E: "Thanks! Ask @A!"
         └─ depth would be 4 → BLOCKED ❌
         └─ A does NOT respond

User: "Thanks everyone!"
      └─ depth = 0 (chain reset)
```

### Visual Tree Representation

```
Level 0 (User)              [User]
                               │
                    ┌──────────┴──────────┐
Level 1 (depth=1)  [A]                   [B]
                    │                     │
              ┌─────┴─────┐          ┌────┴────┐
Level 2 (d=2) [C]        [D]        [E]       [F]
               │          │          │         │
Level 3 (d=3) [G]        [H]        [I]       [J] ← LIMIT!
               │          │          │         │
Level 4       ❌         ❌         ❌        ❌  BLOCKED
```

### Key Insights

1. **User always bypasses depth** - User/manual triggers don’t consume chain depth (but still respect `/config multitrigger`)
2. **One message = one depth** - Mentioning 10 personas in one message = 1 depth increment
3. **Shared counter** - All personas share the same depth counter per channel
4. **Fair multi-triggers** - Multiple personas responding to the same message don't each add depth

### Troubleshooting

**Personas not responding after several triggers?**
- Check if self-reply limit is reached
- Look for log: `Self-reply chain limit reached (X)`
- Have a user send a message to reset the chain
- Increase limit with `/config selfreply` (max 10)

**Want to disable cascading entirely?**
- Set limit to 0: `/config selfreply limit:0`
- Only user/manual triggers will work, no persona-to-persona chains

## Webhook Strategy

Webhook usage differs by environment:

### Production

- Uses a **single channel webhook** (`TomoriBot Multi-Persona`).
- Alters send messages through that webhook with:
  - `username` = persona nickname
  - `avatarURL` = `webhook_avatar_url` (S3 URL, never expires)
- **Avatar storage**: Uploaded to S3 during import
- **Robustness**: High (S3 URLs are permanent and centralized)

### Non-production (Local Development)

- Uses **per-persona webhooks** (`TomoriBot Persona {id}`).
- Webhook avatar is **baked into the webhook** (data URI converted from download).
- **Avatar storage**: Database stores Discord CDN URLs
- **Robustness**: Enhanced with auto-recovery features (see below)

#### **Avatar URL Lifecycle (Local)**

1. **Import:** `webhook_avatar_url` = Discord CDN attachment URL (temporary, ~24h expiration)
2. **Proactive webhook creation:** Import command creates webhook in import channel immediately
3. **URL upgrade:** Webhook creation downloads temporary URL, bakes avatar, stores permanent webhook CDN URL
4. **Future webhooks:** Download permanent webhook CDN URL, bake into new webhooks

**Result:** After first use, `webhook_avatar_url` becomes a permanent Discord webhook CDN URL that never expires.

#### **Robustness Features (Local)**

##### **1. Proactive Webhook Creation**

**What:** During `/persona import`, a webhook is created immediately in the import command's channel.

**Why:** Triggers instant URL upgrade from temporary attachment URL to permanent webhook CDN URL, eliminating the 24-hour expiration window.

**Behavior:**
- Runs only in non-production (`RUN_ENV !== "production"`)
- Non-blocking (import succeeds even if webhook creation fails)
- Logs success/failure for debugging

**Code location:** `src/commands/persona/import.ts` (step 11m)

##### **2. Auto-Recovery from Deleted Webhooks**

**What:** When webhook avatar download fails (404), automatically scans guild for surviving webhooks with the same persona.

**Why:** If the last webhook is deleted, new channels can't download the avatar. Auto-recovery finds any remaining webhook and uses its avatar.

**Behavior:**
- Triggered on download failure during webhook creation
- Scans all text channels in guild for webhooks matching `TomoriBot Persona {id}`
- Downloads avatar from first surviving webhook found
- Updates database with recovered URL
- Returns recovered avatar for immediate use

**Fallback:** If no surviving webhooks found, webhook created without avatar (uses bot's default)

**Code location:** `src/utils/discord/webhookManager.ts` (`attemptWebhookAvatarRecovery`)

#### **Edge Cases (Local)**

**✅ Solved:**
1. **No webhook within 24h** → Proactive creation upgrades URL immediately
2. **Last webhook deleted** → Auto-recovery scans for survivors and restores

**⚠️ Rare (Terminal):**
- **All webhooks deleted** → No recovery source, manual re-import required
- **User manually deletes all webhooks** → Very rare, requires deliberate action

**Mitigation:** Keep at least one webhook per persona in any channel to enable auto-recovery.

### Supported channels

Webhooks are supported in:
- `GuildText`
- `PublicThread`
- `PrivateThread`
- `AnnouncementThread`

DMs do not support webhooks.

### Failure behavior

If webhook creation or sending fails:
- A localized warning embed is shown (rate-limited).
- The bot falls back to normal messages.

## Tool Calls, Embeds, and Stickers

### Tool-call embeds

Tools can send embeds via `sendStandardEmbed`. The tool execution context includes persona webhook info:

- If a webhook is available, embeds are sent through that webhook with persona name/avatar.
- Otherwise, embeds are sent as normal bot messages.

### Persona IDs in context

When alter persona webhook messages are part of recent chat context, TomoriBot
surfaces those participants in "users in conversation" using the persona's
database `tomori_id` (short numeric). This avoids production/local webhook ID
differences and gives tools a stable ID for avatar targeting.

Non-persona webhook participants (if any) are still surfaced by webhook ID.
Both are rendered as regular conversation users in context (no explicit webhook/persona
identity label).
Responding alter personas are injected into that list each turn, so they can
always self-target avatar tools with their own `tomori_id` even when no previous
webhook message is present in the fetched history window.
When alter personas are active, TomoriBot suppresses the extra bot-account user
entry to avoid duplicate/confusing IDs in that list.

### Stickers (alter personas)

Discord webhooks cannot send actual stickers. For alters:
- After streaming, TomoriBot sends the **sticker CDN URL** via webhook.
- If webhook send fails, it falls back to sending the actual sticker as the bot.

Main persona uses normal sticker sends.

## Reminders (Persona-Specific)

Reminder tool now stores the creating persona:

- `set_reminder_or_task` saves `persona_id` in the `reminders` table.
- Reminder timer passes `selectedPersonaId` into `tomoriChat`.

Behavior:
- If the persona still exists, that persona responds.
- If the persona is missing, **fallback to main**.
- Mention verification includes webhook messages, and sends a fallback ping if the response did not mention the target.

## Commands and Workflows

### `/persona import`

- `type: main` replaces main persona.
- `type: alter` creates a new alter persona:
  - Unique triggers enforced (no overlaps).
  - Avatar URL stored in `webhook_avatar_url`.

### `/persona remove`

- Removes a selected alter persona.
- Deletes persona-specific webhooks in non-production.

### `/persona swap`

- Promotes an alter to main.
- Transfers triggers between `alter_triggers` and `tomori_configs.trigger_words`.
- Updates guild avatar and nickname.
- Stores the previous main avatar in `webhook_avatar_url`.

## Caching and Invalidation

### Persona cache

`getCachedAllPersonas()` loads and caches all personas for a server.

Invalidate cache after:
- Importing/removing/swapping personas.
- Updating triggers or avatars.

### Webhook cache

Two in-memory caches:
- `webhookCache` (channel webhook, production)
- `personaWebhookCache` (per-persona webhook, non-production)

**Cache behavior:**
- No TTL (persist until bot restart or manual invalidation)
- Token validation on cache hit (recreates if webhook was deleted)
- Auto-invalidation on webhook errors (codes 10015, 50027)

**Integration with auto-recovery:**
- When cache invalidation detects deleted webhook, next creation attempt triggers auto-recovery
- Recovered webhook URL automatically updates cache after successful recovery

## Limitations and Edge Cases

### General

- **Context refresh**: later personas do not see earlier persona replies (deferred).
- **Webhook username collision**: reply routing relies on unique persona nicknames.
- **DMs**: no webhook support; alters are not available in DMs.
- **Sticker rendering**: alter personas send sticker **URL previews** instead of actual stickers.

### Self-Reply Chains

- **Shared limit**: All personas share one depth counter per channel (not per-persona).
- **Chain blocks all**: When limit reached, ALL persona triggers are blocked (user can reset by sending a message).
- **Cascading triggers**: If A triggers B, C, D in one message, that's 1 depth increment (not 3).

### Webhooks (Local Development)

- **Avatar expiration (mitigated)**: Proactive webhook creation prevents 24h URL expiration.
- **Webhook deletion (mitigated)**: Auto-recovery scans guild for surviving webhooks.
- **Terminal case**: If ALL webhooks deleted, avatar unrecoverable (requires manual re-import).
- **Webhook limit**: Discord allows max 15 webhooks per channel (local mode can hit this with many personas).

## Troubleshooting

### Alter doesn't respond

1. **Check trigger words:**
   - Confirm trigger words are unique and present in `alter_triggers`
   - Check if message contained the trigger or was a reply to alter webhook

2. **Check self-reply limit:**
   - Look for log: `Self-reply chain limit reached (X)`
   - Have a user send a message to reset the chain
   - Increase limit with `/config selfreply` if needed

3. **Check webhook permissions:**
   - Verify bot has `MANAGE_WEBHOOKS` permission in channel
   - Check if channel supports webhooks (not DM)

### Alter has wrong avatar or name

1. **Webhooks failing:**
   - Check permissions (`MANAGE_WEBHOOKS`)
   - Look for warning embed in channel (rate-limited)
   - Check logs for webhook errors

2. **Local development avatar issues:**
   - If imported recently, check if proactive webhook was created:
     - Log: `Proactively created webhook in import channel for persona X`
   - If avatar missing after webhook deletion:
     - Auto-recovery should trigger on next use
     - Log: `Attempting avatar recovery for persona X`
   - If all webhooks deleted, re-import persona

3. **DM limitations:**
   - Webhooks not supported in DMs
   - Alters will use main persona appearance

### Self-reply chain issues

**Personas stop responding after several triggers:**
- Chain limit reached (default: 3)
- User message resets chain
- Check current limit: `/config selfreply`
- Increase limit (max 10) or disable (0)

**Personas triggering infinite loops:**
- Limit is too high or disabled (0)
- Reduce limit with `/config selfreply`
- Check persona personalities (may be too eager to mention each other)

## Test Checklist (Recommended)

### Basic Functionality

1. **Reply routing:** Reply to an alter's webhook message → same alter responds.
2. **Multi-trigger:** Trigger multiple alter keywords → all matching personas respond.
3. **Tool embeds:** Tool call as alter → embeds use alter webhook name/avatar.
4. **Stickers:** Sticker tool as alter → CDN URL sent via webhook.
5. **Reminders:** Reminder created by alter → alter delivers reminder; fallback to main if persona removed.

### Self-Reply Chains

6. **User bypass:** User triggers 4+ personas → all respond (bypasses limit).
7. **Chain depth:** Persona A → B → C → limit reached → D blocked.
8. **Multi-mention depth:** Persona A mentions B, C, D in one message → all respond, depth +1 only.
9. **Chain reset:** After chain limit reached, user message → chain resets, personas respond again.
10. **Limit configuration:** `/config selfreply limit:5` → new limit applies immediately.

### Webhook Robustness (Local Development)

11. **Proactive creation:** Import alter → check logs for "Proactively created webhook" → verify `webhook_avatar_url` is webhook CDN URL (not attachment).
12. **Auto-recovery:** Delete webhook in Channel A → use alter in Channel B → auto-recovery finds webhook in Channel C (if exists) → avatar restored.
13. **Graceful degradation:** Delete all webhooks → use alter → webhook created without avatar (bot's default) → still functional.
14. **URL upgrade:** Import alter → wait 25 hours → use alter in new channel → webhook still has avatar (permanent URL).
