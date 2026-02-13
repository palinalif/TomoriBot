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
import { escapeRegExp } from "@/utils/text/stringHelper";
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
	usesOpenAIEndpoint,
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

	/**
	 * Whether the current stream is using GLM 4.6 (enables sentence-boundary buffering).
	 * Set in startStream() based on model type.
	 */
	private isGlmModel = false;

	/**
	 * Tracks whether any visible text has been emitted to the user during this stream.
	 * Used to suppress stray tool calls that appear after text output — these are model
	 * hallucinations (e.g., empty select_sticker_for_response) that fail on execution.
	 */
	private hasEmittedVisibleText = false;

	/**
	 * Sentence-boundary trailing buffer for GLM 4.6.
	 *
	 * NAI's ~150-token hard cap often cuts text mid-sentence. Instead of trying
	 * to continue (which causes garbled artifacts), we hold back text after the
	 * last sentence boundary and silently drop it when the stream ends.
	 *
	 * Only active for GLM 4.6 — Kayra uses generate_until_sentence at the API level.
	 */
	private sentenceTrailingBuffer = "";

	/** Regex matching characters that indicate a natural sentence/thought boundary.
	 * NOTE: Single quote (') is intentionally excluded — contractions like "How's",
	 * "don't", "it's" are far more common than closing single quotes, causing
	 * false positives that cut mid-word (e.g., "How'" instead of "How's it going?").
	 */
	private static readonly SENTENCE_BOUNDARY_PATTERN =
		/[.!?*~)\]"\u300D\u2026\u2014]\s*$/;


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
	 *
	 * For GLM 4.6 (OpenAI endpoint):
	 * - Uses the official GLM chat template with <|system|>, <|user|>, <|assistant|> tags
	 * - Single-pass generation — no continuation loop (NAI's ~150-token cap is accepted)
	 * - Incomplete trailing sentences are silently dropped via sentence-boundary buffering
	 * - Uses regex speaker detection for turn boundaries (GLM doesn't emit <|user|> tokens)
	 *
	 * For Kayra (native endpoint):
	 * - Uses flat text prompt with "Username: message" format
	 * - Uses generate_until_sentence for clean endings
	 * - Uses regex speaker detection for turn boundaries
	 */
	async *startStream(
		config: StreamConfig,
		context: StreamContext,
	): AsyncGenerator<RawStreamChunk, void, unknown> {
		log.info("NovelAIStreamAdapter: Initializing NovelAI streaming");

		// Reset buffers for new stream
		this.generationBuffer = "";
		this.sentenceTrailingBuffer = "";
		this.hasEmittedVisibleText = false;
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

		const isGlm = usesOpenAIEndpoint(config.model);
		this.isGlmModel = isGlm;

		// Build the prompt based on model type
		let prompt: string;
		if (isGlm) {
			// GLM 4.6: Official chat template with role tags and forced thinking
			prompt = this.assembleGlmChatPrompt(
				context.contextItems,
				context.tomoriState.tomori_nickname,
				{
					toolDefinitions: this.toolDefinitions,
					functionInteractionHistory: context.functionInteractionHistory,
				},
			);
		} else {
			// Kayra: Flat text prompt with "Username: message" format
			const basePrompt = this.assembleNovelAIPrompt(
				context.contextItems,
				context.tomoriState.tomori_nickname,
				{
					toolDefinitions: this.toolDefinitions,
					functionInteractionHistory: context.functionInteractionHistory,
				},
			);
			// Append bot name to signal it should generate the bot's response
			prompt = `${basePrompt}\n${context.tomoriState.tomori_nickname}: `;
		}

		log.info(`Assembled NovelAI prompt (${isGlm ? "GLM" : "Kayra"}). Length: ${prompt.length} characters`);

		// Log the full prompt for debugging
		log.section("NovelAI Full Prompt");
		log.info(prompt);

		// Get generation parameters for the model
		const parameters = getParametersForModel(config.model, config.temperature);

		// Build request
		const request: NovelAIGenerationRequest = {
			input: prompt,
			model: config.model,
			parameters,
		};

		// Log sanitized request for debugging
		this.logSanitizedRequest(request, prompt.length);

		try {
			// Single-pass streaming for both models:
			// - Kayra: generate_until_sentence handles clean endings
			// - GLM 4.6: sentence-boundary buffering drops incomplete trailing fragments
			yield* this.streamSinglePass(request, config);
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
	 * Single-pass streaming for Kayra — no continuation loop
	 */
	private async *streamSinglePass(
		request: NovelAIGenerationRequest,
		config: StreamConfig,
	): AsyncGenerator<RawStreamChunk, void, unknown> {
		const stream = novelaiGenerateStream(request, {
			apiKey: config.apiKey,
			timeout: config.inactivityTimeoutMs,
		});

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
			// GLM 4.6: If the stream ends while accumulating a tool call (model hit token cap
			// before generating </tool_call>), try to parse what we have. NAI's token limit
			// often cuts off the closing tag, so we synthesize it from the accumulated buffer.
			// Text preamble before the tool call is fine — it's already been emitted.
			if (
				this.toolCallMode === "tool_call" &&
				this.toolCallBuffer.trim()
			) {
				log.info(
					"NovelAI GLM: Stream ended during tool call accumulation — attempting to parse without closing tag",
				);
				// Append closing tag so extractToolCallBlock can match
				const patched = `${this.toolCallBuffer.trimEnd()}\n</tool_call>`;
				const toolCallBlock = this.extractToolCallBlock(patched);
				if (toolCallBlock) {
					const parsedCall = this.parseToolCallBlock(toolCallBlock);
					if (parsedCall) {
						log.info(
							`NovelAI GLM: Successfully parsed truncated tool call: ${parsedCall.name}`,
						);
						this.generationBuffer = "";
						this.sentenceTrailingBuffer = "";
						this.resetToolParsingState();
						return {
							type: "function_call",
							functionCall: parsedCall,
						};
					}
				}
				log.warn(
					"NovelAI GLM: Failed to parse truncated tool call — treating as empty response",
				);
			}

			// GLM 4.6: If still in undecided mode with a prelude buffer that looks like
			// an incomplete tool call (e.g., just the function name, waiting for <arg_key>),
			// try to parse it as a tool call before discarding.
			if (
				this.toolCallMode === "undecided" &&
				this.toolPreludeBuffer.trim()
			) {
				const trimmedPrelude = this.toolPreludeBuffer.trim();
				const firstLine = trimmedPrelude.split("\n")[0].trim();
				const normalizedName = firstLine
					? this.normalizeToolName(firstLine)
					: "";
				const matchedTool = normalizedName
					? this.toolDefinitions.find(
							(t) => t.name === normalizedName,
						)
					: undefined;

				if (matchedTool && trimmedPrelude.includes("<arg_key>")) {
					log.info(
						`NovelAI GLM: Stream ended with unwrapped tool call in prelude — attempting parse for "${matchedTool.name}"`,
					);
					const patched = `<tool_call>${trimmedPrelude}\n</tool_call>`;
					const toolCallBlock = this.extractToolCallBlock(patched);
					if (toolCallBlock) {
						const parsedCall = this.parseToolCallBlock(toolCallBlock);
						if (parsedCall) {
							log.info(
								`NovelAI GLM: Successfully parsed truncated prelude tool call: ${parsedCall.name}`,
							);
							this.generationBuffer = "";
							this.sentenceTrailingBuffer = "";
							this.resetToolParsingState();
							return {
								type: "function_call",
								functionCall: parsedCall,
							};
						}
					}
				}
			}

			// For GLM 4.6: check if the sentence trailing buffer has a complete thought.
			// If it ends at a sentence boundary, flush it before signaling done.
			// If not (NAI cut off mid-sentence), silently drop it for a clean ending.
			let finalFlush = "";
			if (this.isGlmModel && this.sentenceTrailingBuffer.trim()) {
				if (
					NovelaiStreamAdapter.SENTENCE_BOUNDARY_PATTERN.test(
						this.sentenceTrailingBuffer,
					)
				) {
					// Trailing buffer ends at a sentence boundary — it's a complete thought
					finalFlush = this.sentenceTrailingBuffer;
				} else {
					// Incomplete sentence — silently drop it
					log.info(
						`NovelAI GLM: Dropping incomplete trailing fragment ` +
						`(${this.sentenceTrailingBuffer.length} chars): ` +
						`"${this.sentenceTrailingBuffer.substring(0, 80)}..."`,
					);
				}
			}

			// Clear all buffers on completion
			this.generationBuffer = "";
			this.sentenceTrailingBuffer = "";
			this.hasEmittedVisibleText = false;
			this.resetToolParsingState();

			// If we have a final flush, emit it as text before done
			if (finalFlush) {
				// Return text — the orchestrator will get "done" on the next processChunk
				// call (which won't happen since the stream ended). Instead, we need to
				// signal both the text and done. Return text here; the stream's own
				// termination will signal done to the orchestrator.
				return {
					type: "text",
					content: finalFlush,
				};
			}

			return {
				type: "done",
			};
		}

		// Check for text content
		if (novelaiChunk.token) {
			if (this.toolsEnabled) {
				return this.processTokenWithToolParsing(novelaiChunk.token);
			}

			// GLM 4.6: Strip any <think>...</think> blocks before visible text processing.
			// With /nothink removed, the model may emit thinking blocks in its response.
			if (this.isGlmModel) {
				const stripped = this.stripThinkBlocks(novelaiChunk.token);
				if (!stripped) {
					return { type: "text", content: "" };
				}
				return this.processVisibleText(stripped);
			}

			return this.processVisibleText(novelaiChunk.token);
		}

		// Default: empty chunk
		return {
			type: "text",
			content: "",
		};
	}

	/**
	 * Process visible text with speaker detection and sentence-boundary buffering.
	 *
	 * For GLM 4.6: Text is routed through a sentence-boundary-aware trailing buffer.
	 * Only text up to the last confirmed sentence boundary is emitted to the orchestrator.
	 * The trailing fragment (potentially incomplete sentence) is held back and silently
	 * dropped if the stream ends mid-sentence (NAI's ~150-token cap).
	 *
	 * For Kayra: Text is passed through directly (generate_until_sentence handles endings).
	 *
	 * Both models use regex-based speaker transition detection to stop generation
	 * when the model starts another character's turn.
	 */
	private processVisibleText(text: string): ProcessedChunk {
		if (!text) {
			return {
				type: "text",
				content: "",
			};
		}

		// GLM 4.6: Detect stray </think> tags in visible text.
		// After the initial <think></think> block is consumed by stripThinkBlocks(),
		// any subsequent </think> in the visible text phase indicates model debris —
		// the model hallucinates garbage after the tag (e.g., "oggers:</think>\nI'll kill you").
		// Stop the stream immediately and only emit clean text before the tag.
		if (this.isGlmModel) {
			const thinkCloseIdx = text.indexOf("</think>");
			if (thinkCloseIdx !== -1) {
				const cleanBefore = text.slice(0, thinkCloseIdx).trim();
				log.warn(
					`NovelAI GLM: Stray </think> detected in visible text — stopping stream. ` +
					`Clean text before tag: "${cleanBefore.substring(0, 80)}"`,
				);
				// Clear buffers — stream will end naturally after this return
				this.generationBuffer = "";
				this.sentenceTrailingBuffer = "";
				this.hasEmittedVisibleText = false;
				if (cleanBefore) {
					// Emit clean text directly (skip speaker detection since we're stopping).
					// Set the flag for consistency with downstream logic.
					this.hasEmittedVisibleText = true;
					return { type: "text", content: cleanBefore };
				}
				return { type: "done" };
			}
		}

		// Add to buffer for speaker detection
		this.generationBuffer += text;

		// Detect speaker transitions — the model is generating another character's turn.
		// Both Kayra and GLM 4.6 need this: Kayra has no API stop sequences, and GLM
		// doesn't emit <|user|> tokens in completions mode (it just starts "Username: ...")
		const speakerPattern = /\n+([^\n:]+):\s*/;
		const match = this.generationBuffer.match(speakerPattern);

		if (match) {
			// Found a speaker transition — stop generation here
			this.generationBuffer = "";
			this.sentenceTrailingBuffer = "";
			return {
				type: "done",
			};
		}

		// For Kayra: pass text through directly (no sentence buffering needed)
		if (!this.isGlmModel) {
			if (text.trim()) this.hasEmittedVisibleText = true;
			return {
				type: "text",
				content: text,
			};
		}

		// GLM 4.6: Sentence-boundary buffering
		// Accumulate text in the trailing buffer, then emit everything up to the
		// last sentence boundary. The remainder stays buffered in case NAI cuts
		// the output mid-sentence — it gets silently dropped in processChunk on "final".
		this.sentenceTrailingBuffer += text;

		// Find the last sentence boundary in the buffer
		const lastBoundaryIndex = this.findLastSentenceBoundary(
			this.sentenceTrailingBuffer,
		);

		if (lastBoundaryIndex === -1) {
			// No sentence boundary found yet — hold everything
			return {
				type: "text",
				content: "",
			};
		}

		// Emit text up to and including the boundary, keep the rest buffered
		const emitText = this.sentenceTrailingBuffer.slice(
			0,
			lastBoundaryIndex + 1,
		);
		this.sentenceTrailingBuffer = this.sentenceTrailingBuffer.slice(
			lastBoundaryIndex + 1,
		);

		if (emitText.trim()) this.hasEmittedVisibleText = true;
		return {
			type: "text",
			content: emitText,
		};
	}

	/**
	 * Find the index of the last sentence boundary character in the given text.
	 *
	 * Sentence boundaries are characters that typically end a complete thought:
	 * punctuation (. ! ? …), closing quotes/brackets (" ) ] 」), markdown
	 * formatting (* ~), em dash (—), and newlines.
	 * NOTE: Single quote (') excluded — contractions (How's, don't) cause false cuts.
	 *
	 * @param text - Text to scan for sentence boundaries
	 * @returns Index of the last boundary character, or -1 if none found
	 */
	private findLastSentenceBoundary(text: string): number {
		// Scan backwards for the last sentence-ending character
		for (let i = text.length - 1; i >= 0; i--) {
			const char = text[i];
			if (
				char === "." ||
				char === "!" ||
				char === "?" ||
				char === "*" ||
				char === "~" ||
				char === ")" ||
				char === "]" ||
				char === "\"" ||
				char === "\u300D" || // 」
				char === "\u2026" || // …
				char === "\u2014" || // —
				char === "\n"
			) {
				return i;
			}
		}

		return -1;
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
				// Accept tool calls regardless of whether text was already emitted.
				// Text + tool call is a valid pattern (model announces intent then acts).
				// Invalid tool calls (wrong name, no args) are handled at the executor level.
				if (this.hasEmittedVisibleText) {
					log.info(
						"NovelAI GLM: Tool call detected after visible text — accepting (text preamble pattern)",
					);
				}
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

		// 1. Check for wrapped <tool_call> tag
		const tagIndex = this.textScanBuffer.indexOf(
			NovelaiStreamAdapter.TOOL_CALL_TAG,
		);

		if (tagIndex !== -1) {
			const visiblePart = this.textScanBuffer.slice(0, tagIndex);
			const toolPart = this.textScanBuffer.slice(tagIndex);
			this.textScanBuffer = "";

			// Accept tool calls found after text — text + tool call is a valid pattern
			// (model announces "Let me search for that" then calls the tool).
			// Emit any remaining visible text before the tag as preamble.
			this.toolCallMode = "tool_call";
			this.toolCallBuffer = toolPart;

			if (this.hasEmittedVisibleText || visiblePart.trim().length > 0) {
				log.info(
					"NovelAI GLM: <tool_call> found after visible text — accepting as text+tool pattern",
				);
			}

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

		// 2. Check for unwrapped tool call — bare function name on a new line followed by <arg_key>.
		//    GLM sometimes outputs text then switches to a tool call without <tool_call> wrapper.
		//    Scan for "\n{tool_name}\n<arg_key>" pattern in the buffer.
		if (this.isGlmModel && this.textScanBuffer.includes("<arg_key>")) {
			const unwrappedMatch = this.detectUnwrappedToolCallInText(this.textScanBuffer);
			if (unwrappedMatch) {
				const visiblePart = this.textScanBuffer.slice(0, unwrappedMatch.startIndex);
				const toolPart = this.textScanBuffer.slice(unwrappedMatch.startIndex);
				this.textScanBuffer = "";

				if (this.hasEmittedVisibleText || visiblePart.trim().length > 0) {
					log.info(
						`NovelAI GLM: Unwrapped tool call "${unwrappedMatch.toolName}" found after visible text — accepting as text+tool pattern`,
					);
				}

				// Emit any remaining visible text before the tool call as preamble
				if (visiblePart.trim().length > 0) {
					const cleaned = this.stripThinkBlocks(visiblePart);
					if (cleaned) {
						// Emit text first; tool call will be picked up on subsequent tokens
						this.toolCallMode = "tool_call";
						this.toolCallBuffer = `<tool_call>${toolPart.trim()}`;
						return this.processVisibleText(cleaned);
					}
				}

				// Wrap in <tool_call> for standard parsing
				log.info(
					`NovelAI GLM: Detected unwrapped tool call "${unwrappedMatch.toolName}" mid-text — wrapping in <tool_call> tags`,
				);
				this.toolCallMode = "tool_call";
				this.toolCallBuffer = `<tool_call>${toolPart.trim()}`;
				return { type: "text", content: "" };
			}
		}

		// 3. No tool tag found yet — flush everything except a small tail to avoid leaking partial tags
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

	/**
	 * Detect an unwrapped tool call in mid-text — a bare function name on its own line
	 * followed by `<arg_key>`. Returns the match position and tool name, or null.
	 *
	 * Scans for pattern: `\n{known_tool_name}\n<arg_key>` (newline-delimited tool name
	 * that matches a registered tool, with at least one argument following).
	 *
	 * @param buffer - Text scan buffer to search
	 * @returns Object with startIndex and toolName, or null if no match
	 */
	private detectUnwrappedToolCallInText(
		buffer: string,
	): { startIndex: number; toolName: string } | null {
		// Split into lines and check if any line matches a tool name with <arg_key> after it.
		// Track position through buffer using cumulative line lengths (no indexOf needed).
		const lines = buffer.split("\n");
		let currentIndex = 0;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line) {
				const normalizedName = this.normalizeToolName(line);
				const matchedTool = this.toolDefinitions.find(
					(t) => t.name === normalizedName,
				);

				if (matchedTool) {
					// Check if <arg_key> appears somewhere after this line
					const remainingText = lines.slice(i + 1).join("\n");
					if (remainingText.includes("<arg_key>")) {
						// currentIndex points to the start of lines[i].
						// Walk back one char to include the preceding newline separator.
						const startIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
						return { startIndex, toolName: matchedTool.name };
					}
				}
			}
			// Advance by line length + newline separator (except for last line)
			currentIndex += lines[i].length;
			if (i < lines.length - 1) {
				currentIndex += 1;
			}
		}

		return null;
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

			// 1. Handle stray </think> closing tags
			if (trimmedStart.startsWith("</think>")) {
				buffer = trimmedStart.slice("</think>".length);
				continue;
			}

			// 2. Handle <think>...</think> blocks (consume and continue)
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

			// 3. Properly wrapped tool call — <tool_call> tag present
			if (trimmedStart.startsWith("<tool_call>")) {
				return { mode: "tool_call", toolCallText: trimmedStart };
			}

			// 3b. Partial <tool_call> tag — buffer is a prefix of the full tag.
			//     NAI chunks can split the tag at any point (e.g., "<to", "<tool_cal").
			//     Wait for more tokens until the full tag arrives or we can rule it out.
			if (
				trimmedStart.startsWith("<tool_call") ||
				(trimmedStart.startsWith("<") && "<tool_call>".startsWith(trimmedStart))
			) {
				return { mode: "wait" };
			}

			// 4. Unwrapped tool call — model outputs function name directly without <tool_call> tag.
			//    GLM 4.6 sometimes omits the wrapper tag and generates:
			//      brave_web_search\n<arg_key>query</arg_key>\n<arg_value>...</arg_value>
			//    Detect this by checking if the first line matches a known tool name.
			//    Uses normalizeToolName() to handle underscore/hyphen variations
			//    (model outputs "brave_web_search" but tool is registered as "brave-web-search").
			const firstLine = trimmedStart.split("\n")[0].trim();
			if (firstLine) {
				const normalizedName = this.normalizeToolName(firstLine);
				const matchedTool = this.toolDefinitions.find(
					(t) => t.name === normalizedName,
				);

				if (matchedTool) {
					if (trimmedStart.includes("<arg_key>")) {
						// Confirmed unwrapped tool call — wrap in <tool_call> for parsing.
						// Use the ORIGINAL name from the model (not normalized) so parseToolCallBlock
						// can normalize it during parsing.
						log.info(
							`NovelAI GLM: Detected unwrapped tool call for "${matchedTool.name}" — wrapping in <tool_call> tags`,
						);
						return {
							mode: "tool_call",
							toolCallText: `<tool_call>${trimmedStart}`,
						};
					}
					// Tool name found but no <arg_key> yet — wait for more tokens
					log.info(
						`NovelAI GLM: decideToolCallMode — tool name "${matchedTool.name}" matched, waiting for <arg_key>. Prelude length: ${prelude.length}`,
					);
					return { mode: "wait" };
				}
				// No tool match — log for debugging unwrapped tool call detection failures
				log.info(
					`NovelAI GLM: decideToolCallMode — firstLine "${firstLine}" did not match any tool (normalized: "${normalizedName}"). Falling through to text mode.`,
				);
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
			const rawArgKey = match[1]?.trim();
			const rawValue = match[2]?.trim();
			if (!rawArgKey) continue;

			// Normalize garbled param names — GLM drops tokens at high temperature.
			// e.g., "ave_wuery" → "query", "ount" → "count"
			const argKey = this.normalizeParamName(functionName, rawArgKey);
			const expectedType = this.getToolParamType(functionName, argKey);
			args[argKey] = this.coerceArgValue(rawValue ?? "", expectedType);
		}

		return {
			name: functionName,
			args,
		};
	}

	/**
	 * Normalize a tool name from model output to match a registered tool definition.
	 *
	 * GLM 4.6 frequently outputs tool names that don't exactly match the registration:
	 * - Underscore/hyphen swaps: "brave_web_search" vs "brave-web-search"
	 * - Truncated prefixes: "ave_web_search" instead of "brave_web_search" (high-temp sampling drops tokens)
	 *
	 * Matching strategy (in priority order):
	 * 1. Exact match
	 * 2. Underscore → hyphen conversion
	 * 3. Hyphen → underscore conversion
	 * 4. Suffix match — if the raw name is a suffix of exactly one registered tool (handles dropped prefix tokens)
	 *
	 * @param rawName - Tool name as generated by the model
	 * @returns Normalized tool name matching a registered definition, or rawName if no match
	 */
	private normalizeToolName(rawName: string): string {
		// 1. Exact match
		if (this.toolDefinitions.some((tool) => tool.name === rawName)) {
			return rawName;
		}

		// 2. Underscore → hyphen
		const hyphenName = rawName.replace(/_/g, "-");
		if (this.toolDefinitions.some((tool) => tool.name === hyphenName)) {
			return hyphenName;
		}

		// 3. Hyphen → underscore
		const underscoreName = rawName.replace(/-/g, "_");
		if (this.toolDefinitions.some((tool) => tool.name === underscoreName)) {
			return underscoreName;
		}

		// 4. Suffix match — handles dropped prefix tokens from high-temperature sampling.
		//    e.g., model outputs "ave_web_search" (missing "br"), match "brave_web_search".
		//    Also try with underscore/hyphen normalization on both sides.
		const candidates = [rawName, hyphenName, underscoreName];
		const suffixMatches = this.toolDefinitions.filter((tool) =>
			candidates.some((candidate) =>
				tool.name.endsWith(candidate) && candidate.length >= 4,
			),
		);
		if (suffixMatches.length === 1) {
			log.info(
				`NovelAI GLM: Fuzzy-matched tool name "${rawName}" → "${suffixMatches[0].name}" (suffix match)`,
			);
			return suffixMatches[0].name;
		}

		// 5. Levenshtein distance — catch garbled names that aren't simple suffix truncations.
		//    Use stricter threshold (40%) than param matching since tool namespace is larger.
		let bestLevMatch: NormalizedToolDefinition | undefined;
		let bestLevDist = Number.POSITIVE_INFINITY;
		let secondBestDist = Number.POSITIVE_INFINITY;
		for (const tool of this.toolDefinitions) {
			// Try all normalized variants against each tool name
			const minDist = Math.min(
				...candidates.map((c) => this.levenshteinDistance(c, tool.name)),
			);
			const maxLen = Math.max(rawName.length, tool.name.length);
			if (minDist < bestLevDist && minDist <= Math.ceil(maxLen * 0.4)) {
				secondBestDist = bestLevDist;
				bestLevDist = minDist;
				bestLevMatch = tool;
			} else if (minDist < secondBestDist) {
				secondBestDist = minDist;
			}
		}
		if (bestLevMatch && (secondBestDist - bestLevDist >= 2 || this.toolDefinitions.length <= 2)) {
			log.info(
				`NovelAI GLM: Fuzzy-matched tool name "${rawName}" → "${bestLevMatch.name}" (edit distance: ${bestLevDist})`,
			);
			return bestLevMatch.name;
		}

		return rawName;
	}

	/**
	 * Normalize a garbled parameter name from model output to match a registered parameter.
	 *
	 * GLM 4.6 at higher temperatures drops or garbles tokens in argument names,
	 * e.g., "ave_wuery" instead of "query", "ount" instead of "count".
	 *
	 * Matching strategy:
	 * 1. Exact match — parameter exists in the tool definition
	 * 2. Suffix match — raw name is a suffix of a known parameter (handles dropped prefix tokens)
	 * 3. Best substring match — find the parameter whose name contains the most of the raw name
	 *
	 * @param functionName - Normalized tool name to look up parameters for
	 * @param rawParamName - Parameter name as generated by the model
	 * @returns Normalized parameter name, or rawParamName if no match
	 */
	private normalizeParamName(functionName: string, rawParamName: string): string {
		const tool = this.toolDefinitions.find((t) => t.name === functionName);
		if (!tool?.parameters?.properties) return rawParamName;

		const knownParams = Object.keys(tool.parameters.properties);

		// 1. Exact match
		if (knownParams.includes(rawParamName)) {
			return rawParamName;
		}

		// 2. Suffix match — "uery" matches "query", "ount" matches "count"
		const suffixMatches = knownParams.filter(
			(p) => p.endsWith(rawParamName) && rawParamName.length >= 3,
		);
		if (suffixMatches.length === 1) {
			log.info(
				`NovelAI GLM: Fuzzy-matched param name "${rawParamName}" → "${suffixMatches[0]}" (suffix match)`,
			);
			return suffixMatches[0];
		}

		// 3. Containment match — raw name contains a known param or vice versa
		//    Handles cases like "ave_wuery" where the model garbles across the name.
		//    Find the known param with the longest common subsequence in the raw name.
		const containmentMatches = knownParams.filter(
			(p) => rawParamName.includes(p) || p.includes(rawParamName),
		);
		if (containmentMatches.length === 1) {
			log.info(
				`NovelAI GLM: Fuzzy-matched param name "${rawParamName}" → "${containmentMatches[0]}" (containment match)`,
			);
			return containmentMatches[0];
		}

		// 4. Best suffix overlap — find the param that shares the longest suffix with rawParamName
		//    e.g., "ave_wuery" shares no direct suffix with "query", but we can check
		//    if the raw name ends with a significant portion of any known param.
		let bestMatch = "";
		let bestOverlap = 0;
		for (const param of knownParams) {
			// Check how many trailing characters of rawParamName match trailing characters of param
			let overlap = 0;
			const minLen = Math.min(rawParamName.length, param.length);
			for (let i = 1; i <= minLen; i++) {
				if (rawParamName[rawParamName.length - i] === param[param.length - i]) {
					overlap++;
				} else {
					break;
				}
			}
			// Require at least 3 chars overlap and >50% of the shorter name
			if (overlap > bestOverlap && overlap >= 3 && overlap > minLen * 0.5) {
				bestOverlap = overlap;
				bestMatch = param;
			}
		}
		if (bestMatch) {
			log.info(
				`NovelAI GLM: Fuzzy-matched param name "${rawParamName}" → "${bestMatch}" (suffix overlap: ${bestOverlap} chars)`,
			);
			return bestMatch;
		}

		// 5. Levenshtein distance — catch severely garbled names like "ave_wuery" → "query".
		//    Accept if edit distance is ≤60% of the longer name's length. High tolerance is safe
		//    because the param namespace is small (typically 3-8 params per tool), so false
		//    positives are unlikely. Also requires the best match to be clearly better than runner-up.
		let bestLevMatch = "";
		let bestLevDistance = Number.POSITIVE_INFINITY;
		let secondBestDistance = Number.POSITIVE_INFINITY;
		for (const param of knownParams) {
			const distance = this.levenshteinDistance(rawParamName, param);
			const maxLen = Math.max(rawParamName.length, param.length);
			if (distance < bestLevDistance && distance <= Math.ceil(maxLen * 0.6)) {
				secondBestDistance = bestLevDistance;
				bestLevDistance = distance;
				bestLevMatch = param;
			} else if (distance < secondBestDistance) {
				secondBestDistance = distance;
			}
		}
		// Only accept if there's a clear winner (best is at least 2 edits better than runner-up)
		if (bestLevMatch && (secondBestDistance - bestLevDistance >= 2 || knownParams.length <= 2)) {
			log.info(
				`NovelAI GLM: Fuzzy-matched param name "${rawParamName}" → "${bestLevMatch}" (edit distance: ${bestLevDistance})`,
			);
			return bestLevMatch;
		}

		log.warn(
			`NovelAI GLM: Could not match param name "${rawParamName}" to any known parameter of "${functionName}". Known params: [${knownParams.join(", ")}]`,
		);
		return rawParamName;
	}

	/**
	 * Compute the Levenshtein (edit) distance between two strings.
	 * Used for fuzzy matching garbled parameter names from GLM output.
	 *
	 * @param a - First string
	 * @param b - Second string
	 * @returns Minimum number of single-character edits (insert, delete, substitute) to transform a into b
	 */
	private levenshteinDistance(a: string, b: string): number {
		const m = a.length;
		const n = b.length;

		// Use single-row optimization (O(min(m,n)) space)
		const prev = new Array<number>(n + 1);
		for (let j = 0; j <= n; j++) prev[j] = j;

		for (let i = 1; i <= m; i++) {
			let prevDiag = prev[0];
			prev[0] = i;
			for (let j = 1; j <= n; j++) {
				const temp = prev[j];
				if (a[i - 1] === b[j - 1]) {
					prev[j] = prevDiag;
				} else {
					prev[j] = 1 + Math.min(prevDiag, prev[j - 1], prev[j]);
				}
				prevDiag = temp;
			}
		}

		return prev[n];
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
			// If tool schema expects a string but JSON parsed as number/boolean,
			// coerce to string. GLM often outputs bare numbers for ID fields
			// (e.g., discord_id: 684462114022490100 instead of "684462114022490100").
			if (
				expectedType === "string" &&
				typeof parsed.value !== "string"
			) {
				return String(parsed.value);
			}
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

	/**
	 * Build tool calling guide using GLM 4.6's official <tools> XML format.
	 * Matches the Jinja chat template structure from the reference implementation.
	 *
	 * @param toolDefinitions - Normalized tool definitions to include
	 * @returns Formatted tool guide string, or null if no tools
	 */
	private buildToolCallingGuide(
		toolDefinitions: NormalizedToolDefinition[],
	): string | null {
		if (!toolDefinitions.length) return null;

		const lines: string[] = [
			"# Tools",
			"",
			"You may call one or more functions to assist with the user query.",
			"",
			"You are provided with function signatures within <tools></tools> XML tags:",
			"<tools>",
		];

		// Emit each tool as a JSON object (matching the Jinja template's `tool | tojson`)
		for (const tool of toolDefinitions) {
			const toolJson: Record<string, unknown> = {
				name: tool.name,
			};
			if (tool.description) {
				toolJson.description = tool.description;
			}
			if (tool.parameters) {
				toolJson.parameters = tool.parameters;
			}
			lines.push(JSON.stringify(toolJson));
		}

		lines.push("</tools>");
		lines.push("");
		lines.push(
			"For each function call, output the function name and arguments within the following XML format:",
		);
		lines.push("<tool_call>{function-name}");
		lines.push("<arg_key>{arg-key-1}</arg_key>");
		lines.push("<arg_value>{arg-value-1}</arg_value>");
		lines.push("<arg_key>{arg-key-2}</arg_key>");
		lines.push("<arg_value>{arg-value-2}</arg_value>");
		lines.push("...");
		lines.push("</tool_call>");

		return lines.join("\n");
	}


	/**
	 * Build tool interaction history in flat text format (Kayra).
	 * Uses simple [Tool Result] labels without GLM role tags.
	 */
	private buildToolHistoryFlat(
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

	/**
	 * Build tool interaction history using GLM 4.6 role tags.
	 * Each tool call/response pair uses proper <|assistant|> + <|observation|> structure.
	 *
	 * @returns Array of { role, content } pairs for insertion into GLM chat template
	 */
	private buildToolHistoryGlm(
		history: StreamContext["functionInteractionHistory"] = [],
	): Array<{ role: "assistant" | "observation"; content: string }> {
		if (!history.length) return [];

		const turns: Array<{
			role: "assistant" | "observation";
			content: string;
		}> = [];

		for (const item of history) {
			// Assistant turn: include any text the model already streamed before the tool call,
			// so it doesn't repeat itself on the continuation pass.
			const assistantParts: string[] = [];

			if (item.preToolCallTextParts?.length) {
				for (const part of item.preToolCallTextParts) {
					const text = (part as { text?: string }).text;
					if (text?.trim()) {
						assistantParts.push(text.trim());
					}
				}
			}

			// Tool call block
			const toolCallLines: string[] = [];
			toolCallLines.push(`<tool_call>${item.functionCall.name}`);
			const args = item.functionCall.args ?? {};
			for (const [key, value] of Object.entries(args)) {
				toolCallLines.push(
					`<arg_key>${key}</arg_key>`,
				);
				toolCallLines.push(
					`<arg_value>${JSON.stringify(value)}</arg_value>`,
				);
			}
			toolCallLines.push("</tool_call>");
			assistantParts.push(toolCallLines.join("\n"));

			turns.push({
				role: "assistant",
				content: assistantParts.join("\n"),
			});

			// Observation turn with tool response
			const responseLines: string[] = ["<tool_response>"];
			responseLines.push(JSON.stringify(item.functionResponse));
			responseLines.push("</tool_response>");

			if (item.imageMetadata?.messageIds?.length) {
				responseLines.push(
					`[System: Images sent to Discord message ID(s): ${item.imageMetadata.messageIds.join(", ")}]`,
				);
			}

			turns.push({
				role: "observation",
				content: responseLines.join("\n"),
			});
		}

		return turns;
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

			const toolHistory = this.buildToolHistoryFlat(
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
	 * Assemble a GLM 4.6 chat prompt using the official chat template.
	 *
	 * Structure:
	 * ```
	 * [gMASK]<sop>
	 * <|system|>
	 * {consolidated system instructions + tool definitions}
	 *
	 * <|user|>
	 * Eli: Hello there!
	 * <|assistant|>
	 * <think></think>
	 * Hi Eli!
	 * ...
	 * <|assistant|>
	 * <think></think>
	 * ```
	 *
	 * Key decisions:
	 * - User turns keep speaker labels (multi-user Discord needs disambiguation)
	 * - Assistant turns have bot name STRIPPED — <|assistant|> is sufficient, and
	 *   including "Tomori:" causes garbled name artifacts (e.g., "Tomo", "Tomorleasing")
	 * - /nothink is NOT appended — removing it allows GLM to reason when needed
	 *   (tool use requires internal reasoning). /nothink was the directive disabling it.
	 * - <think></think> on assistant turns and generation prompt shows the expected format
	 * - If the model decides to think, any <think>...</think> blocks are stripped by
	 *   stripThinkBlocks() in the streaming pipeline
	 * - Tool definitions use <tools> XML format in the system block
	 * - Tool history uses <|assistant|> + <tool_call> + <|observation|> structure
	 *
	 * @param contextItems - Structured context items from context builder
	 * @param botName - Current bot persona name
	 * @param options - Tool definitions and function interaction history
	 * @returns Complete GLM 4.6 chat template prompt string
	 */
	private assembleGlmChatPrompt(
		contextItems: StructuredContextItem[],
		botName: string,
		options?: {
			toolDefinitions?: NormalizedToolDefinition[];
			functionInteractionHistory?: StreamContext["functionInteractionHistory"];
		},
	): string {
		const systemInstructionParts: string[] = [];
		const dialogueTurns: Array<{
			role: "user" | "model";
			content: string;
		}> = [];
		const includeTools = (options?.toolDefinitions?.length ?? 0) > 0;
		const systemTags = this.getSystemInstructionTags(includeTools);

		// 1. Classify context items into system instructions and dialogue turns
		for (const item of contextItems) {
			// Extract text content from parts
			const textContent = item.parts
				.filter((p) => p.type === "text")
				.map((p) => (p as { type: "text"; text: string }).text)
				.join("\n");

			if (!textContent) {
				// Skip items with no text (images/videos — NovelAI doesn't support these)
				continue;
			}

			// System instruction classification (same logic as Kayra)
			if (item.metadataTag) {
				if (systemTags.includes(item.metadataTag)) {
					systemInstructionParts.push(textContent);
				}
			} else if (item.role === "system") {
				systemInstructionParts.push(textContent);
			}

			// Dialogue turns (user/model items not in system tags)
			if ((item.role === "user" || item.role === "model") && textContent) {
				const isInSystemTags =
					item.metadataTag &&
					systemTags.includes(item.metadataTag);

				if (!isInSystemTags) {
					dialogueTurns.push({
						role: item.role,
						content: textContent,
					});
				}
			}
		}

		// 2. Add tool calling guide to system instructions
		if (includeTools) {
			const toolGuide = this.buildToolCallingGuide(
				options?.toolDefinitions ?? [],
			);
			if (toolGuide) {
				systemInstructionParts.push(toolGuide);
			}
		}

		// 3. Build the prompt using GLM 4.6 chat template
		const promptParts: string[] = [];

		// Header: [gMASK]<sop>
		promptParts.push("[gMASK]<sop>");

		// System block: consolidated system instructions
		if (systemInstructionParts.length > 0) {
			promptParts.push("<|system|>");
			promptParts.push(systemInstructionParts.join("\n\n"));
		}

		// 4. Dialogue turns with proper role tags
		// Build a regex to strip the bot's speaker label from assistant turns.
		// The <|assistant|> tag already identifies who's speaking, so the model
		// doesn't need "Tomori:" in the content — and including it causes the model
		// to try generating partial/garbled name prefixes (e.g., "Tomo", "Tomorleasing").
		const botNamePrefixPattern = new RegExp(
			`^${escapeRegExp(botName)}:\\s*`,
			"i",
		);

		for (const turn of dialogueTurns) {
			if (turn.role === "user") {
				// User turns keep speaker labels for multi-user disambiguation
				promptParts.push("<|user|>");
				promptParts.push(turn.content);
			} else if (turn.role === "model") {
				// Assistant turns: strip bot name prefix — <|assistant|> is sufficient
				const strippedContent = turn.content.replace(
					botNamePrefixPattern,
					"",
				);
				promptParts.push("<|assistant|>");
				promptParts.push("<think></think>");
				promptParts.push(strippedContent);
			}
		}

		// 5. Tool interaction history (after dialogue, before generation prompt).
		//    Include even when tools are disabled for the current iteration —
		//    the model needs to see prior tool calls (and failures) plus any text
		//    it already streamed, so it doesn't repeat itself.
		if (options?.functionInteractionHistory?.length) {
			const toolTurns = this.buildToolHistoryGlm(
				options.functionInteractionHistory,
			);
			for (const toolTurn of toolTurns) {
				if (toolTurn.role === "assistant") {
					promptParts.push("<|assistant|>");
					promptParts.push("<think></think>");
					promptParts.push(toolTurn.content);
				} else if (toolTurn.role === "observation") {
					promptParts.push("<|observation|>");
					promptParts.push(toolTurn.content);
				}
			}
		}

		// 6. Generation prompt: signal the model to generate the assistant's response.
		// <think></think> shows the expected format (thinking already complete for this turn).
		// Removing /nothink from user messages allows the model to reason when needed —
		// /nothink was the directive that explicitly disabled reasoning.
		promptParts.push("<|assistant|>");
		promptParts.push("<think></think>");

		return promptParts.join("\n");
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
