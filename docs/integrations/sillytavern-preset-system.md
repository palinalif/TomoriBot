# SillyTavern Preset System

> Import and use SillyTavern (ST) presets to control how TomoriBot assembles LLM prompts.

## Overview

SillyTavern presets are JSON files that define:

1. **Prompt node ordering** — where character info, instructions, chat history, etc. appear in the final prompt
2. **Custom prompt injection** — additional instructions, output format rules, task descriptions inserted at specific positions
3. **Depth-based insertion** — placing prompts relative to the end of chat history
4. **Template macros** — variables like `{{setvar::X::Y}}` / `{{getvar::X}}` for dynamic content
5. **Per-node enable/disable** — users toggle individual prompt nodes on or off

This is distinct from [SillyTavern Card Import](./sillytavern-card-support.md), which imports character data (description, personality, sample dialogues). Presets control *how the prompt is structured*, not *what character data exists*.

## Current Status

**Phase 1: Import & Visualization** (implemented)

- Upload ST preset JSON via `/stpreset upload`
- Toggle individual nodes via `/stpreset node toggle`
- Presets and nodes stored in database
- No context builder override yet — presets are stored but not applied to LLM calls

## Commands

### `/stpreset upload`

Uploads a SillyTavern preset JSON file and stores it for the current server.

**Flow:**
1. User attaches a `.json` file to the slash command
2. Bot validates the file (format, size ≤ 2 MB, presence of `prompts` array)
3. Parses the `prompt_order` (character_id 100001) to determine node sequence and default enabled states
4. Filters out comment-only nodes (content resolves to empty after macro stripping)
5. Stores preset metadata + raw JSON in `st_presets`, individual nodes in `st_preset_nodes`
6. Replies with an import summary (total nodes, markers, toggleable count)

**Preset name:** Derived from the uploaded filename (minus `.json` extension), truncated to 100 chars. Must be unique per server.

### `/stpreset node toggle`

Shows a modal with checkbox groups representing the preset's toggleable prompt nodes.

**Flow:**
1. Loads the active preset for the server (or falls back to the first available)
2. Queries `st_preset_nodes` for non-marker nodes ordered by `node_order`
3. Chunks nodes into up to 5 checkbox groups (10 options each, 50 max per modal)
4. Modal title = preset name (dynamic, truncated at 45 chars by Discord)
5. On submit, persists changed enabled states back to the database

**Limitation:** Maximum 50 toggleable nodes per modal page. Presets with more nodes would need pagination (not yet implemented).

## Database Schema

### `st_presets` table

| Column      | Type      | Description                                           |
|-------------|-----------|-------------------------------------------------------|
| preset_id   | SERIAL PK | Auto-incrementing primary key                         |
| server_id   | INT FK    | References `servers(server_id)`, CASCADE on delete     |
| preset_name | TEXT      | Display name (unique per server)                      |
| raw_json    | JSONB     | Complete original ST preset JSON for re-parsing        |
| is_active   | BOOLEAN   | Whether this is the active preset (one per server)     |
| created_at  | TIMESTAMP | Import timestamp                                      |
| updated_at  | TIMESTAMP | Last modification timestamp                            |

**Unique constraint:** `(server_id, preset_name)`

### `st_preset_nodes` table

| Column             | Type      | Description                                           |
|--------------------|-----------|-------------------------------------------------------|
| node_id            | SERIAL PK | Auto-incrementing primary key                         |
| preset_id          | INT FK    | References `st_presets(preset_id)`, CASCADE on delete  |
| identifier         | TEXT      | ST node identifier (UUID or well-known name)          |
| name               | TEXT      | Display name from the preset                          |
| role               | TEXT      | Message role: `system`, `user`, or `assistant`        |
| content            | TEXT      | Raw prompt text (with unresolved ST macros)            |
| is_marker          | BOOLEAN   | Structural anchor (charDescription, chatHistory, etc.) |
| is_enabled         | BOOLEAN   | User-togglable enabled state                          |
| node_order         | INT       | Position in the preset's prompt_order sequence         |
| injection_position | INT       | 0 = relative to system prompt, 1 = relative to chat end |
| injection_depth    | INT       | Messages from end for depth-based insertion            |
| injection_order    | INT       | Priority for tie-breaking at same position+depth       |

**Unique constraint:** `(preset_id, identifier)`

## ST Preset Anatomy

### Node Types

When parsing a preset's `prompts` array, nodes fall into three categories:

| Category       | Detection                                     | Stored? | Toggleable? |
|----------------|-----------------------------------------------|---------|-------------|
| Comment-only   | Content is purely `{{// ... }}{{trim}}`        | No      | No          |
| Marker         | `marker: true` (structural anchor)             | Yes     | No          |
| Content node   | Has real content after macro stripping          | Yes     | Yes         |

### Comment-Only Detection

A node is comment-only if its content matches: `^(\s*\{\{\/\/[^}]*\}\}\s*|\s*\{\{trim\}\}\s*)+$`

Examples of comment-only content:
- `{{// Empty for card override. }}{{trim}}`
- `{{// Choose the narration style. }}{{trim}}`
- `{{// Enable only one out of the list below. }}{{trim}}`

### Well-Known Markers

These markers define where ST inserts character/system data:

| Identifier          | ST Purpose                    | TomoriBot Equivalent           |
|---------------------|-------------------------------|--------------------------------|
| `main`              | Main system prompt            | System humanizer rules          |
| `charDescription`   | Character description         | Persona description             |
| `charPersonality`   | Character personality         | Personality attributes          |
| `scenario`          | Scenario text                 | *(no direct equivalent)*        |
| `personaDescription`| User persona                  | *(no direct equivalent)*        |
| `dialogueExamples`  | Example dialogues             | Sample dialogues                |
| `chatHistory`       | Conversation log              | Conversation history            |
| `worldInfoBefore`   | World info (before char data) | RAG documents                   |
| `worldInfoAfter`    | World info (after char data)  | RAG documents                   |

### Prompt Order

ST presets have a `prompt_order` array with entries for two scopes:

- **`character_id: 100000`** — System prompt order (well-known markers only)
- **`character_id: 100001`** — User prompt order (custom nodes + markers, this is the one we parse)

Each entry has `{ identifier, enabled }`. The array order defines the rendering sequence.

## File Map

| File | Purpose |
|------|---------|
| `src/db/schema_stpreset.sql` | Database table definitions |
| `src/types/db/schema.ts` | `StPresetRow` and `StPresetNodeRow` type definitions |
| `src/utils/db/stPresetDb.ts` | CRUD operations (insert, load, update, delete, activate) |
| `src/commands/stpreset/upload.ts` | `/stpreset upload` — file upload + parsing |
| `src/commands/stpreset/node/toggle.ts` | `/stpreset node toggle` — checkbox toggle UI |
| `STPRESET_PLAN.md` | Full architectural plan (context builder override, template engine, etc.) |

## Future Work

See `STPRESET_PLAN.md` at the repo root for the full implementation roadmap:

- **Phase 2:** Minimal template engine (`{{trim}}`, `{{setvar}}`, `{{getvar}}`, `{{// comments}}`)
- **Phase 3:** Context builder override (`buildContextWithPreset()`) with marker-to-block mapping and depth insertion
- **Phase 4:** Provider compatibility verification
- **Phase 5:** Preset switching, settings import, sharing
