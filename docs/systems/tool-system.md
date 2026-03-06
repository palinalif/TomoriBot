# 9. Tool System

TomoriBot exposes built-in tools, MCP tools, and REST-backed tools through one central registry.

## Core Components

- Registry: `src/tools/toolRegistry.ts`
- Startup loader: `src/tools/toolInitializer.ts`
- Tool contracts: `src/types/tool/interfaces.ts`
- Feature flag mapper: `src/utils/tools/featureFlagMapper.ts`

## Registration Model (Current)

Built-in tools are class-based:

- each tool extends `BaseTool`
- `toolInitializer.ts` auto-discovers classes in `src/tools/functionCalls/`
- no manual `registerTool(...)` calls in tool files

## Built-In Function Tools (Current)

From `src/tools/functionCalls/`:

- `remember_this_fact` (`memoryTool.ts`)
- `update_long_term_memory` (`updateLongTermMemoryTool.ts`)
- `update_short_term_memory` (`updateShortTermMemoryTool.ts`)
- `create_task` (`reminderTool.ts`)
- `select_sticker_for_response` (`stickerTool.ts`)
- `process_youtube_video` (`youtubeVideoTool.ts`)
- `pin_selected_message` (`pinMessageTool.ts`)
- `peek_profile_picture` (`peekProfilePictureTool.ts`)
- `increase_media_context` (`increaseMediaContextTool.ts`)
- `process_gif` (`processGifTool.ts`)
- `generate_image` (`generateImageTool.ts`)
- `generate_image_nai` (`generateImageNaiTool.ts`)
- `review_capabilities` (`reviewCapabilities.ts`)

## REST API Tools

- Brave REST tool classes in `src/tools/restAPIs/brave/braveTools.ts`:
  - `brave_web_search`
  - `brave_image_search`
  - `brave_video_search`
  - `brave_news_search`

## MCP Integration

- MCP manager: `src/utils/mcp/mcpManager.ts`
- MCP registration handler: `src/events/clientReady/02_registerMCPs.ts`
- MCP server definitions/configs: `src/tools/mcpServers/*`

Current MCP behavior notes:

- Google and OpenRouter MCP-capable adapters are registered at startup.
- NovelAI MCP adapter is intentionally disabled due prompt budget constraints.

## Current MCP Servers

From `src/tools/mcpServers/`:

- `brave-search`
- `fetch`
- `duckduckgo-search` (kept available, but search routing may prefer Brave when Brave API is configured)

## Tool Filtering and Availability

`ToolRegistry` filters tools by:

- provider availability (`isAvailableFor` / context-aware checks)
- feature flags (mapped by `featureFlagMapper.ts`)
- permission requirements (`requiresPermissions`)

Centralized helper:

- `getAvailableToolsWithMCP(provider, stateForContext)`
  - returns filtered built-in tools + filtered MCP function names

Additional routing logic:

- when Brave API is available, DuckDuckGo MCP search functions are excluded to prefer Brave.

## Tool Categories

`ToolCategory` values in current type contracts:

- `discord`
- `search`
- `memory`
- `utility`
- `mcp`

## Creating a New Built-In Tool

1. Add a file under `src/tools/functionCalls/`.
2. Export a class that extends `BaseTool`.
3. Define:
   - `name`, `description`, `category`
   - JSON-schema-like `parameters`
   - `execute(args, context)`
4. Optionally set:
   - `requiresFeatureFlag`
   - `requiresPermissions`
   - `requiresFollowUp`
5. Restart bot; startup auto-discovery registers the tool.

## Observability

Registry tracks execution history and stats:

- `getExecutionHistory(limit)`
- `getStats()`
