# Add a New AI Provider

This is the current implementation guide for adding a provider to TomoriBot.

Read [providers.md](../ai/providers.md) first if you need the architecture overview.
Use this guide when you are actually wiring a new provider into the codebase.

## Mental Model

TomoriBot has a real provider abstraction for core chat behavior, but provider integration is not "drop a folder and you're done".

Today, adding a provider usually means all of the following:

1. Add the provider implementation under `src/providers/{providerName}/`.
2. Add static provider metadata in `providerInfo.ts`.
3. Register that metadata in `src/utils/provider/providerInfoRegistry.ts`.
4. Seed provider model inventory in the database.
5. If the provider supports app-level runtime features beyond core chat, implement the relevant optional capability interfaces on the provider class.

Important rules:

- `ProviderFactory` auto-discovers provider classes, not all provider metadata and feature executors.
- Text model defaults come from the database/cache, not from hardcoded model arrays in provider code.
- If a command only needs to know whether a provider supports a feature, use `providerSupportsFeature()`.
- If a command needs provider-specific runtime execution, resolve a provider-owned capability instead of hardcoding `provider === "google"` style checks.

## 1. Decide Scope First

Before you write code, decide whether the new provider is:

- chat-only
- chat + tool calling
- full parity with other providers for images, embeddings, structured output, compaction, preset generation, or history extraction

Do not mark features as supported unless they work end-to-end in the app.

The source of truth for those app-level capabilities is `ProviderInfo.featureSupport` in `src/types/provider/interfaces.ts`.

## 2. Create the Provider Folder

Create:

- `src/providers/{providerName}/providerInfo.ts`
- `src/providers/{providerName}/{providerName}Provider.ts`
- `src/providers/{providerName}/{providerName}StreamAdapter.ts`
- `src/providers/{providerName}/{providerName}ToolAdapter.ts`

You can add extra helper files in the same folder as needed.

Use existing providers as references:

- `src/providers/google/`
- `src/providers/openrouter/`
- `src/providers/novelai/`
- `src/providers/custom/`

If the vendor exposes an OpenAI-style chat/completions API, read this before cloning provider code:

- `docs/guides/openai-compatible-provider-family.md`

## 3. Define Static Provider Metadata

Create `providerInfo.ts` and export a `ProviderInfo` object.

Example:

```ts
import type { ProviderInfo } from "@/types/provider/interfaces";

export const exampleProviderInfo: ProviderInfo = {
	name: "example",
	displayName: "Example AI",
	aliases: ["ex"],
	supportedModels: [],
	requiresApiKey: true,
	supportsStreaming: true,
	supportsFunctionCalling: true,
	supportsImages: true,
	supportsVideos: false,
	apiFamily: "openai-compatible",
	featureSupport: {
		nativeImageGeneration: false,
		embeddings: false,
		structuredOutput: false,
		presetGeneration: false,
		expressionInitialization: false,
		liveTokenCounting: false,
		conversationCompaction: false,
		historyExtraction: false,
	},
};
```

Notes:

- `supportedModels` is usually `[]` because the database is the source of truth for model inventory.
- `apiFamily` should describe the underlying API surface, not the marketing name.
- `featureSupport` should reflect app-level support, not just raw vendor API capability.

## 4. Implement the Provider Class

Implement `{ProviderName}Provider` by extending `BaseLLMProvider`.

Required methods live in `src/types/provider/interfaces.ts`:

- `getInfo()`
- `validateApiKey()`
- `formatErrorDescription()`
- `getTools()`
- `createConfig()`
- `streamToDiscord()`
- `getDefaultModel()`

Recommended pattern:

- import and return the object from `providerInfo.ts` inside `getInfo()`
- keep provider-specific API key validation and user-facing error formatting inside the provider
- keep config conversion inside `createConfig()`
- keep streaming behavior inside the provider stream adapter

`formatErrorDescription()` is important. Provider-specific error formatting should stay inside the provider abstraction instead of being reimplemented in commands.

## 5. Implement Stream and Tool Adapters

Your stream adapter should normalize provider responses into TomoriBot's streaming pipeline.

Your tool adapter should convert TomoriBot tool schemas and tool results into the provider's function-calling format.

Use the existing adapters as the implementation pattern:

- `src/providers/google/googleStreamAdapter.ts`
- `src/providers/google/googleToolAdapter.ts`
- `src/providers/openrouter/openrouterStreamAdapter.ts`
- `src/providers/openrouter/openrouterToolAdapter.ts`

Important:

- provider tool conversion is not fully generic across vendors
- if you add nested tool-schema support or other serializer behavior, update all provider tool adapters consistently

## 6. Register the Provider Metadata

`ProviderFactory` will auto-discover `{providerName}Provider.ts`, but that is not enough by itself.

You must also update `src/utils/provider/providerInfoRegistry.ts`:

1. import your `providerInfo.ts`
2. add it to the `providerInfos` array
This registry is what powers:

- alias normalization
- capability checks via `providerSupportsFeature()`
- legacy runtime execution routing via `resolveProviderFeatureImplementation()`

If you skip this step, the provider may stream chat successfully but still behave as unsupported in feature-gated commands.

## 7. Implement Optional Runtime Capabilities When Needed

Some app features execute outside the main chat streaming path.

Current capability entry points:

- `src/types/provider/featureInterfaces.ts`
- `src/utils/provider/providerCapabilityResolver.ts`
- `src/providers/utils/providerFeatureExecutors.ts`

Current provider-owned examples include:

- embeddings
- structured output execution
- preset generation
- conversation compaction
- roleplay compaction
- expression initialization
- history extraction

Use this rule:

- If `featureSupport.{feature}` is `false`, no extra wiring is needed.
- If `featureSupport.{feature}` is `true` and the app executes that feature at runtime, implement the matching optional capability on the provider class.
- If a helper is truly generic, keep it in a shared utility. If it contains provider-specific HTTP calls, prompt shaping, or response parsing, keep it in `src/providers/{providerName}/`.

Do not scatter exact provider-name checks across commands. Put routing in the provider capability layer.

## 8. Seed Model Inventory

Add the provider's models to `src/db/seed.sql` or the relevant migration path.

Tables currently used by the app:

- `llms` for text/chat models
- `image_diffusion_models` for native image generation models
- `embedding_models` for embedding providers/models

Use the tables that match the features you actually support.

Examples:

- a chat-only provider needs `llms`
- a provider with native image generation also needs `image_diffusion_models`
- a provider with embeddings also needs `embedding_models`

Do not hardcode default models in provider code when the app already resolves them from the database/cache.

## 8.5 Update User-Facing Help

When adding a provider, update the user-facing setup/help copy in the same change.

Minimum reminders:

- update `/help apikey` provider choices in `src/commands/help/apikey.ts`
- add localized `/help apikey` copy in both `src/locales/en-US.ts` and `src/locales/ja.ts`
- if the provider changes onboarding guidance, also review `/help setup`
- if the provider changes pricing guidance or model-tag expectations, review `/help cost` and any related help text

## 9. Keep New Logic Inside the Provider Layer

When integrating provider-specific behavior:

- prefer `providerInfo.ts`
- prefer provider class capability methods
- prefer `providerCapabilityResolver.ts` and thin shared wrappers such as `providerFeatureExecutors.ts`
- keep provider helpers inside `src/providers/{providerName}/`
- use shared provider utilities only for code that is genuinely cross-provider

Current structured-output examples:

- `src/providers/google/googleStructuredOutput.ts`
- `src/providers/openrouter/openrouterStructuredOutput.ts`
- `src/providers/deepseek/deepseekStructuredOutput.ts`

Avoid adding new command-level checks like:

```ts
if (providerName === "example") {
	// ...
}
```

Prefer:

- `providerSupportsFeature(providerName, "structuredOutput")`
- `resolveProviderCapability(providerName, "presetGeneration")`
- provider-local code paths behind shared executor helpers

Literal provider names are still correct when the behavior is truly vendor-specific, such as an optional credential that only exists for one vendor integration.

## 10. Verify Vendor Capability Contracts

Before you mark a feature as supported, verify the vendor's exact request/response contract instead of relying on the provider being "OpenAI-compatible".

Checklist:

- tool calling:
  - confirm which seeded models actually support tools
  - confirm the assistant/tool loop shape matches TomoriBot's runtime
- reasoning or thinking mode:
  - check for continuation-only fields that must be replayed within the same turn
  - DeepSeek example: preserve `reasoning_content` across tool sub-turns, but do not treat it as normal cross-turn chat history
- structured output:
  - determine whether the provider offers strict schema mode or only JSON-object mode
  - implement provider-owned `callStructuredJSON()` for the contract the vendor actually supports
  - only seed `supports_structoutput = true` after end-to-end validation
- assistant prefill or prefix completion:
  - if TomoriBot uses assistant prefills, verify whether the vendor requires a beta endpoint, a trailing assistant message, or a message flag such as `prefix: true`
- live cost estimation:
  - if `/tool estimate cost` should support the provider, add a minimal non-streaming token probe
  - parse prompt token usage from the vendor response
  - add env-backed pricing defaults and document where those defaults came from
- unsupported parameters:
  - check whether reasoning models ignore or reject parameters like `temperature`, `top_p`, or logprob settings
  - strip or avoid unsupported parameters inside the provider layer

Rule:

- vendor capability claims are not the same thing as TomoriBot app-level support
- `ProviderInfo.featureSupport` should describe the runtime TomoriBot has actually implemented

## 11. Capability Implementation Reminders

Use this as the last pass before you call a provider integration "done".

### Tool Calling

- seed `llms.has_tools` conservatively per model instead of assuming all chat models support tools
- implement or reuse the provider tool adapter and confirm schema serialization matches the vendor contract
- verify the full assistant -> tool call -> tool result -> assistant continuation loop, not just first-turn tool emission
- if the vendor has special reasoning-mode tool requirements, keep that logic in the provider layer
- if strict tool-schema mode exists, treat it as optional follow-up work unless the runtime is fully validated

### Structured Output

- determine whether the vendor supports strict schema mode, JSON-object mode, or only prompt-steered JSON
- implement provider-owned `callStructuredJSON()` for the actual supported contract
- if the provider only guarantees JSON objects, inject the required prompt guidance and validate locally with Zod
- seed `llms.supports_structoutput` only for models validated end-to-end in TomoriBot
- if history extraction depends on structured output, do not enable `featureSupport.historyExtraction` until that path works

### Live Cost Estimation

- if the provider should support `/tool estimate cost`, add a minimal non-streaming prompt-token probe
- parse prompt token usage from the vendor response instead of estimating locally when the API exposes usage
- keep pricing source explicit:
  - use live/cached provider pricing when available
  - otherwise use env-backed defaults with documented provenance
- do not quietly hardcode marketing-page assumptions without making them overrideable
- document any caveats such as cache-hit vs cache-miss pricing, account-default models, or unsupported token-count endpoints

### Native Image Generation

- only implement this if the app already has a native image-generation path for the provider
- implement the provider-owned image-generation capability instead of faking it through text chat
- seed `image_diffusion_models` only for models that are actually wired and tested
- confirm `/config model image` and any image-generation commands use the provider cleanly
- if the provider has no native image generation, leave `featureSupport.nativeImageGeneration = false` and do not seed image rows

### Embedding Models

- only implement embeddings if the provider has a real embedding API path wired into TomoriBot
- implement the provider-owned embedding capability and seed `embedding_models`
- verify any provider-specific dimensionality, batching, or input limits
- confirm embedding selection/config flows behave correctly for the provider
- if embeddings are not implemented, leave `featureSupport.embeddings = false` and do not seed embedding rows

## 12. Test the Integration

Minimum test checklist:

- provider is auto-discovered at startup
- aliases resolve correctly
- `/config apikey set` validation works
- `/config setup` and provider-specific error formatting work
- `/config model text` shows the provider's seeded models
- normal chat streaming works
- tool calling works if supported
- structured output works if supported
- history extraction works if supported
- reasoning-mode tool continuation works if the vendor requires replay fields
- assistant-prefill behavior works if the provider supports native prefix completion
- `/tool estimate cost` works if `featureSupport.liveTokenCounting = true`
- unsupported features fail cleanly instead of throwing deep runtime errors
- feature-gated commands behave correctly for your `featureSupport` values

Validation commands:

```bash
bun run check
bun run lint
```

Run `bun run check-locales` only if you changed locale files or command metadata.

## Common Mistakes

- Forgetting `providerInfo.ts` and trying to keep metadata only inside `getInfo()`
- Marking a feature as supported without wiring its shared executor path
- Marking a feature as supported without implementing the matching provider capability
- Assuming provider-folder auto-discovery also handles static metadata registration
- Hardcoding model lists in code instead of using the database-backed inventory
- Adding new provider checks directly in commands instead of the provider capability layer
- Treating vendor API capability as the same thing as app-level support

## Related Files

- `docs/ai/providers.md`
- `docs/guides/openai-compatible-provider-family.md`
- `src/types/provider/interfaces.ts`
- `src/types/provider/featureInterfaces.ts`
- `src/utils/provider/providerFactory.ts`
- `src/utils/provider/providerInfoRegistry.ts`
- `src/utils/provider/providerCapabilityResolver.ts`
- `src/providers/utils/providerFeatureExecutors.ts`
- `src/db/seed.sql`
