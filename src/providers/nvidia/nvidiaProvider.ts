import type {
	AnyThreadChannel,
	BaseGuildTextChannel,
	BaseGuildVoiceChannel,
	Client,
	CommandInteraction,
	DMChannel,
	Message,
} from "discord.js";
import { StreamOrchestrator } from "@/utils/discord/streamOrchestrator";
import { nvidiaProviderInfo } from "@/providers/nvidia/providerInfo";
import {
	NvidiaStreamAdapter,
	type NvidiaStreamConfig,
} from "@/providers/nvidia/nvidiaStreamAdapter";
import { getNvidiaToolAdapter } from "@/providers/nvidia/nvidiaToolAdapter";
import {
	NVIDIA_CHAT_COMPLETIONS_URL,
	NVIDIA_DEFAULT_EMBEDDING_MODEL,
	NVIDIA_DEFAULT_TEXT_MODEL,
	NVIDIA_EMBEDDINGS_URL,
} from "@/providers/nvidia/nvidiaConstants";
import {
	createOpenAICompatibleHttpError,
	normalizeOpenAICompatibleProviderError,
} from "@/providers/openaiCompatible/openaiCompatibleErrorFormatter";
import { callNvidiaStructuredJSON } from "@/providers/nvidia/nvidiaStructuredOutput";
import { generateNvidiaNativeImage } from "@/providers/nvidia/nvidiaImageGeneration";
import type { TomoriState } from "@/types/db/schema";
import type { StructuredContextItem } from "@/types/misc/context";
import type {
	EmbeddingRequest,
	ProviderNativeImageGenerationRequest,
	ProviderNativeImageGenerationResult,
	ProviderStructuredJsonRequest,
	StructuredOutputResult,
	SupportsEmbeddings,
	SupportsNativeImageGeneration,
	SupportsStructuredOutput,
} from "@/types/provider/featureInterfaces";
import type { ZodType } from "zod";
import type {
	ApiKeyValidationResult,
	FunctionCall,
	FunctionResponseImageMetadata,
	LLMProvider,
	ProviderConfig,
	ProviderInfo,
	StreamResult,
} from "@/types/provider/interfaces";
import { BaseLLMProvider } from "@/types/provider/interfaces";
import type {
	ProviderError,
	StreamContext,
} from "@/types/stream/interfaces";
import { DISCORD_STREAMING_CONSTANTS } from "@/types/stream/types";
import type { StreamingContext } from "@/types/tool/interfaces";
import {
	type ToolStateForContext,
	getAvailableToolsWithMCP,
} from "@/tools/toolRegistry";
import { getCachedDefaultLLM, isLLMCacheReady } from "@/utils/cache/llmCache";
import {
	loadAvailableModelsForProvider,
	loadDefaultModelForProvider,
} from "@/utils/db/dbRead";
import { log } from "@/utils/misc/logger";

async function getDefaultNvidiaModel(): Promise<string> {
	const providerName = "nvidia";

	if (isLLMCacheReady()) {
		const cachedDefault = getCachedDefaultLLM(providerName);
		if (cachedDefault) {
			log.info(
				`Using cached default ${providerName} model: ${cachedDefault.llm_codename}`,
			);
			return cachedDefault.llm_codename;
		}
	}

	try {
		const dbDefault = await loadDefaultModelForProvider(providerName);
		if (dbDefault) {
			log.info(
				`Using database default ${providerName} model: ${dbDefault.llm_codename}`,
			);
			return dbDefault.llm_codename;
		}
	} catch (error) {
		log.warn(`Failed to load default model from database for ${providerName}`, {
			error: error as Error,
		});
	}

	try {
		const availableModels = await loadAvailableModelsForProvider(providerName);
		if (availableModels && availableModels.length > 0) {
			const firstModel = availableModels[0].llm_codename;
			log.warn(
				`No default model found, using first available ${providerName} model: ${firstModel}`,
			);
			return firstModel;
		}
	} catch (error) {
		log.error(
			`Failed to load available models for ${providerName}`,
			error as Error,
		);
	}

	return NVIDIA_DEFAULT_TEXT_MODEL;
}

function extractNvidiaEmbeddings(response: unknown): number[][] {
	const raw = response as {
		data?: Array<{ embedding?: number[] }>;
		embeddings?: Array<{ embedding?: number[]; values?: number[] } | number[]>;
		embedding?: { values?: number[] } | number[];
	};

	if (Array.isArray(raw?.data)) {
		return raw.data
			.map((entry) => (Array.isArray(entry.embedding) ? entry.embedding : []))
			.filter((values) => values.length > 0);
	}

	if (Array.isArray(raw?.embeddings)) {
		return raw.embeddings
			.map((entry) => {
				if (Array.isArray(entry)) {
					return entry;
				}
				if (entry && Array.isArray(entry.embedding)) {
					return entry.embedding;
				}
				if (entry && Array.isArray(entry.values)) {
					return entry.values;
				}
				return [];
			})
			.filter((values) => values.length > 0);
	}

	if (Array.isArray(raw?.embedding)) {
		return [raw.embedding];
	}

	if (raw?.embedding && Array.isArray(raw.embedding.values)) {
		return [raw.embedding.values];
	}

	return [];
}

export interface NvidiaProviderConfig extends ProviderConfig {
	endpointUrl: string;
	seesImages?: boolean;
	seesVideos?: boolean;
	topP?: number;
	topK?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
	minP?: number;
}

export class NvidiaProvider
	extends BaseLLMProvider
	implements
		LLMProvider,
		SupportsEmbeddings,
		SupportsStructuredOutput,
		SupportsNativeImageGeneration
{
	getInfo(): ProviderInfo {
		return nvidiaProviderInfo;
	}

	async validateApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
		try {
			const validationModel =
				(await getDefaultNvidiaModel().catch(() => null)) ||
				NVIDIA_DEFAULT_TEXT_MODEL;
			const response = await fetch(NVIDIA_CHAT_COMPLETIONS_URL, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: validationModel,
					messages: [{ role: "user", content: "ping" }],
					max_tokens: 1,
					stream: false,
				}),
			});

			if (!response.ok) {
				throw createOpenAICompatibleHttpError(
					response.status,
					response.statusText,
					await response.text(),
				);
			}

			return { valid: true };
		} catch (error) {
			log.error("NVIDIA API key validation failed", error as Error);
			return {
				valid: false,
				error: normalizeOpenAICompatibleProviderError(error, {
					errorMessagePrefix: "NVIDIA API error",
				}),
			};
		}
	}

	formatErrorDescription(error: ProviderError, locale: string): string | null {
		const adapter = new NvidiaStreamAdapter();
		return adapter.createErrorDescription(error, locale);
	}

	supportsEmbeddingTaskType(): boolean {
		return false;
	}

	async generateEmbeddings(request: EmbeddingRequest): Promise<number[][]> {
		if (request.inputs.length === 0) {
			return [];
		}

		const response = await fetch(NVIDIA_EMBEDDINGS_URL, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${request.apiKey}`,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				model: request.model || NVIDIA_DEFAULT_EMBEDDING_MODEL,
				input: request.inputs,
			}),
		});

		if (!response.ok) {
			throw createOpenAICompatibleHttpError(
				response.status,
				response.statusText,
				await response.text(),
			);
		}

		return extractNvidiaEmbeddings(await response.json());
	}

	async callStructuredJSON<T>(
		request: ProviderStructuredJsonRequest,
		responseSchema: Record<string, unknown>,
		zodSchema: ZodType<T>,
	): Promise<StructuredOutputResult<T>> {
		return await callNvidiaStructuredJSON(request, responseSchema, zodSchema);
	}

	async generateNativeImage(
		request: ProviderNativeImageGenerationRequest,
	): Promise<ProviderNativeImageGenerationResult> {
		return await generateNvidiaNativeImage(request);
	}

	async getTools(
		tomoriState: TomoriState,
		streamingContext?: StreamingContext,
	): Promise<Array<Record<string, unknown>>> {
		if (!tomoriState.llm.has_tools) {
			log.info("NVIDIA provider: Model does not support tools (seeded capability)");
			return [];
		}

		try {
			const toolStateForContext: ToolStateForContext = {
				server_id: tomoriState.server_id.toString(),
				llm: {
					llm_codename: tomoriState.llm.llm_codename,
					has_tools: tomoriState.llm.has_tools,
					sees_images: tomoriState.llm.sees_images,
					sees_videos: tomoriState.llm.sees_videos,
					sees_youtube: tomoriState.llm.sees_youtube,
					supports_structoutput: tomoriState.llm.supports_structoutput,
				},
				config: {
					sticker_usage_enabled: tomoriState.config.sticker_usage_enabled,
					web_search_enabled: tomoriState.config.web_search_enabled,
					self_teaching_enabled: tomoriState.config.self_teaching_enabled,
					pin_message_enabled: tomoriState.config.pin_message_enabled,
					imagegen_enabled: tomoriState.config.imagegen_enabled,
					nai_exclusive_imggen: tomoriState.config.nai_exclusive_imggen,
				},
			};

			const {
				builtInTools: availableBuiltInTools,
				mcpFunctionNames,
				totalCount,
			} = await getAvailableToolsWithMCP("nvidia", toolStateForContext);

			let finalBuiltInTools = availableBuiltInTools;
			if (streamingContext) {
				const minimalContext = {
					streamContext: streamingContext,
					provider: "nvidia" as const,
					channel: {} as BaseGuildTextChannel,
					client: {} as Client,
					tomoriState,
					locale: "en-US",
				};

				finalBuiltInTools = availableBuiltInTools.filter((tool) => {
					const isContextAvailable =
						"isAvailableForContext" in tool &&
						typeof tool.isAvailableForContext === "function"
							? tool.isAvailableForContext("nvidia", minimalContext)
							: true;

					return isContextAvailable;
				});

				log.info(
					`Applied NVIDIA streaming context filtering: ${availableBuiltInTools.length} -> ${finalBuiltInTools.length} built-in tools`,
				);
			}

			const adapter = getNvidiaToolAdapter();
			const allToolsConfig =
				await adapter.getAllToolsInOpenAICompatibleFormat(
					finalBuiltInTools,
					tomoriState.server_id,
					mcpFunctionNames,
				);

			log.info(
				`NVIDIA provider tools loaded: ${finalBuiltInTools.length} built-in + ${mcpFunctionNames.length} MCP = ${totalCount} total tools`,
			);

			return allToolsConfig;
		} catch (error) {
			log.error(
				`Failed to get tools for NVIDIA provider: ${tomoriState.llm.llm_codename}`,
				error as Error,
			);
			return [];
		}
	}

	async getDefaultModel(): Promise<string> {
		return await getDefaultNvidiaModel();
	}

	async createConfig(
		tomoriState: TomoriState,
		apiKey: string,
	): Promise<NvidiaProviderConfig> {
		const config: NvidiaProviderConfig = {
			model: tomoriState.llm.llm_codename,
			apiKey,
			temperature: tomoriState.config.llm_temperature,
			maxOutputTokens: 4096,
			endpointUrl: NVIDIA_CHAT_COMPLETIONS_URL,
			seesImages: tomoriState.llm.sees_images,
			seesVideos: tomoriState.llm.sees_videos,
			...(tomoriState.config.llm_top_p < 1.0 && {
				topP: tomoriState.config.llm_top_p,
			}),
			...(tomoriState.config.llm_top_k > 0 && {
				topK: tomoriState.config.llm_top_k,
			}),
			...(tomoriState.config.llm_frequency_penalty !== 0 && {
				frequencyPenalty: tomoriState.config.llm_frequency_penalty,
			}),
			...(tomoriState.config.llm_presence_penalty !== 0 && {
				presencePenalty: tomoriState.config.llm_presence_penalty,
			}),
			...(tomoriState.config.llm_min_p > 0 && {
				minP: tomoriState.config.llm_min_p,
			}),
		};

		if (tomoriState.llm.has_tools) {
			config.tools = await this.getTools(tomoriState);
		}

		return config;
	}

	async streamToDiscord(
		channel:
			| BaseGuildTextChannel
			| BaseGuildVoiceChannel
			| DMChannel
			| AnyThreadChannel,
		client: Client,
		tomoriState: TomoriState,
		config: ProviderConfig,
		contextItems: StructuredContextItem[],
		currentTurnModelParts: Array<Record<string, unknown>>,
		emojiStrings?: string[],
		functionInteractionHistory?: Array<{
			functionCall: FunctionCall;
			functionResponse: Record<string, unknown>;
			imageMetadata?: FunctionResponseImageMetadata;
			preToolCallTextParts?: Array<Record<string, unknown>>;
		}>,
		initialInteraction?: CommandInteraction,
		replyToMessage?: Message,
		streamingContext?: StreamingContext,
		userLocale?: string,
		webhook?: import("discord.js").Webhook,
		personaAvatarUrl?: string,
		personaUsername?: string,
		prefixStrippingName?: string,
	): Promise<StreamResult> {
		log.info(
			`NvidiaProvider: Starting streaming for server ${tomoriState.server_id}, model ${config.model}`,
		);

		try {
			const nvidiaConfig = config as NvidiaProviderConfig;
			const streamConfig: NvidiaStreamConfig = {
				...nvidiaConfig,
				maxMessageLength: DISCORD_STREAMING_CONSTANTS.MAX_SINGLE_MESSAGE_LENGTH,
				flushBufferSize: DISCORD_STREAMING_CONSTANTS.FLUSH_BUFFER_SIZE_REGULAR,
				flushBufferSizeCodeBlock:
					DISCORD_STREAMING_CONSTANTS.FLUSH_BUFFER_SIZE_CODE_BLOCK,
				inactivityTimeoutMs: DISCORD_STREAMING_CONSTANTS.INACTIVITY_TIMEOUT_MS,
				baseTypeSpeedMsPerChar:
					DISCORD_STREAMING_CONSTANTS.BASE_TYPE_SPEED_MS_PER_CHAR,
				maxTypingTimeMs: DISCORD_STREAMING_CONSTANTS.MAX_TYPING_TIME_MS,
				minVisibleTypingDurationMs:
					DISCORD_STREAMING_CONSTANTS.MIN_VISIBLE_TYPING_DURATION_MS,
				humanizerDegree: tomoriState.config.humanizer_degree,
				emojiUsageEnabled: tomoriState.config.emoji_usage_enabled,
				seesImages: tomoriState.llm.sees_images,
				forceReason: streamingContext?.forceReason,
				isManuallyTriggered: streamingContext?.isManuallyTriggered,
			};

			if (streamingContext && tomoriState.llm.has_tools) {
				log.info(
					"NvidiaProvider: Reloading tools with streaming context for context-aware availability",
				);
				streamConfig.tools = await this.getTools(tomoriState, streamingContext);
			}

			const streamContext: StreamContext = {
				channel,
				client,
				initialInteraction,
				replyToMessage,
				tomoriState,
				contextItems,
				currentTurnModelParts,
				emojiStrings,
				functionInteractionHistory,
				provider: "nvidia",
				locale: userLocale ?? "en-US",
				suppressUserErrors: streamingContext?.suppressUserErrors,
				rotationKeyRetriesUsed: streamingContext?.rotationKeyRetriesUsed,
				outputPrefill: streamingContext?.outputPrefill,
				outputPrefillState: streamingContext?.outputPrefillState,
				webhook,
				personaAvatarUrl,
				personaUsername,
				prefixStrippingName,
				forcedMentions: streamingContext?.forcedMentions,
				abortSignal: streamingContext?.abortSignal,
			};

			const orchestrator = new StreamOrchestrator();
			const adapter = new NvidiaStreamAdapter();
			const result = await orchestrator.streamToDiscord(
				adapter,
				streamConfig,
				streamContext,
			);

			log.info(
				`NvidiaProvider: Streaming completed with status: ${result.status}`,
			);
			return result;
		} catch (error) {
			log.error(
				`NvidiaProvider streaming error for server ${tomoriState.server_id}, model ${config.model}, channel ${channel.id}`,
				error as Error,
			);

			return {
				status: "error",
				data: error as Error,
			};
		}
	}
}
