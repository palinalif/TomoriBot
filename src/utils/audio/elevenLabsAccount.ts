import {
	ELEVENLABS_API_BASE_URL,
	ELEVENLABS_SERVICE_NAME,
	getElevenLabsTtsConfig,
} from "@/utils/audio/elevenLabsShared";

export { ELEVENLABS_SERVICE_NAME };

export type ElevenLabsAccountValidationErrorKind =
	| "missing_api_key"
	| "timeout"
	| "request_failed"
	| "invalid_response";

export interface ElevenLabsAccountValidationResult {
	success: boolean;
	tier?: string | null;
	characterLimit?: number | null;
	characterCount?: number | null;
	canUseInstantVoiceCloning?: boolean | null;
	errorKind?: ElevenLabsAccountValidationErrorKind;
	statusCode?: number;
	details?: string;
}

export async function validateElevenLabsApiKey(
	apiKey: string,
): Promise<ElevenLabsAccountValidationResult> {
	if (!apiKey.trim()) {
		return {
			success: false,
			errorKind: "missing_api_key",
			details: "Missing ElevenLabs API key.",
		};
	}

	const { timeoutMs } = getElevenLabsTtsConfig();
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(
			`${ELEVENLABS_API_BASE_URL}/v1/user/subscription`,
			{
				method: "GET",
				headers: {
					Accept: "application/json",
					"xi-api-key": apiKey,
				},
				signal: controller.signal,
			},
		);

		clearTimeout(timeoutId);

		let responseJson: Record<string, unknown> | null = null;
		try {
			responseJson = (await response.json()) as Record<string, unknown>;
		} catch {
			responseJson = null;
		}

		if (!response.ok) {
			return {
				success: false,
				errorKind: "request_failed",
				statusCode: response.status,
				details:
					typeof responseJson?.detail === "string"
						? responseJson.detail
						: `HTTP ${response.status}`,
			};
		}

		return {
			success: true,
			tier: typeof responseJson?.tier === "string" ? responseJson.tier : null,
			characterLimit:
				typeof responseJson?.character_limit === "number"
					? responseJson.character_limit
					: null,
			characterCount:
				typeof responseJson?.character_count === "number"
					? responseJson.character_count
					: null,
			canUseInstantVoiceCloning:
				typeof responseJson?.can_use_instant_voice_cloning === "boolean"
					? responseJson.can_use_instant_voice_cloning
					: null,
		};
	} catch (error) {
		clearTimeout(timeoutId);
		if (error instanceof Error && error.name === "AbortError") {
			return {
				success: false,
				errorKind: "timeout",
				details: `ElevenLabs validation request timed out after ${timeoutMs}ms.`,
			};
		}

		return {
			success: false,
			errorKind: "request_failed",
			details: error instanceof Error ? error.message : String(error),
		};
	}
}
