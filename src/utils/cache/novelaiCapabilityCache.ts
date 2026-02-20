import type { ModelTokenLimits } from "./openrouterCapabilityCache";

/**
 * Static map of known NovelAI model codenames to their token limits.
 *
 * contextLength       = total context window (input + output tokens).
 *                       NovelAI does not expose this via API, so values are
 *                       sourced from official NovelAI documentation (~12 k tokens).
 * maxCompletionTokens = the max_length value TomoriBot requests for each model
 *                       (see getKayraParameters / getGlmParameters in novelaiService.ts).
 *
 * When a model is not present in this map, getNovelAITokenLimits() returns undefined
 * and truncation is silently skipped — a safe fallback for future or unknown models.
 */
const NOVELAI_TOKEN_LIMITS: Readonly<Record<string, ModelTokenLimits>> = {
	/** Legacy Kayra model — short generation cap, large input window */
	"kayra-v1": { contextLength: 12_288, maxCompletionTokens: 150 },
	/** GLM-4.6 via OpenAI-compatible endpoint — generous output cap, tighter input budget */
	"glm-4-6": { contextLength: 12_288, maxCompletionTokens: 4096 },
};

/**
 * Gets the token limits for a known NovelAI model.
 *
 * Uses a compile-time constant map — no async initialization required.
 * Returns undefined for models not in the map so truncation is skipped safely.
 *
 * @param modelCodename - Model codename (e.g., "glm-4-6", "kayra-v1")
 * @returns ModelTokenLimits if the model is known, undefined otherwise
 */
export function getNovelAITokenLimits(
	modelCodename: string,
): ModelTokenLimits | undefined {
	return NOVELAI_TOKEN_LIMITS[modelCodename];
}
