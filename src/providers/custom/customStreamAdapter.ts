import { OpenAICompatibleStreamAdapter } from "@/providers/openaiCompatible/openaiCompatibleStreamAdapter";
import type { OpenAICompatibleStreamConfig } from "@/providers/openaiCompatible/openaiCompatibleTypes";
import { GemmaToolCallParser } from "@/providers/custom/customGemmaToolParser";
import type { ProcessedChunk, RawStreamChunk } from "@/types/stream/interfaces";
import { log } from "@/utils/misc/logger";
import { buildCustomThinkingRequest } from "@/utils/provider/thinkingControl";

/**
 * When true, the stream adapter scans `delta.content` for Gemma 4's hallucinated
 * `<|tool_call>...<tool_call|>` token format and converts matches into proper
 * function_call chunks. Set CUSTOM_GEMMA_TOOL_PARSER_ENABLED=false to disable if
 * another local model produces similar token strings unexpectedly.
 */
const GEMMA_TOOL_PARSER_ENABLED = (process.env.CUSTOM_GEMMA_TOOL_PARSER_ENABLED ?? "true").toLowerCase() !== "false";

export interface CustomStreamConfig extends OpenAICompatibleStreamConfig {
  endpointUrl: string;
  /** Optional context window override sent as options.num_ctx (Ollama extension) */
  numCtx?: number | null;
}

export const CUSTOM_PROVIDER_PLACEHOLDER_API_KEY = "custom-endpoint-configured";

export class CustomStreamAdapter extends OpenAICompatibleStreamAdapter {
  private readonly gemmaParser = new GemmaToolCallParser();

  constructor() {
    super({
      providerName: "custom",
      adapterName: "CustomStreamAdapter",
      localeNamespace: ["genai", "custom"].join("."),
      errorMessagePrefix: "Custom endpoint error",
      placeholderApiKey: CUSTOM_PROVIDER_PLACEHOLDER_API_KEY,
      resolveApiUrl: (config) => normalizeCustomApiUrl(config.endpointUrl),
      shouldRetryWithoutStop: (statusCode, errorText) => {
        if (statusCode !== 400 && statusCode !== 422) {
          return false;
        }

        const normalized = errorText.toLowerCase();
        const mentionsStop = normalized.includes("stop");
        const indicatesUnsupportedParam =
          normalized.includes("unsupported") ||
          normalized.includes("unknown") ||
          normalized.includes("invalid") ||
          normalized.includes("not allowed") ||
          normalized.includes("unrecognized");

        return mentionsStop && indicatesUnsupportedParam;
      },
      // Chatmock (used as a local proxy for Codex CLI) silently strips
      // system-role turns before forwarding to the underlying model.
      // Detect it by URL so the adapter falls back to an in-band user turn.
      supportsSystemRole: (apiUrl) => !isChatmockEndpoint(apiUrl),
      // Inject Ollama-style options.num_ctx when the user has configured a
      // context window override. This travels outside the messages array so it
      // is unaffected by the context window it controls.
      mutateRequestBody: ({ requestBody, config, context }) => {
        const customConfig = config as CustomStreamConfig;
        if (customConfig.numCtx != null) {
          // Ollama reads options.num_ctx; KoboldCPP reads top-level max_context_length.
          // Both are injected so each server picks up what it understands and ignores the other.
          requestBody.options = {
            ...((requestBody.options as Record<string, unknown>) ?? {}),
            num_ctx: customConfig.numCtx,
          };
          requestBody.max_context_length = customConfig.numCtx;
          log.info(
            `CustomStreamAdapter: Injecting num_ctx=${customConfig.numCtx} (options.num_ctx + max_context_length)`,
          );
        }

        const thinkingRequest = buildCustomThinkingRequest(
          customConfig.endpointUrl,
          context.tomoriState.config.thinking_level,
          customConfig.forceReason,
        );
        if (thinkingRequest.think !== undefined) {
          requestBody.think = thinkingRequest.think;
          log.info(`CustomStreamAdapter: Applying Ollama think=${thinkingRequest.think}`);
        }
        if (thinkingRequest.reasoning_effort) {
          requestBody.reasoning_effort = thinkingRequest.reasoning_effort;
          log.info(`CustomStreamAdapter: Applying reasoning_effort=${thinkingRequest.reasoning_effort}`);
        }
      },
    });
  }

  /**
   * Intercept text chunks to detect Gemma 4's hallucinated tool call tokens.
   *
   * Gemma 4 at low quantisation leaks `<|tool_call>call:name{...}<tool_call|>`
   * into `delta.content` instead of using the proper `delta.tool_calls` field.
   * The GemmaToolCallParser buffers these tokens across chunk boundaries and
   * converts completed blocks into function_call chunks for the normal tool
   * execution pipeline.
   */
  override processChunk(chunk: RawStreamChunk): ProcessedChunk {
    const base = super.processChunk(chunk);

    if (!GEMMA_TOOL_PARSER_ENABLED) {
      return base;
    }

    // End-of-stream: flush held-back text and/or incomplete tool buffer.
    if (base.type === "done") {
      const { pendingText, functionCall } = this.gemmaParser.flush();

      if (functionCall) {
        log.info("CustomStreamAdapter: Flushed truncated Gemma tool call at stream end");
        return { ...base, type: "function_call", functionCall };
      }
      if (pendingText) {
        // Held-back scan chars that were never followed by a START_TOKEN.
        // Return as a text chunk; the stream iterator will exhaust naturally
        // on the next raw chunk (there isn't one), terminating the loop.
        log.info(`CustomStreamAdapter: Flushing ${pendingText.length} held-back chars at stream end`);
        return { ...base, type: "text", content: pendingText };
      }
      return base;
    }

    // Non-text chunks (errors, native delta.tool_calls) pass through untouched.
    if (base.type !== "text" || typeof base.content !== "string" || base.content.length === 0) {
      return base;
    }

    const result = this.gemmaParser.feed(base.content);

    if (result.functionCall) {
      return { ...base, type: "function_call", functionCall: result.functionCall };
    }

    return { ...base, content: result.visibleText };
  }
}

/**
 * Port that ChatMock listens on by default.
 * Override with the `CHATMOCK_PORT` environment variable if you run ChatMock
 * on a non-standard port (e.g. `CHATMOCK_PORT=9000`).
 */
const CHATMOCK_PORT = process.env.CHATMOCK_PORT ?? "8000";

/**
 * Returns `true` when the resolved API URL looks like a ChatMock endpoint.
 *
 * ChatMock (github.com/RayBytes/ChatMock) is a local OpenAI-compatible proxy
 * used to bridge Codex CLI.  It silently strips system-role messages, so the
 * system prompt must be injected as an in-band user turn instead.
 *
 * Detection heuristic: ChatMock's documented default is `http://127.0.0.1:8000`
 * (or `localhost:8000`), so we match any loopback address on the configured
 * port.  The port defaults to `8000` but is overridable via `CHATMOCK_PORT`.
 * This is intentionally narrow — other common local tools use different ports
 * (Ollama: 11434, KoboldCPP: 5001, LM Studio: 1234).
 */
export function isChatmockEndpoint(apiUrl: string): boolean {
  try {
    const { hostname, port } = new URL(apiUrl);
    const isLoopback = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
    return isLoopback && port === CHATMOCK_PORT;
  } catch {
    // Malformed URL — don't assume ChatMock
    return false;
  }
}

export function normalizeCustomApiUrl(endpointUrl?: string): string {
  if (!endpointUrl) {
    throw new Error("Custom endpoint URL is required");
  }

  let apiUrl = endpointUrl;
  if (!apiUrl.endsWith("/chat/completions")) {
    apiUrl = apiUrl.replace(/\/$/, "");
    apiUrl = `${apiUrl}/chat/completions`;
  }

  return apiUrl;
}
