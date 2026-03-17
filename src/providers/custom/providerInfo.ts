import type { ProviderInfo } from "@/types/provider/interfaces";

export const customProviderInfo: ProviderInfo = {
	name: "custom",
	displayName: "Custom Endpoint",
	aliases: [],
	supportedModels: [],
	requiresApiKey: false,
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
