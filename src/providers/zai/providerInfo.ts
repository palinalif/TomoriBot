import type { ProviderInfo } from "@/types/provider/interfaces";

export const zaiProviderInfo: ProviderInfo = {
  name: "zai",
  displayName: "Z.ai (Coding)",
  aliases: [],
  supportedModels: ["glm-4.6v", "glm-4.7", "glm-4.7-flash", "glm-5"],
  requiresApiKey: true,
  supportsStreaming: true,
  supportsFunctionCalling: true,
  supportsImages: true,
  supportsVideos: false,
  apiFamily: "openai-compatible",
  featureSupport: {
    nativeImageGeneration: true,
    embeddings: false,
    structuredOutput: true,
    presetGeneration: false,
    expressionInitialization: false,
    liveTokenCounting: true,
    conversationCompaction: false,
    historyExtraction: true,
  },
};
