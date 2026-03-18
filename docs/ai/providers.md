# 8. AI Provider System

TomoriBot uses a provider abstraction so chat logic stays provider-agnostic.

For the step-by-step contributor workflow, see
`docs/guides/adding-new-provider.md`.

## Provider Interface

Interface source: `src/types/provider/interfaces.ts`

All providers implement `LLMProvider`, including:

- `getInfo()`
- `validateApiKey()`
- `formatErrorDescription()`
- `getTools()`
- `createConfig()`
- `streamToDiscord()`
- `getDefaultModel()`

## Current Providers

Provider folders under `src/providers/`:

- `google` (`GoogleProvider`)
- `openrouter` (`OpenrouterProvider`)
- `novelai` (`NovelaiProvider`)
- `custom` (`CustomProvider`)

## Provider Factory

Factory: `src/utils/provider/providerFactory.ts`

Important behavior:

- Providers are auto-discovered by scanning `src/providers/*`.
- Loading is lazy (constructor class loaded on first use).
- Aliases are supported from provider metadata.
  - examples: `gemini` -> `google`, `or` -> `openrouter`, `nai` -> `novelai`
- `ProviderFactory.getProviderByName()` can resolve a provider directly when a full `TomoriState` is not available.

## Provider Metadata

Static provider metadata is defined in each provider folder:

- `src/providers/google/providerInfo.ts`
- `src/providers/openrouter/providerInfo.ts`
- `src/providers/novelai/providerInfo.ts`
- `src/providers/custom/providerInfo.ts`

Registry helpers live in `src/utils/provider/providerInfoRegistry.ts`.

Use these helpers instead of hardcoding provider names in commands/tools:

- `normalizeProviderName()`
- `getStaticProviderInfo()`
- `providerSupportsFeature()`
- `resolveProviderFeatureImplementation()` (legacy runtime routing for untouched paths)

Runtime capability resolution lives in:

- `src/types/provider/featureInterfaces.ts`
- `src/utils/provider/providerCapabilityResolver.ts`

`ProviderInfo.featureSupport` is the source of truth for app-level feature gating such as:

- native image generation
- embeddings
- structured output
- preset generation
- expression initialization
- live token counting
- conversation compaction
- history extraction

Rule:

- If a command only needs to know whether a provider supports a feature, use `providerSupportsFeature()`.
- If a command needs to execute a provider-owned runtime feature, resolve the optional capability from the provider instance instead of checking `provider === "google"` inline.

## Model Source of Truth

- Text models are stored in table `llms`.
- Provider code intentionally uses DB/cache-backed defaults, not hardcoded static model lists.
- Use `src/db/seed.sql` for maintained model inventory.

## Capability Resolution

### OpenRouter

- Startup cache fetch from `https://openrouter.ai/api/v1/models`
- cache module: `src/utils/cache/openrouterCapabilityCache.ts`
- OpenRouter provider can override stale DB capability flags with API capabilities at runtime.

### Gemini and NovelAI token limits

- static lookup maps:
  - `src/utils/cache/geminiCapabilityCache.ts`
  - `src/utils/cache/novelaiCapabilityCache.ts`
- used for context/token budgeting behavior.

## Custom Provider Notes

`custom` provider is for self-hosted OpenAI-compatible endpoints (Ollama, KoboldCPP, vLLM, LocalAI, etc.).

- endpoint URL stored in `tomori_configs.custom_endpoint_url`
- optional model override in `tomori_configs.custom_model_name`
- model capabilities are user-declared and stored in `llms`
- designed for non-production usage

## Tool Integration Across Providers

Tools are provider-agnostic at registry level, then adapted per provider by each provider tool adapter.

- Google: `googleToolAdapter.ts`
- OpenRouter: `openrouterToolAdapter.ts`
- NovelAI: `novelaiToolAdapter.ts`
- Custom: `customToolAdapter.ts`

All providers rely on centralized tool filtering via `getAvailableToolsWithMCP()`.

## Provider Runtime Capabilities

Optional provider-owned runtime capabilities now live on provider classes instead of a central implementation switch table.

Current capability layer:

- capability interfaces: `src/types/provider/featureInterfaces.ts`
- typed resolver: `src/utils/provider/providerCapabilityResolver.ts`
- thin app-level wrappers: `src/providers/utils/providerFeatureExecutors.ts`

Google and OpenRouter currently own runtime execution for:

- embeddings
- structured output execution
- preset generation
- conversation compaction
- roleplay compaction
- history extraction (via structured output capability)

Rule:

- Keep `providerSupportsFeature()` as the common early-gating helper.
- Put runtime execution on the provider instance when the feature is app-level and provider-specific.
- Keep provider-specific implementation code inside `src/providers/{providerName}/` or shared family internals.
- `resolveProviderFeatureImplementation()` is now temporary legacy routing for the runtime paths that have not been migrated yet.

## Writing Provider-Aware Commands

When adding a new command or tool flow that depends on provider support:

1. Decide whether the command only needs static gating, or also needs runtime execution.
2. Add or reuse a `ProviderInfo.featureSupport` flag for the app-level feature.
3. In the command, fail early with `providerSupportsFeature(providerName, featureName)`.
4. If runtime execution is needed, resolve the provider-owned capability instead of switching on provider names.

Use this pattern:

- static gating only:
  - examples: hide/deny a feature before execution, validate setup, choose UI availability
  - use `providerSupportsFeature()`
- migrated runtime execution:
  - examples: embeddings, structured output, preset generation, compaction, history extraction
  - use `src/utils/provider/providerCapabilityResolver.ts` directly or a thin wrapper such as `src/providers/utils/providerFeatureExecutors.ts`
- legacy runtime execution:
  - examples: native image generation, live token counting
  - these still use `resolveProviderFeatureImplementation()` temporarily until migrated

Rules for command authors:

- Do not add new `provider === "google"` or `provider === "openrouter"` checks in commands for app-level features.
- Keep provider identity separate even when internals are shared across a family.
- If a provider does not implement the runtime capability, return a clean unsupported error near the command boundary.
- If a new feature will be reused by multiple commands, prefer adding a new optional capability interface over creating another central switch table.

Current command examples:

- `src/commands/server/initialize/expressions.ts`
- `src/commands/persona/generate.ts`
- `src/commands/tool/compact.ts`
- `src/commands/teach/history.ts`

## Intentional Exceptions

Some literal provider names are still correct and should remain explicit:

- flows that require a truly provider-specific optional credential
- direct vendor-specific capabilities that are not abstracted yet
- remaining legacy runtime paths such as native image generation and live token counting until they are moved onto provider capabilities

Example:

- NovelAI inpainting can optionally use a Google key for Gemini segmentation. That is intentionally a Google-specific integration, not a generic "Gemini-family" provider capability.

## Context Item Tag Routing (Important)

`ContextItemTag` in `src/types/misc/context.ts` controls whether a context block is injected as:

- provider system instruction
- conversation history

Use this mental model when adding new context blocks:

- system instruction tags (`SYSTEM_*`, `KNOWLEDGE_*`) are prompt-level guidance
- dialogue tags (`DIALOGUE_*`) are chat history items

Critical rule:

- If an instruction must appear in conversation history, inject with `DIALOGUE_HISTORY`
  and the correct role (`"user"`/`"model"`), not with `SYSTEM_*`/`KNOWLEDGE_*`.
- Generated media annotations such as `[System: This message contains an image...]`
  or media tool-use hints should be detached into their own synthetic `"user"`
  `DIALOGUE_HISTORY` item so assistant turns only carry speaker-authored content.

Why this matters:

- providers treat system instruction and history differently for behavior/token usage
- incorrect tagging can silently change response quality and tool behavior

## API Key Setup Commands

- `/config apikey set provider:google key:...`
- `/config apikey set provider:openrouter key:...`
- `/config apikey set provider:novelai key:...`

Provider choice/model selection commands:

- `/config model text`
- `/config model image`
- `/config model embedding`
