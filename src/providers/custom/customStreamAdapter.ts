import {
	OpenAICompatibleStreamAdapter,
} from "@/providers/openaiCompatible/openaiCompatibleStreamAdapter";
import type { OpenAICompatibleStreamConfig } from "@/providers/openaiCompatible/openaiCompatibleTypes";

export interface CustomStreamConfig extends OpenAICompatibleStreamConfig {
	endpointUrl: string;
}

export const CUSTOM_PROVIDER_PLACEHOLDER_API_KEY =
	"custom-endpoint-configured";

export class CustomStreamAdapter extends OpenAICompatibleStreamAdapter {
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
			supportsSystemRole: (apiUrl) =>
				!isChatmockEndpoint(apiUrl),
		});
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
		const isLoopback =
			hostname === "127.0.0.1" ||
			hostname === "localhost" ||
			hostname === "::1";
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
