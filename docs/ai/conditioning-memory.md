# Conditioning Memory

> Persona-scoped reward and punishment memory that influences how TomoriBot behaves in one server.

## What It Is

Conditioning memory is a small auxiliary memory system layered on top of normal long-term memory.

- `server_memories` and `personal_memories` store facts and knowledge.
- `conditioning_history` stores behavioral reinforcement.
- Scope is per server and per `persona_lineage_id`.

This means a persona can accumulate different reward/punish patterns in different servers, and those patterns survive persona delete/re-import flows as long as the lineage stays the same.

## User Commands

### `/conditioning reward`

Reward actions remain direct interaction commands:

- `/conditioning reward headpat`
- `/conditioning reward hug`
- `/conditioning reward kiss`
- `/conditioning reward tickle`

Each subcommand now accepts an optional `reason` string.

### `/conditioning punish`

Punishment uses the parallel interaction surface:

- `/conditioning punish spank`
- `/conditioning punish pinch`
- `/conditioning punish bite`
- `/conditioning punish squeeze`

Each subcommand also accepts an optional `reason` string.

### `/conditioning`

Management is centralized under `/conditioning`:

- `/conditioning manage`

`/conditioning manage` requires `ManageGuild`.

`/conditioning manage` is now server-wide:

- it does not require picking a persona first
- it shows only injected reward and punishment entries from every persona in the server
- each checklist entry includes the persona name plus a ❤️ reward or 💀 punishment marker
- lists beyond one modal use a page-selection step and page-scoped checkbox modals

Entries that are stored but not currently injectable stay in the database but are hidden from `/conditioning manage`.

## Storage Rules

Conditioning rows are stored in `conditioning_history`.

Each row includes:

- `server_id`
- `persona_lineage_id`
- `conditioning_type` = `reward` or `punish`
- `action_key`
- `reason_text`
- `reason_normalized`
- `user_id`
- `count`

Duplicate handling:

- Same server + persona lineage + type + action + normalized reason + user = one row
- Repeating that exact combination increments `count`
- Same action/reason from different users creates separate rows
- Read paths group those rows back together by type + action + normalized reason

## Reason Handling

The optional `reason` controls whether conditioning becomes prompt-visible.

- Reason present: store it, show the embed footer, and allow prompt injection
- Reason omitted: store an empty string, but do not inject that entry into prompt context

This allows audit/history tracking without every interaction affecting behavior.

## Prompt Injection Behavior

Native context assembly injects conditioning near the end of the stable prompt blocks, just before sample dialogues and real chat history.

Two sections can be produced:

- rewarded behaviors: things the persona should repeat
- punished behaviors: things the persona should avoid

Injection rules:

- only the active persona lineage is considered
- only the current server is considered
- only rows with non-empty reasons are injected
- reward and punish each respect their own persona config toggle
- user IDs are merged into a grouped line when the reason matches
- very large histories are capped by env-configured per-type limits

User impersonation bypasses conditioning injection entirely because the model is no longer acting as the persona.

## Preset Behavior

When a SillyTavern preset is active, conditioning is treated as a Tomori-only dialogue-adjacent block.

- it is still built natively
- it is tagged with `KNOWLEDGE_SERVER_CONDITIONING`
- preset reassembly flushes it before dialogue history

This preserves the same behavioral guidance even when ST node order rearranges the rest of the prompt.

## Toggles

Persona config stores two independent injection flags:

- `reward_conditioning_enabled`
- `punish_conditioning_enabled`

These toggles only affect prompt injection.
They do not stop new conditioning rows from being recorded.

The reward/punish enable flags are still stored per persona in `persona_configs`, but management of stored conditioning history is centralized under `/conditioning manage`.

## Environment Variables

- `CONDITIONING_REASON_MAX_LENGTH`
- `CONDITIONING_CONTEXT_MAX_GROUPS_PER_TYPE`

These are documented in `.env.optional.example`.

## Related Files

- `src/utils/db/conditioningDb.ts`
- `src/utils/conditioning/conditioning.ts`
- `src/utils/text/contextBuilder.ts`
- `src/utils/text/presetContextBuilder.ts`
- `src/commands/conditioning/reward/*`
- `src/commands/conditioning/punish/*`
- `src/commands/conditioning/*`
