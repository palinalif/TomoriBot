/**
 * NovelAI-specific streaming adapter
 *
 * This adapter implements the StreamProvider interface for NovelAI's API,
 * handling the unique requirements of NovelAI's text-based prompt format.
 *
 * Key responsibilities:
 * - Convert structured context to NovelAI's flat text prompt format
 * - Handle SSE streaming from NovelAI API
 * - Convert NovelAI chunks to normalized ProcessedChunk format
 * - Map NovelAI errors to normalized ProviderError type
 *
 * NovelAI Specifics:
 * - Prompt-based tool calling for GLM-4.6 (manual parsing of <tool_call> blocks)
 * - Uses flat text prompts with "{username}: {message}\n" format
 * - Uses `prefix` parameter to force bot name at start of generation
 * - Uses `stop_sequences` to prevent multi-speaker generation
 */

import type { FunctionCall } from "@/types/provider/interfaces";
import {
	ContextItemTag,
	type StructuredContextItem,
} from "@/types/misc/context";
import { log } from "@/utils/misc/logger";
import { localizer } from "@/utils/text/localizer";
import type {
	ProcessedChunk,
	ProviderError,
	RawStreamChunk,
	StreamConfig,
	StreamContext,
	StreamProvider,
} from "@/types/stream/interfaces";
import {
	novelaiGenerateStream,
	getParametersForModel,
	isNovelAIApiKeyError,
	isNovelAICreditsError,
	isNovelAIRateLimitError,
	type NovelAIGenerationRequest,
	type NovelAIStreamChunk,
} from "./novelaiService";

type ToolParamType = "string" | "number" | "boolean" | "array" | "object";

interface ToolParameterSchema {
	type?: "object";
	properties?: Record<
		string,
		{
			type?: ToolParamType;
			description?: string;
			enum?: string[];
			items?: { type?: ToolParamType };
		}
	>;
	required?: string[];
}

interface NormalizedToolDefinition {
	name: string;
	description?: string;
	parameters?: ToolParameterSchema;
}

/**
 * NovelAI-specific stream configuration
 */
export interface NovelaiStreamConfig extends StreamConfig {
	// NovelAI doesn't have provider-specific config beyond base StreamConfig
}

/**
 * NovelAI streaming adapter implementation
 *
 * NovelAI requires a flat text prompt with speaker labels:
 * [System instructions]
 *
 * Username1: message1
 * BotName: response1
 * Username2: message2
 * BotName:
 */
export class NovelaiStreamAdapter implements StreamProvider {
	/**
	 * Tags that should be prepended as system instructions
	 * Tool-related tags are conditionally included when prompt-based tool calling is enabled.
	 */
	private static readonly SYSTEM_INSTRUCTION_TAGS_BASE: ContextItemTag[] = [
		ContextItemTag.SYSTEM_INSTRUCTION_BLOCK,
		ContextItemTag.SYSTEM_PERSONALITY,
		ContextItemTag.SYSTEM_HUMANIZER_RULES,
		ContextItemTag.KNOWLEDGE_SERVER_INFO,
		ContextItemTag.KNOWLEDGE_SERVER_MEMORIES,
		// REMOVED: KNOWLEDGE_USER_MEMORIES, KNOWLEDGE_USER_STATUS, KNOWLEDGE_CURRENT_CONTEXT (now in KNOWLEDGE_USERS_IN_CONVERSATION)
	];

	private static readonly SYSTEM_INSTRUCTION_TAGS_TOOLING: ContextItemTag[] = [
		ContextItemTag.SYSTEM_FUNCTION_GUIDE,
		ContextItemTag.KNOWLEDGE_SERVER_EMOJIS,
		ContextItemTag.KNOWLEDGE_SERVER_STICKERS,
	];

	private toolsEnabled = false;
	private toolDefinitions: NormalizedToolDefinition[] = [];
	private toolCallMode: "disabled" | "undecided" | "text" | "tool_call" =
		"disabled";
	private toolPreludeBuffer = "";
	private toolCallBuffer = "";
	private insideThinkBlock = false;
	private textScanBuffer = "";
	private static readonly TOOL_CALL_TAG = "<tool_call>";
	private static readonly TOOL_CALL_TAG_LENGTH =
		NovelaiStreamAdapter.TOOL_CALL_TAG.length;

	private getSystemInstructionTags(includeTools: boolean): ContextItemTag[] {
		if (!includeTools) {
			return NovelaiStreamAdapter.SYSTEM_INSTRUCTION_TAGS_BASE;
		}

		return [
			...NovelaiStreamAdapter.SYSTEM_INSTRUCTION_TAGS_BASE,
			...NovelaiStreamAdapter.SYSTEM_INSTRUCTION_TAGS_TOOLING,
		];
	}

	/**
	 * Start streaming from NovelAI's API
	 */
	async *startStream(
		config: StreamConfig,
		context: StreamContext,
	): AsyncGenerator<RawStreamChunk, void, unknown> {
		log.info("NovelAIStreamAdapter: Initializing NovelAI streaming");

		// Reset buffer for new stream
		this.generationBuffer = "";
		this.toolDefinitions = this.normalizeToolDefinitions(config.tools ?? []);
		this.toolsEnabled = this.toolDefinitions.length > 0;
		this.resetToolParsingState();
		if (this.toolsEnabled) {
			log.info(
				`NovelAIStreamAdapter: Tool calling enabled with ${this.toolDefinitions.length} tools`,
			);
		}

		// Ensure model is provided
		if (!config.model) {
			throw new Error(
				"Model must be specified in config. Use NovelAIProvider.getDefaultModel() if needed.",
			);
		}

		// Assemble context for NovelAI format
		const basePrompt = this.assembleNovelAIPrompt(
			context.contextItems,
			context.tomoriState.tomori_nickname,
			{
				toolDefinitions: this.toolDefinitions,
				functionInteractionHistory: context.functionInteractionHistory,
			},
		);

		// Append bot name at the end to signal it should generate the bot's response
		// This is the standard NovelAI roleplay format: the prompt should end with "BotName: "
		const prompt = `${basePrompt}\n${context.tomoriState.tomori_nickname}: `;

		log.info(`Assembled NovelAI prompt. Length: ${prompt.length} characters`);

		// Log the full prompt for debugging
		log.section("NovelAI Full Prompt");
		log.info(prompt);

		// Get generation parameters for the model
		const parameters = getParametersForModel(config.model, config.temperature);

		// Build request (no prefix parameter needed - we already added bot name to prompt)
		const request: NovelAIGenerationRequest = {
			input: prompt,
			model: config.model,
			parameters,
		};

		// Log sanitized request for debugging
		this.logSanitizedRequest(request, prompt.length);

		try {
			// Start streaming
			const stream = novelaiGenerateStream(request, {
				apiKey: config.apiKey,
				timeout: config.inactivityTimeoutMs,
			});

			// Yield each chunk
			for await (const chunk of stream) {
				yield {
					data: chunk,
					provider: "novelai",
					metadata: {
						timestamp: Date.now(),
						model: config.model,
					},
				};
			}
		} catch (error) {
			// Convert NovelAI errors to our format
			const providerError = this.handleProviderError(error);
			yield {
				data: { error: providerError },
				provider: "novelai",
				metadata: {
					timestamp: Date.now(),
					error: true,
				},
			};
		}
	}

	/**
	 * Accumulated buffer for detecting speaker transitions
	 * NovelAI sometimes continues generating and starts a new speaker's turn
	 * We need to detect and strip this out
	 */
	private generationBuffer = "";

	/**
	 * Process a raw NovelAI chunk into normalized format
	 */
	processChunk(chunk: RawStreamChunk): ProcessedChunk {
		const novelaiChunk = chunk.data as NovelAIStreamChunk & {
			error?: ProviderError;
		};

		// Handle errors first
		if (novelaiChunk.error) {
			// If error is already a ProviderError (from startStream catch)
			if (
				typeof novelaiChunk.error === "object" &&
				"type" in novelaiChunk.error
			) {
				return {
					type: "error",
					error: novelaiChunk.error as ProviderError,
				};
			}

			// Otherwise convert string error
			return {
				type: "error",
				error: {
					type: "api_error",
					message: novelaiChunk.error as unknown as string,
					retryable: false,
				},
			};
		}

		// Check for completion
		if (novelaiChunk.final) {
			// Clear buffer on completion
			this.generationBuffer = "";
			this.resetToolParsingState();
			return {
				type: "done",
			};
		}

		// Check for text content
		if (novelaiChunk.token) {
			if (this.toolsEnabled) {
				return this.processTokenWithToolParsing(novelaiChunk.token);
			}

			return this.processVisibleText(novelaiChunk.token);
		}

		// Default: empty chunk
		return {
			type: "text",
			content: "",
		};
	}

	private processVisibleText(text: string): ProcessedChunk {
		if (!text) {
			return {
				type: "text",
				content: "",
			};
		}

		// Add to buffer for speaker detection
		this.generationBuffer += text;

		// Check if we've hit a speaker transition pattern
		// Pattern: newline(s) followed by text and a colon (e.g., "\n\nUsername:")
		const speakerPattern = /\n+([^\n:]+):\s*/;
		const match = this.generationBuffer.match(speakerPattern);

		if (match) {
			// Found a speaker transition - this means the model is trying to generate
			// another character's turn. We need to stop here.
			this.generationBuffer = "";
			return {
				type: "done",
			};
		}

		return {
			type: "text",
			content: text,
		};
	}

	private processTokenWithToolParsing(token: string): ProcessedChunk {
		if (this.toolCallMode === "disabled") {
			return this.processVisibleText(token);
		}

		if (this.toolCallMode === "undecided") {
			this.toolPreludeBuffer += token;
			const decision = this.decideToolCallMode(this.toolPreludeBuffer);

			if (decision.mode === "wait") {
				return { type: "text", content: "" };
			}

			if (decision.mode === "tool_call") {
				this.toolCallMode = "tool_call";
				this.toolCallBuffer = decision.toolCallText ?? "";
				this.toolPreludeBuffer = "";
				return { type: "text", content: "" };
			}

			this.toolCallMode = "text";
			const visibleText = this.stripThinkBlocks(decision.visibleText ?? "");
			this.toolPreludeBuffer = "";
			if (!visibleText) {
				return { type: "text", content: "" };
			}
			return this.processTextWithToolScan(visibleText);
		}

		if (this.toolCallMode === "tool_call") {
			this.toolCallBuffer += token;
			const toolCallBlock = this.extractToolCallBlock(this.toolCallBuffer);
			if (!toolCallBlock) {
				return { type: "text", content: "" };
			}

			const parsedCall = this.parseToolCallBlock(toolCallBlock);
			if (!parsedCall) {
				log.error("NovelAIStreamAdapter: Failed to parse tool call block", {
					toolCallBlock,
				});
				return {
					type: "error",
					error: {
						type: "api_error",
						message: "Failed to parse tool call from model output.",
						code: "tool_call_parse_error",
						retryable: false,
					},
				};
			}

			this.generationBuffer = "";
			this.resetToolParsingState();
			return {
				type: "function_call",
				functionCall: parsedCall,
			};
		}

		return this.processTextWithToolScan(token);
	}

	private processTextWithToolScan(token: string): ProcessedChunk {
		if (!token) {
			return { type: "text", content: "" };
		}

		this.textScanBuffer += token;

		const tagIndex = this.textScanBuffer.indexOf(
			NovelaiStreamAdapter.TOOL_CALL_TAG,
		);

		if (tagIndex !== -1) {
			const visiblePart = this.textScanBuffer.slice(0, tagIndex);
			const toolPart = this.textScanBuffer.slice(tagIndex);
			this.textScanBuffer = "";

			this.toolCallMode = "tool_call";
			this.toolCallBuffer = toolPart;

			if (visiblePart.trim().length > 0) {
				const cleaned = this.stripThinkBlocks(visiblePart);
				if (cleaned) {
					return this.processVisibleText(cleaned);
				}
			}

			const toolCallBlock = this.extractToolCallBlock(this.toolCallBuffer);
			if (toolCallBlock) {
				const parsedCall = this.parseToolCallBlock(toolCallBlock);
				if (parsedCall) {
					this.generationBuffer = "";
					this.resetToolParsingState();
					return { type: "function_call", functionCall: parsedCall };
				}

				log.error("NovelAIStreamAdapter: Failed to parse tool call block", {
					toolCallBlock,
				});
				return {
					type: "error",
					error: {
						type: "api_error",
						message: "Failed to parse tool call from model output.",
						code: "tool_call_parse_error",
						retryable: false,
					},
				};
			}

			return { type: "text", content: "" };
		}

		// No tool tag found yet - flush everything except a small tail to avoid leaking partial tags
		const holdLength = NovelaiStreamAdapter.TOOL_CALL_TAG_LENGTH - 1;
		if (this.textScanBuffer.length <= holdLength) {
			return { type: "text", content: "" };
		}

		const flushText = this.textScanBuffer.slice(
			0,
			this.textScanBuffer.length - holdLength,
		);
		this.textScanBuffer = this.textScanBuffer.slice(
			this.textScanBuffer.length - holdLength,
		);

		const cleaned = this.stripThinkBlocks(flushText);
		if (!cleaned) {
			return { type: "text", content: "" };
		}
		return this.processVisibleText(cleaned);
	}

	private decideToolCallMode(prelude: string): {
		mode: "wait" | "tool_call" | "text";
		toolCallText?: string;
		visibleText?: string;
	} {
		let buffer = prelude;

		while (true) {
			const trimmedStart = buffer.trimStart();

			if (!trimmedStart) {
				return { mode: "wait" };
			}

			if (trimmedStart.startsWith("</think>")) {
				buffer = trimmedStart.slice("</think>".length);
				continue;
			}

			if (trimmedStart.startsWith("<think>")) {
				const thinkEndIndex = trimmedStart.indexOf("</think>");
				if (thinkEndIndex === -1) {
					return { mode: "wait" };
				}

				buffer = trimmedStart.slice(
					thinkEndIndex + "</think>".length,
				);
				continue;
			}

			if (trimmedStart.startsWith("<tool_call>")) {
				return { mode: "tool_call", toolCallText: trimmedStart };
			}

			if (trimmedStart.startsWith("<tool_call")) {
				// Wait until the tag is fully received
				if (!trimmedStart.includes(">")) {
					return { mode: "wait" };
				}
			}

			return { mode: "text", visibleText: buffer };
		}
	}

	private extractToolCallBlock(buffer: string): string | null {
		const match = buffer.match(/<tool_call>[\s\S]*?<\/tool_call>/);
		return match ? match[0] : null;
	}

	private parseToolCallBlock(toolCallBlock: string): FunctionCall | null {
		const inner = toolCallBlock
			.replace(/^<tool_call>/, "")
			.replace(/<\/tool_call>$/, "")
			.trim();

		const nameMatch = inner.match(/^([^\n<]+)/);
		if (!nameMatch?.[1]) {
			return null;
		}

		const rawName = nameMatch[1].trim();
		const functionName = this.normalizeToolName(rawName);
		const args: Record<string, unknown> = {};

		const argMatches = inner.matchAll(
			/<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/g,
		);

		for (const match of argMatches) {
			const argKey = match[1]?.trim();
			const rawValue = match[2]?.trim();
			if (!argKey) continue;

			const expectedType = this.getToolParamType(functionName, argKey);
			args[argKey] = this.coerceArgValue(rawValue ?? "", expectedType);
		}

		return {
			name: functionName,
			args,
		};
	}

	private normalizeToolName(rawName: string): string {
		if (this.toolDefinitions.some((tool) => tool.name === rawName)) {
			return rawName;
		}

		const hyphenName = rawName.replace(/_/g, "-");
		if (this.toolDefinitions.some((tool) => tool.name === hyphenName)) {
			return hyphenName;
		}

		const underscoreName = rawName.replace(/-/g, "_");
		if (this.toolDefinitions.some((tool) => tool.name === underscoreName)) {
			return underscoreName;
		}

		return rawName;
	}

	private getToolParamType(
		functionName: string,
		argKey: string,
	): ToolParamType | undefined {
		const tool = this.toolDefinitions.find(
			(definition) => definition.name === functionName,
		);
		return tool?.parameters?.properties?.[argKey]?.type;
	}

	private coerceArgValue(
		rawValue: string,
		expectedType?: ToolParamType,
	): unknown {
		const trimmed = rawValue.trim();
		const parsed = this.tryParseJson(trimmed);
		if (parsed.success) {
			return parsed.value;
		}

		if (expectedType === "number") {
			const numValue = Number.parseFloat(trimmed);
			if (!Number.isNaN(numValue)) {
				return numValue;
			}
		}

		if (expectedType === "boolean") {
			if (trimmed === "true") return true;
			if (trimmed === "false") return false;
		}

		if (
			(trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
			(trimmed.startsWith("'") && trimmed.endsWith("'"))
		) {
			return trimmed.slice(1, -1);
		}

		return trimmed;
	}

	private tryParseJson(value: string): { success: boolean; value?: unknown } {
		try {
			return { success: true, value: JSON.parse(value) };
		} catch {
			return { success: false };
		}
	}

	private stripThinkBlocks(text: string): string {
		if (!text) return "";

		let output = "";
		let cursor = 0;

		while (cursor < text.length) {
			if (!this.insideThinkBlock) {
				const startIdx = text.indexOf("<think>", cursor);
				const endIdx = text.indexOf("</think>", cursor);

				if (startIdx === -1 && endIdx === -1) {
					output += text.slice(cursor);
					break;
				}

				if (endIdx !== -1 && (startIdx === -1 || endIdx < startIdx)) {
					// Stray closing tag, drop it
					output += text.slice(cursor, endIdx);
					cursor = endIdx + "</think>".length;
					continue;
				}

				if (startIdx !== -1) {
					output += text.slice(cursor, startIdx);
					this.insideThinkBlock = true;
					cursor = startIdx + "<think>".length;
				}
			} else {
				const endIdx = text.indexOf("</think>", cursor);
				if (endIdx === -1) {
					cursor = text.length;
					break;
				}

				this.insideThinkBlock = false;
				cursor = endIdx + "</think>".length;
			}
		}

		return output;
	}

	private resetToolParsingState(): void {
		this.toolCallMode = this.toolsEnabled ? "undecided" : "disabled";
		this.toolPreludeBuffer = "";
		this.toolCallBuffer = "";
		this.textScanBuffer = "";
		this.insideThinkBlock = false;
	}

	private normalizeToolDefinitions(
		tools: Array<Record<string, unknown>>,
	): NormalizedToolDefinition[] {
		const normalized: NormalizedToolDefinition[] = [];

		for (const tool of tools) {
			if (!tool || typeof tool !== "object") continue;
			const toolObj = tool as Record<string, unknown>;

			if ("function" in toolObj && toolObj.function) {
				const fn = toolObj.function as {
					name?: string;
					description?: string;
					parameters?: ToolParameterSchema;
				};
				if (fn.name) {
					normalized.push({
						name: fn.name,
						description: fn.description,
						parameters: fn.parameters,
					});
				}
				continue;
			}

			if (typeof toolObj.name === "string") {
				normalized.push({
					name: toolObj.name,
					description:
						typeof toolObj.description === "string"
							? toolObj.description
							: undefined,
					parameters:
						typeof toolObj.parameters === "object"
							? (toolObj.parameters as ToolParameterSchema)
							: undefined,
				});
			}
		}

		return normalized;
	}

	private buildToolCallingGuide(
		toolDefinitions: NormalizedToolDefinition[],
	): string | null {
		if (!toolDefinitions.length) return null;

		const lines: string[] = [
			"[System: Tool Calling]",
			"You can call tools to perform actions or fetch information.",
			"When you need a tool, respond with ONLY a tool call using this exact format:",
			"<tool_call>tool_name",
			"<arg_key>param</arg_key>",
			"<arg_value>JSON_VALUE</arg_value>",
			"</tool_call>",
			"Rules:",
			"- Do not include extra text outside the tool call when calling a tool.",
			"- Use valid JSON for each <arg_value> (strings must be quoted).",
			"- If no tool is needed, respond normally without <tool_call> blocks.",
			"Available tools:",
		];

		for (const tool of toolDefinitions) {
			const description = tool.description?.trim() || "No description provided.";
			lines.push(`- ${tool.name}: ${description}`);

			const paramSummary = this.formatToolParameters(tool.parameters);
			if (paramSummary) {
				lines.push(`  params: ${paramSummary}`);
			}
		}

		return lines.join("\n");
	}

	private formatToolParameters(parameters?: ToolParameterSchema): string | null {
		if (!parameters?.properties) return null;

		const parts: string[] = [];
		for (const [name, schema] of Object.entries(parameters.properties)) {
			let typeLabel = schema.type || "string";
			if (typeLabel === "array" && schema.items?.type) {
				typeLabel = `array<${schema.items.type}>`;
			}

			let segment = `${name}: ${typeLabel}`;
			if (schema.enum?.length) {
				segment += ` enum=[${schema.enum.join(", ")}]`;
			}
			parts.push(segment);
		}

		if (!parts.length) return null;

		const required =
			parameters.required && parameters.required.length > 0
				? ` required=[${parameters.required.join(", ")}]`
				: "";

		return `{ ${parts.join(", ")} }${required}`;
	}

	private buildToolHistory(
		history: StreamContext["functionInteractionHistory"] = [],
	): string | null {
		if (!history.length) return null;

		const lines: string[] = ["[System: Tool Call History]"];

		for (const item of history) {
			lines.push(this.formatToolCallForPrompt(item.functionCall));
			lines.push(`[Tool Result] ${JSON.stringify(item.functionResponse)}`);

			if (item.imageMetadata?.messageIds?.length) {
				lines.push(
					`[System: Images sent to Discord message ID(s): ${item.imageMetadata.messageIds.join(", ")}]`,
				);
			}
		}

		return lines.join("\n");
	}

	private formatToolCallForPrompt(functionCall: FunctionCall): string {
		const lines: string[] = [`<tool_call>${functionCall.name}`];
		const args = functionCall.args ?? {};

		for (const [key, value] of Object.entries(args)) {
			lines.push(
				`<arg_key>${key}</arg_key><arg_value>${JSON.stringify(value)}</arg_value>`,
			);
		}

		lines.push("</tool_call>");
		return lines.join("\n");
	}

	/**
	 * Extract function call from raw NovelAI chunk
	 * Tool calls are parsed from the text stream in processChunk for GLM-4.6
	 */
	extractFunctionCall(_chunk: RawStreamChunk): FunctionCall | null {
		return null;
	}

	/**
	 * Handle NovelAI-specific errors
	 */
	handleProviderError(error: unknown): ProviderError {
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Try to extract status code from error object or message
		let statusCode: number | undefined;

		// First, check if error has statusCode property (from validateNovelAIApiKey)
		if (error && typeof error === "object" && "statusCode" in error) {
			statusCode = error.statusCode as number;
		}

		// Fallback: try to extract from error message
		if (!statusCode) {
			const statusMatch = errorMessage.match(/\((\d{3})\)/);
			if (statusMatch) {
				statusCode = Number.parseInt(statusMatch[1], 10);
			}
		}

		// Determine error type based on status code and message
		let errorType: ProviderError["type"];
		let retryable: boolean;

		if (statusCode === 400) {
			errorType = "api_error";
			retryable = false;
		} else if (
			statusCode === 401 ||
			isNovelAIApiKeyError(errorMessage, statusCode)
		) {
			errorType = "api_error";
			retryable = false;
		} else if (
			statusCode === 402 ||
			isNovelAICreditsError(errorMessage, statusCode)
		) {
			errorType = "api_error";
			retryable = false;
		} else if (
			statusCode === 429 ||
			isNovelAIRateLimitError(errorMessage, statusCode)
		) {
			errorType = "rate_limit";
			retryable = true;
		} else if (statusCode === 500 || statusCode === 502) {
			errorType = "api_error";
			retryable = true;
		} else if (statusCode === 503) {
			errorType = "provider_overloaded";
			retryable = true;
		} else if (
			statusCode === 504 ||
			errorMessage.toLowerCase().includes("timeout")
		) {
			errorType = "timeout";
			retryable = true;
		} else {
			errorType = "api_error";
			retryable = false;
		}

		return {
			type: errorType,
			message: `NovelAI API error${statusCode ? ` (${statusCode})` : ""}: ${errorMessage}`,
			code: statusCode?.toString() || "unknown",
			retryable,
			originalError: error,
		};
	}

	/**
	 * Create NovelAI-specific error description for embedding
	 */
	createErrorDescription(error: ProviderError, locale: string): string | null {
		// Get NovelAI-specific message based on error code
		const errorCode = error.code;
		let messageKey: string;

		// Check for specific trial account / recaptcha error
		const errorMessage = error.message.toLowerCase();
		if (
			errorCode === "400" &&
			(errorMessage.includes("recaptcha") ||
				errorMessage.includes("trial generation"))
		) {
			messageKey = "400_trial_message";
		} else {
			// Map error types to locale keys
			switch (error.type) {
				case "rate_limit":
					messageKey = "429_default_message";
					break;
				case "timeout":
					messageKey = "504_default_message";
					break;
				case "provider_overloaded":
					messageKey = "503_default_message";
					break;
				case "api_error":
					// Check for specific error codes
					if (errorCode === "400") {
						messageKey = "400_default_message";
					} else if (errorCode === "401") {
						messageKey = "401_default_message";
					} else if (errorCode === "402") {
						messageKey = "402_default_message";
					} else {
						messageKey = "unknown_default_message";
					}
					break;
				default:
					messageKey = "unknown_default_message";
					break;
			}
		}

		try {
			const novelaiMessage = localizer(locale, `genai.novelai.${messageKey}`);

			// If this is an unknown error, append the actual API response for debugging
			if (messageKey === "unknown_default_message") {
				// Truncate error message to avoid Discord embed limits (max description is 4096, leave room for other text)
				const maxErrorLength = 1000;
				const apiErrorSnippet =
					error.message.length > maxErrorLength
						? `${error.message.substring(0, maxErrorLength)}...`
						: error.message;
				return `Error Code ${errorCode}: ${novelaiMessage}\n\n**API Response:**\n${apiErrorSnippet}`;
			}

			return `Error Code ${errorCode}: ${novelaiMessage}`;
		} catch {
			// Fallback if locale key doesn't exist
			return `Error Code ${errorCode}: ${error.message}`;
		}
	}

	/**
	 * Get provider information
	 */
	getProviderInfo() {
		return {
			name: "novelai",
			version: "1.0",
			supportsStreaming: true,
			supportsFunctionCalling: true, // Prompt-based tool calling for GLM-4.6
		};
	}

	/**
	 * Assemble context items into NovelAI's expected flat text format
	 *
	 * Format:
	 * [System instructions]
	 *
	 * Username1: message1
	 * BotName: response1
	 * Username2: message2
	 * BotName:
	 */
	private assembleNovelAIPrompt(
		contextItems: StructuredContextItem[],
		_botName: string,
		options?: {
			toolDefinitions?: NormalizedToolDefinition[];
			functionInteractionHistory?: StreamContext["functionInteractionHistory"];
		},
	): string {
		const systemInstructionParts: string[] = [];
		const dialogueParts: string[] = [];
		const includeTools = (options?.toolDefinitions?.length ?? 0) > 0;
		const systemTags = this.getSystemInstructionTags(includeTools);

		for (const item of contextItems) {
			// Extract text content from parts
			const textContent = item.parts
				.filter((p) => p.type === "text")
				.map((p) => (p as { type: "text"; text: string }).text)
				.join("\n");

			if (!textContent) {
				// Skip items with no text (e.g., images/videos - NovelAI doesn't support these)
				continue;
			}

			// Check if this should be system instruction
			// If item has a metadataTag, it must be in the whitelist to be included
			// If no metadataTag, include only if role is "system"
			if (item.metadataTag) {
				// Has a tag - only include if in whitelist
				if (systemTags.includes(item.metadataTag)) {
					systemInstructionParts.push(textContent);
				}
				// Else: skip this item (not in whitelist)
			} else if (item.role === "system") {
				// No tag, but role is system - include it
				systemInstructionParts.push(textContent);
			}

			// Handle dialogue turns
			// CRITICAL: ALL user/model items go to dialogue (unless in SYSTEM_INSTRUCTION_TAGS)
			// This handles DIALOGUE_HISTORY, DIALOGUE_SAMPLE, and new tags like KNOWLEDGE_USERS_IN_CONVERSATION
			if ((item.role === "user" || item.role === "model") && textContent) {
				// Check if this item is NOT in system instruction tags
				const isInSystemTags =
					item.metadataTag &&
					systemTags.includes(item.metadataTag);

				if (!isInSystemTags) {
					// Dialogue turns - already formatted with speaker labels from contextBuilder
					// The context builder formats these as "{username}: {message}"
					dialogueParts.push(textContent);
				}
			}
		}

		if (includeTools) {
			const toolGuide = this.buildToolCallingGuide(
				options?.toolDefinitions ?? [],
			);
			if (toolGuide) {
				systemInstructionParts.push(toolGuide);
			}

			const toolHistory = this.buildToolHistory(
				options?.functionInteractionHistory ?? [],
			);
			if (toolHistory) {
				systemInstructionParts.push(toolHistory);
			}
		}

		// Combine parts: system instructions first, then dialogue
		// Use double newlines to separate system instructions, single newlines for dialogue
		const systemText = systemInstructionParts.join("\n\n");
		const dialogueText = dialogueParts.join("\n");

		// Combine with double newline between system and dialogue sections
		const parts = [systemText, dialogueText].filter((part) => part?.trim());
		const prompt = parts.join("\n\n");

		return prompt;
	}

	/**
	 * Log sanitized request configuration for debugging
	 */
	private logSanitizedRequest(
		request: NovelAIGenerationRequest,
		promptLength: number,
	): void {
		log.section("NovelAIStreamAdapter: Request Details");

		log.info(`Model: ${request.model}`);
		log.info(`Prompt Length: ${promptLength} characters`);
		log.info(
			`Parameters: temperature=${request.parameters.temperature}, max_length=${request.parameters.max_length}`,
		);
		if (this.toolsEnabled) {
			log.info(
				`Tool calling enabled (tools=${this.toolDefinitions.length})`,
			);
		}
	}
}
