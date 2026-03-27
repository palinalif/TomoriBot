# API Key Help Locale Text (en-US)

## /help apikey

**Description**: `Learn how to set up API keys for AI providers`

**Provider Description**: `Choose your AI provider`

### Provider Choices
- `provider_choice_brave`: `Brave Search`
- `provider_choice_google`: `Google Gemini`
- `provider_choice_deepseek`: `DeepSeek`
- `provider_choice_nvidia`: `NVIDIA NIM`
- `provider_choice_novelai`: `NovelAI`
- `provider_choice_openrouter`: `OpenRouter`
- `provider_choice_zai`: `Z.ai`
- `provider_choice_zaicoding`: `Z.ai (Coding)`

---

### Brave Search
- `brave_title`: `Setting Up Brave Search API Key`
- `brave_description`: `Brave Search is optional and only enhances my search capabilities. It does NOT power my AI as that's handled by your main provider.
- Enables image, video, and news search
- Provides real-time information from the internet
- Enhances my ability to answer current questions
- Free Tier includes 2,000 queries per month`
- `brave_getting_key_title`: `Getting Your API Key:`
- `brave_getting_key_description`: `1. Visit [Brave Search API](https://brave.com/search/api/)
2. Sign up for a free account
3. Navigate to your [API Keys](https://api-dashboard.search.brave.com/app/keys) section in Dashboard
4. Create a new API key
5. Copy and input your API key using {configBraveapiSet} command`
- `brave_important_title`: `Important Notes:`
- `brave_important_description`: `- This is separate from your main AI provider
- Without Brave API key, I can still function and use built-in web search`
- `brave_footer`: `For setting up your main AI provider, use the other \`/help apikey\` options`

---

### Google Gemini
- `google_title`: `Setting Up Google Gemini API Key`
- `google_description`: `Google Gemini offers free and paid tiers with powerful AI models.
- Free tier available with generous limits
- Supports all TomoriBot features such as vision and persona generation
- [Gemini Privacy Policy](https://ai.google.dev/gemini-api/terms)`
- `google_getting_key_title`: `Getting Your API Key:`
- `google_getting_key_description`: `1. Visit [Google AI Studio](https://aistudio.google.com/apikey)
2. Click \`Create API Key\` on top-right (create a new Project if needed)
3. Copy this API key into {configSetup} or {configApikeySet}`
- `google_footer`: `After setting up this provider, you may change its default model with {configModel}`

---

### DeepSeek
- `deepseek_title`: `Setting Up DeepSeek API Key`
- `deepseek_description`: `DeepSeek provides direct access to its own chat and reasoning models on a pay-as-you-go basis.
- Supports DeepSeek chat and reasoning models in TomoriBot
- Supports tool-capable and structured-output-capable text models in TomoriBot
- Native image generation and embeddings are not currently available through TomoriBot's DeepSeek provider
- [DeepSeek API Docs](https://api-docs.deepseek.com/)`
- `deepseek_getting_key_title`: `Getting Your API Key:`
- `deepseek_getting_key_description`: `1. Visit [DeepSeek API Keys](https://platform.deepseek.com/api_keys)
2. Sign in or create a DeepSeek platform account
3. Create a new API key
4. If needed, add credits in your DeepSeek platform account before use
5. Copy this API key into {configSetup} or {configApikeySet}`
- `deepseek_model_notes_title`: `Model Notes:`
- `deepseek_model_notes_description`: `- \`deepseek-chat\` is the general chat model
- \`deepseek-reasoner\` is the thinking/reasoning model and may respond more slowly
- You can switch between available DeepSeek text models after setup`
- `deepseek_footer`: `After setting up this provider, you may change its default model with {configModel}`

---

### NVIDIA NIM
- `nvidia_title`: `Setting Up NVIDIA NIM API Key`
- `nvidia_description`: `NVIDIA NIM provides hosted chat, embeddings, and image generation through NVIDIA's API catalog.
- Chat and embeddings use NVIDIA's hosted \`integrate.api.nvidia.com\` surface
- Native image generation uses NVIDIA's hosted \`ai.api.nvidia.com\` Stability endpoint
- Structured output and history extraction are available only on supported NVIDIA text models`
- `nvidia_getting_key_title`: `Getting Your API Key:`
- `nvidia_getting_key_description`: `1. Visit [NVIDIA Build](https://build.nvidia.com/)
2. Sign in or create an NVIDIA developer account
3. Create or manage your API keys from the [API Keys page](https://build.nvidia.com/settings/api-keys)
4. Copy this API key into {configSetup} or {configApikeySet}`
- `nvidia_model_notes_title`: `Model Notes:`
- `nvidia_model_notes_description`: `- \`deepseek-ai/deepseek-v3.2\` is the default general chat model
- \`qwen/qwen3.5-397b-a17b\` is the highest-capability multimodal model in TomoriBot's curated NVIDIA set
- \`nv-embed-v1\` is the default embedding model
- \`stabilityai/stable-diffusion-3-medium\` is the default NVIDIA image model`
- `nvidia_footer`: `After setting up this provider, you may change text, embedding, and image models with {configModel}, {configModelEmbedding}, and {configModelImage}`

---

### Z.ai
- `zai_title`: `Setting Up Z.ai API Key`
- `zai_description`: `Z.ai provides access to the GLM model family with both a general API and a dedicated coding endpoint.
- Supports chat, reasoning, image generation, and coding workflows
- GLM models include vision and reasoning variants
- Native image generation via \`glm-image\`
- Tool calling and structured output on all chat models
- Optional MCP add-ons available via \`/config mcp add\` for extra image/video workflows`
- `zai_general_endpoint_title`: `General API Endpoint:`
- `zai_general_endpoint_description`: `The general Z.ai endpoint provides access to chat, reasoning, and image generation.
- Best for general AI usage and broad compatibility
- Supports all GLM chat models with vision and reasoning capabilities`
- `zai_coding_endpoint_title`: `Coding Endpoint:`
- `zai_coding_endpoint_description`: `The dedicated Coding endpoint is optimized for GLM Coding Plan and coding-tool workflows.
- Intended for coding scenarios rather than general API usage
- Uses a separate endpoint with potentially different billing and access patterns
- If you need standard API billing and broader general usage, use the general endpoint`
- `zai_getting_key_title`: `Getting Your API Key:`
- `zai_getting_key_description`: `1. Visit [Z.ai Platform](https://z.ai)
2. Sign in or create an account
3. Navigate to API Keys in your dashboard
4. Create a new API key
5. Copy this API key into {configSetup} or {configApikeySet}`
- `zai_model_notes_title`: `Model Notes:`
- `zai_model_notes_description`: `- \`glm-5\` is the most capable model with advanced reasoning
- \`glm-4.7\` supports reasoning/thinking mode
- \`glm-4.7-flash\` is a fast, free model
- \`glm-4.6v\` is a vision-capable model that can see images
- \`glm-image\` generates images from text prompts`
- `zai_footer`: `After setting up this provider, you may change its default model with {configModel}`

---

### NovelAI
- `novelai_title`: `Setting Up NovelAI API Key`
- `novelai_description`: `NovelAI is a subscription-based service focused on creative storytelling and roleplay.
- Unlimited uncensored messages
- Currently only supports text generation (no vision or assistant features)
- [NovelAI Terms of Service](https://novelai.net/terms)`
- `novelai_getting_key_title`: `Getting Your API Key:`
- `novelai_getting_key_description`: `1. Visit [NovelAI](https://novelai.net/stories)
2. Navigate to settings through the ⚙️ icon on the top-left
3. Go to \`Account\`
4. Look for \`Get Persistent API Token\` (subscription required!)
5. Copy this API key into {configSetup} or {configApikeySet}`
- `novelai_footer`: `After setting up this provider, you may change its default model with {configModel}`

---

### OpenRouter
- `openrouter_title`: `Setting Up OpenRouter API Key`
- `openrouter_description`: `OpenRouter provides access to multiple AI models from different providers on a pay-as-you-go basis.
- Access to latest and most powerful AI models (some are free)
- Currently does not support all TomoriBot features
- [OpenRouter Terms of Service](https://openrouter.ai/terms)`
- `openrouter_getting_key_title`: `Getting Your API Key:`
- `openrouter_getting_key_description`: `1. Visit [OpenRouter](https://openrouter.ai/settings/keys)
2. Click \`Create API Key\`
3. Copy this API key {configSetup} or {configApikeySet}`
- `openrouter_model_selection_title`: `Choosing Models:`
- `openrouter_model_selection_description`: `OpenRouter offers access to many different AI models.
- Currently available models are based on popularity and performance, with tags for distinction:
  - (TOOLS) = Supports tool usage (web search, self-learning, stickers, etc.)
  - (IMG) = Sees images
  - (VID) = Sees videos
  - (STRUCT) = Supports structured output (needed for persona generation and expression initialization)
  - (REASON) = Reasoning / thinking-focused model
  - (FREE) = No cost, but may have rate limits
- If you can't find what you want, try using the \`other-model\` provider option
- Suggest additional models in {supportServer}`
- `openrouter_pricing_title`: `Important Pricing Notes:`
- `openrouter_pricing_description`: `- **Free models have strict rate limits** - paid models are recommended for better reliability
- **Always check pricing** on OpenRouter before selecting a model to avoid unexpected costs
- Costs vary significantly between models`
- `openrouter_settings_title`: `OpenRouter Account Settings:`
- `openrouter_settings_description`: `Settings configured in your OpenRouter account (such as model preferences, rate limits, etc.) will also apply when using TomoriBot`
- `openrouter_footer`: `After setting up this provider, you may change its default model with {configModel}`
