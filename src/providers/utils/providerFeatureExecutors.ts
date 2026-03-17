import {
	generateConversationSummaryGoogle,
	generateRoleplaySummaryGoogle,
} from "@/providers/google/compactGenerator";
import type {
	GeneratePresetParams,
	PresetGenerationResult,
} from "@/providers/google/presetGenerator";
import { generatePresetFromPrompt } from "@/providers/google/presetGenerator";
import {
	generateConversationSummaryOpenrouter,
	generateRoleplaySummaryOpenrouter,
} from "@/providers/openrouter/compactGenerator";
import { generatePresetFromPromptOpenrouter } from "@/providers/openrouter/presetGenerator";
import {
	callGoogleStructuredJSON,
	callGoogleStructuredOutput,
	callOpenrouterStructuredJSON,
	callOpenrouterStructuredOutput,
	type ExpressionBatchResult,
	type StructuredOutputResult,
} from "@/providers/utils/structuredOutput";
import {
	buildHistoryExtractionResponseSchema,
	HistoryExtractionResultSchema,
	type HistoryMemoryEntry,
} from "@/providers/utils/historyExtractionSchema";
import type { CompactRoleplaySummary } from "@/types/misc/compact";
import type { ToolContext } from "@/types/tool/interfaces";
import { log } from "@/utils/misc/logger";
import { resolveProviderFeatureImplementation } from "@/utils/provider/providerInfoRegistry";

type OpenrouterPresetOptions = {
	model: string;
	temperature?: number;
	tools?: Array<Record<string, unknown>>;
	toolContext?: ToolContext;
	maxToolRounds?: number;
};

export interface ProviderPresetGenerationRequest {
	providerName: string;
	apiKey: string;
	params: GeneratePresetParams;
	locale: string;
	openrouter?: OpenrouterPresetOptions;
}

export interface ProviderCompactSummaryRequest {
	providerName: string;
	apiKey: string;
	model: string;
	systemPrompt?: string;
	userPrompt: string;
	temperature?: number;
	googleImages?: Array<{ url: string; mimeType?: string }>;
	openrouterImages?: Array<{ url: string }>;
}

export interface ProviderExpressionInitializationRequest {
	providerName: string;
	apiKey: string;
	model: string;
	systemPrompt: string;
	userPrompt: string;
	images: Array<{ url: string; name: string }>;
	temperature?: number;
}

export interface ProviderHistoryExtractionRequest {
	providerName: string;
	apiKey: string;
	model: string;
	systemPrompt: string;
	userPrompt: string;
	temperature?: number;
	maxOutputTokens?: number;
}

type CompactConversationResult = {
	summary?: string;
	error?: string;
};

type CompactRoleplayResult = {
	summary?: CompactRoleplaySummary;
	error?: string;
};

export async function generatePresetForProvider(
	request: ProviderPresetGenerationRequest,
): Promise<PresetGenerationResult> {
	const implementation = resolveProviderFeatureImplementation(
		request.providerName,
		"presetGeneration",
	);

	switch (implementation) {
		case "google":
			return await generatePresetFromPrompt(
				request.apiKey,
				request.params,
				request.locale,
			);
		case "openrouter":
			if (!request.openrouter) {
				return {
					error:
						"OpenRouter preset generation requires OpenRouter execution options.",
					errorType: "MODEL_ERROR",
				};
			}

			return await generatePresetFromPromptOpenrouter(
				request.apiKey,
				request.params,
				request.locale,
				request.openrouter,
			);
		default:
			return {
				error: `Preset generation is not implemented for provider ${request.providerName}.`,
				errorType: "MODEL_ERROR",
			};
	}
}

export async function generateConversationSummaryForProvider(
	request: ProviderCompactSummaryRequest,
): Promise<CompactConversationResult> {
	const implementation = resolveProviderFeatureImplementation(
		request.providerName,
		"conversationCompaction",
	);

	switch (implementation) {
		case "google":
			return await generateConversationSummaryGoogle({
				apiKey: request.apiKey,
				model: request.model,
				systemPrompt: request.systemPrompt,
				userPrompt: request.userPrompt,
				temperature: request.temperature,
				images: request.googleImages,
			});
		case "openrouter":
			return await generateConversationSummaryOpenrouter({
				apiKey: request.apiKey,
				model: request.model,
				systemPrompt: request.systemPrompt,
				userPrompt: request.userPrompt,
				temperature: request.temperature,
				images: request.openrouterImages,
			});
		default:
			return {
				error: `Conversation compaction is not implemented for provider ${request.providerName}.`,
			};
	}
}

export async function generateRoleplaySummaryForProvider(
	request: ProviderCompactSummaryRequest,
): Promise<CompactRoleplayResult> {
	const implementation = resolveProviderFeatureImplementation(
		request.providerName,
		"conversationCompaction",
	);

	switch (implementation) {
		case "google":
			return await generateRoleplaySummaryGoogle({
				apiKey: request.apiKey,
				model: request.model,
				systemPrompt: request.systemPrompt,
				userPrompt: request.userPrompt,
				temperature: request.temperature,
				images: request.googleImages,
			});
		case "openrouter":
			return await generateRoleplaySummaryOpenrouter({
				apiKey: request.apiKey,
				model: request.model,
				systemPrompt: request.systemPrompt,
				userPrompt: request.userPrompt,
				temperature: request.temperature,
				images: request.openrouterImages,
			});
		default:
			return {
				error: `Roleplay compaction is not implemented for provider ${request.providerName}.`,
			};
	}
}

export async function callExpressionInitializationForProvider(
	request: ProviderExpressionInitializationRequest,
): Promise<StructuredOutputResult<ExpressionBatchResult>> {
	const implementation = resolveProviderFeatureImplementation(
		request.providerName,
		"expressionInitialization",
	);

	switch (implementation) {
		case "google":
			return await callGoogleStructuredOutput({
				apiKey: request.apiKey,
				model: request.model,
				systemPrompt: request.systemPrompt,
				userPrompt: request.userPrompt,
				images: request.images,
				temperature: request.temperature,
			});
		case "openrouter":
			return await callOpenrouterStructuredOutput({
				apiKey: request.apiKey,
				model: request.model,
				systemPrompt: request.systemPrompt,
				userPrompt: request.userPrompt,
				images: request.images,
				temperature: request.temperature,
			});
		default:
			return {
				success: false,
				error: `Expression initialization is not implemented for provider ${request.providerName}.`,
			};
	}
}

export async function extractHistoryWindowForProvider(
	request: ProviderHistoryExtractionRequest,
): Promise<HistoryMemoryEntry[]> {
	const implementation = resolveProviderFeatureImplementation(
		request.providerName,
		"historyExtraction",
	);
	const responseSchema = buildHistoryExtractionResponseSchema();
	const structuredRequest = {
		apiKey: request.apiKey,
		model: request.model,
		systemPrompt: request.systemPrompt,
		userPrompt: request.userPrompt,
		temperature: request.temperature,
		maxOutputTokens: request.maxOutputTokens,
	};

	switch (implementation) {
		case "google": {
			const result = await callGoogleStructuredJSON(
				structuredRequest,
				responseSchema,
				HistoryExtractionResultSchema,
			);

			if (result.success) {
				return result.data.memories;
			}

			log.warn(`History extraction failed (${request.providerName}): ${result.error}`);
			return [];
		}
		case "openrouter": {
			const result = await callOpenrouterStructuredJSON(
				structuredRequest,
				responseSchema,
				HistoryExtractionResultSchema,
				"history_extraction_result",
			);

			if (result.success) {
				return result.data.memories;
			}

			log.warn(`History extraction failed (${request.providerName}): ${result.error}`);
			return [];
		}
		default:
			log.warn(
				`History extraction is not implemented for provider ${request.providerName}.`,
			);
			return [];
	}
}
