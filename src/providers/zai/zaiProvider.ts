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
import { zaiProviderInfo } from "@/providers/zai/providerInfo";
import {
	ZaiStreamAdapter,
	type ZaiStreamConfig,
} from "@/providers/zai/zaiStreamAdapter";
import { getZaiToolAdapter } from "@/providers/zai/zaiToolAdapter";
import {
	createOpenAICompatibleHttpError,
	normalizeOpenAICompatibleProviderError,
} from "@/providers/openaiCompatible/openaiCompatibleErrorFormatter";
import { callZaiStructuredJSON } from "@/providers/zai/zaiStructuredOutput";
import { generateZaiNativeImage } from "@/providers/zai/zaiImageGeneration";
import type { TomoriState } from "@/types/db/schema";
import type { StructuredContextItem } from "@/types/misc/context";
import type {
	ProviderNativeImageGenerationRequest,
	ProviderNativeImageGenerationResult,
	ProviderStructuredJsonRequest,
	StructuredOutputResult,
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
import { log } from "@/utils/misc/logger";

const DEFAULT_ZAI_MODEL = "zai/glm-5";
const ZAI_CHAT_COMPLETIONS_URL =
	"https://api.z.ai/api/coding/paas/v4/chat/completions";

export interface ZaiProviderConfig extends ProviderConfig {
	endpointUrl: string;
	seesImages?: boolean;
	seesVideos?: boolean;
}

/**
 * Z.ai (Coding) LLM Provider.
 * Provides chat, reasoning, structured output, and native image generation
 * via the Z.ai Coding API (OpenAI-compatible family).
 */
export class ZaiProvider
	extends BaseLLMProvider
	implements LLMProvider, SupportsStructuredOutput, SupportsNativeImageGeneration
{
	getInfo(): ProviderInfo {
		return zaiProviderInfo;
	}

	/**
	 * Validate a Z.ai API key by sending a minimal request.
	 * @param apiKey - The API key to validate
	 * @returns Validation result indicating success or failure with error details
	 */
	async validateApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
		try {
			const response = await fetch(ZAI_CHAT_COMPLETIONS_URL, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: "glm-5",
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
			log.error("Z.ai API key validation failed", error as Error);
			return {
				valid: false,
				error: normalizeOpenAICompatibleProviderError(error, {
					errorMessagePrefix: "Z.ai API error",
				}),
			};
		}
	}

	/**
	 * Format a provider error into a user-friendly localized description.
	 * @param error - The provider error object
	 * @param locale - Locale for the error message
	 * @returns Localized error description or null
	 */
	formatErrorDescription(error: ProviderError, locale: string): string | null {
		const adapter = new ZaiStreamAdapter();
		return adapter.createErrorDescription(error, locale);
	}

	/**
	 * Call Z.ai with structured JSON output.
	 * @param request - Structured JSON request parameters
	 * @param responseSchema - JSON Schema for expected response
	 * @param zodSchema - Zod schema for runtime validation
	 * @returns Parsed and validated structured output
	 */
	async callStructuredJSON<T>(
		request: ProviderStructuredJsonRequest,
		responseSchema: Record<string, unknown>,
		zodSchema: ZodType<T>,
	): Promise<StructuredOutputResult<T>> {
		return await callZaiStructuredJSON(
			request,
			responseSchema,
			zodSchema,
		);
	}

	/**
	 * Generate an image using Z.ai's native image generation API.
	 * @param request - Image generation request with prompt and aspect ratio
	 * @returns Generated image data as base64 with MIME type
	 */
	async generateNativeImage(
		request: ProviderNativeImageGenerationRequest,
	): Promise<ProviderNativeImageGenerationResult> {
		return await generateZaiNativeImage(request);
	}

	/**
	 * Get available tools formatted for Z.ai's OpenAI-compatible tool calling.
	 * @param tomoriState - Current server state
	 * @param streamingContext - Optional streaming context for filtering
	 * @returns Array of tool definitions in OpenAI format
	 */
	async getTools(
		tomoriState: TomoriState,
		streamingContext?: StreamingContext,
	): Promise<Array<Record<string, unknown>>> {
		if (!tomoriState.llm.has_tools) {
			log.info(
				"Z.ai provider: Model does not support tools (seeded capability)",
			);
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
			} = await getAvailableToolsWithMCP("zai", toolStateForContext);

			let finalBuiltInTools = availableBuiltInTools;
			if (streamingContext) {
				const minimalContext = {
					streamContext: streamingContext,
					provider: "zai" as const,
					channel: {} as BaseGuildTextChannel,
					client: {} as Client,
					tomoriState,
					locale: "en-US",
				};

				finalBuiltInTools = availableBuiltInTools.filter((tool) => {
					const isContextAvailable =
						"isAvailableForContext" in tool &&
						typeof tool.isAvailableForContext === "function"
							? tool.isAvailableForContext("zai", minimalContext)
							: true;

					return isContextAvailable;
				});

				log.info(
					`Applied Z.ai streaming context filtering: ${availableBuiltInTools.length} -> ${finalBuiltInTools.length} built-in tools`,
				);
			}

			const adapter = getZaiToolAdapter();
			const allToolsConfig =
				await adapter.getAllToolsInOpenAICompatibleFormat(
					finalBuiltInTools,
					tomoriState.server_id,
					mcpFunctionNames,
				);

			log.info(
				`Z.ai provider tools loaded: ${finalBuiltInTools.length} built-in + ${mcpFunctionNames.length} MCP = ${totalCount} total tools`,
			);

			return allToolsConfig;
		} catch (error) {
			log.error(
				`Failed to get tools for Z.ai provider: ${tomoriState.llm.llm_codename}`,
				error as Error,
			);
			return [];
		}
	}

	async getDefaultModel(): Promise<string> {
		return DEFAULT_ZAI_MODEL;
	}

	/**
	 * Create a provider config from TomoriState.
	 * Strips `zai/` prefix from model codename and adjusts temperature.
	 * @param tomoriState - Current server state
	 * @param apiKey - Decrypted API key
	 * @returns Provider config ready for streaming
	 */
	async createConfig(
		tomoriState: TomoriState,
		apiKey: string,
	): Promise<ZaiProviderConfig> {
		// Strip zai/ prefix for the API — DB stores "zai/glm-5", API expects "glm-5"
		const apiModel = tomoriState.llm.llm_codename.startsWith("zai/")
			? tomoriState.llm.llm_codename.slice(4)
			: tomoriState.llm.llm_codename;

		// Same temperature adjustment as DeepSeek: shift down by 0.8, clamp to [0.2, 1.2]
		const adjustedTemperature = Math.max(
			0.2,
			Math.min(1.2, tomoriState.config.llm_temperature - 0.8),
		);

		const config: ZaiProviderConfig = {
			model: apiModel,
			apiKey,
			temperature: adjustedTemperature,
			maxOutputTokens: 4096,
			endpointUrl: ZAI_CHAT_COMPLETIONS_URL,
			seesImages: tomoriState.llm.sees_images,
			seesVideos: tomoriState.llm.sees_videos,
		};

		if (tomoriState.llm.has_tools) {
			config.tools = await this.getTools(tomoriState);
		}

		return config;
	}

	/**
	 * Stream a Z.ai response to Discord using the OpenAI-compatible stream pipeline.
	 * @param channel - Discord channel to stream to
	 * @param client - Discord client instance
	 * @param tomoriState - Current server state
	 * @param config - Provider config from createConfig
	 * @param contextItems - Structured context items for the conversation
	 * @param currentTurnModelParts - Current turn model parts
	 * @param emojiStrings - Optional emoji strings for the response
	 * @param functionInteractionHistory - Optional function call history
	 * @param initialInteraction - Optional initial command interaction
	 * @param replyToMessage - Optional message to reply to
	 * @param streamingContext - Optional streaming context
	 * @param userLocale - User locale for error messages
	 * @param webhook - Optional webhook for persona identity
	 * @param personaAvatarUrl - Optional persona avatar URL
	 * @param personaUsername - Optional persona username
	 * @param prefixStrippingName - Optional prefix stripping name
	 * @returns Stream result with status and data
	 */
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
			`ZaiProvider: Starting streaming for server ${tomoriState.server_id}, model ${config.model}`,
		);

		try {
			const zaiConfig = config as ZaiProviderConfig;
			const streamConfig: ZaiStreamConfig = {
				...zaiConfig,
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

			// Z.ai uses a single endpoint — no beta URL needed for prefill
			if (streamingContext && tomoriState.llm.has_tools) {
				log.info(
					"ZaiProvider: Reloading tools with streaming context for context-aware availability",
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
				provider: "zai",
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
			};

			const orchestrator = new StreamOrchestrator();
			const adapter = new ZaiStreamAdapter();
			const result = await orchestrator.streamToDiscord(
				adapter,
				streamConfig,
				streamContext,
			);

			log.info(
				`ZaiProvider: Streaming completed with status: ${result.status}`,
			);
			return result;
		} catch (error) {
			log.error(
				`ZaiProvider streaming error for server ${tomoriState.server_id}, model ${config.model}, channel ${channel.id}`,
				error as Error,
			);

			return {
				status: "error",
				data: error as Error,
			};
		}
	}
}
