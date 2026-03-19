import {
	OpenAICompatibleStreamAdapter,
} from "@/providers/openaiCompatible/openaiCompatibleStreamAdapter";
import type { OpenAICompatibleStreamConfig } from "@/providers/openaiCompatible/openaiCompatibleTypes";

export interface CustomStreamConfig extends OpenAICompatibleStreamConfig {
	endpointUrl: string;
}

export class CustomStreamAdapter extends OpenAICompatibleStreamAdapter {
	constructor() {
		super({
			providerName: "custom",
			adapterName: "CustomStreamAdapter",
			localeNamespace: ["genai", "custom"].join("."),
			errorMessagePrefix: "Custom endpoint error",
			placeholderApiKey: "custom-endpoint-key",
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
		});
	}
}

function normalizeCustomApiUrl(endpointUrl?: string): string {
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
