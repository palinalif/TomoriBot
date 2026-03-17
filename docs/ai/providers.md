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
- `resolveProviderFeatureImplementation()`

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
- If a command needs to call a provider-specific implementation, route through a shared executor instead of checking `provider === "google"` inline.

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

## Shared Feature Executors

Provider-specific feature dispatch that still needs multiple backends is centralized in:

- `src/providers/utils/providerFeatureExecutors.ts`

Current shared executors cover:

- preset generation
- conversation compaction
- roleplay compaction
- expression initialization
- history extraction

Rule:

- Keep provider-name branching inside provider utilities/registries, not scattered across commands.
- Adding a new provider should usually mean:
  1. add/update that provider's `providerInfo.ts`
  2. implement the provider-specific feature code
  3. register the feature implementation in `providerInfoRegistry.ts` or a provider utility
  4. avoid touching unrelated commands unless user-facing behavior changes

## Intentional Exceptions

Some literal provider names are still correct and should remain explicit:

- flows that require a truly provider-specific optional credential
- direct vendor-specific capabilities that are not abstracted yet

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
