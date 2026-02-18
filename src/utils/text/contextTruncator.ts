import type { StructuredContextItem } from "@/types/misc/context";
import { ContextItemTag } from "@/types/misc/context";

/**
 * Estimates the input token count from a list of context items.
 *
 * Uses a 4-characters-per-token approximation applied only to text parts.
 * Image and video parts are excluded — their token cost is absorbed by the
 * 10% safety margin in {@link truncateDialogueHistory}.
 *
 * @param items - Structured context items to estimate
 * @returns Estimated token count
 */
function estimateInputTokens(items: StructuredContextItem[]): number {
	let totalChars = 0;
	for (const item of items) {
		for (const part of item.parts) {
			if (part.type === "text") {
				totalChars += part.text.length;
			}
		}
	}
	return Math.floor(totalChars / 4);
}

/**
 * Trims the oldest DIALOGUE_HISTORY user+model exchange pairs from contextItems
 * until the estimated token count fits within the safe input budget:
 *   safeInputBudget = floor((contextLength - maxCompletionTokens) * 0.9)
 *
 * Pairs are dropped oldest-first. If a user turn has no following model turn,
 * the lone user turn is dropped by itself. Stops when no more DIALOGUE_HISTORY
 * user items remain to drop.
 *
 * @param contextItems - Full list of structured context items to truncate
 * @param contextLength - Total context window size (input + output tokens)
 * @param maxCompletionTokens - Maximum output tokens reserved for the model's reply
 * @returns Object containing the truncated item list and the number of pairs dropped
 */
export function truncateDialogueHistory(
	contextItems: StructuredContextItem[],
	contextLength: number,
	maxCompletionTokens: number,
): { truncated: StructuredContextItem[]; pairsDropped: number } {
	// 1. Calculate the safe input budget: reserve maxCompletionTokens for output,
	//    then apply a 10% margin to absorb tokenizer estimation error
	const safeInputBudget = Math.floor(
		(contextLength - maxCompletionTokens) * 0.9,
	);

	// 2. Work on a mutable copy to avoid modifying the caller's array
	const items = [...contextItems];
	let pairsDropped = 0;

	// 3. Iteratively drop the oldest exchange pair until within budget
	while (estimateInputTokens(items) > safeInputBudget) {
		// 4. Find the index of the oldest DIALOGUE_HISTORY user turn
		const userIdx = items.findIndex(
			(item) =>
				item.metadataTag === ContextItemTag.DIALOGUE_HISTORY &&
				item.role === "user",
		);

		// 5. No more DIALOGUE_HISTORY user items remain — stop to preserve non-history context
		if (userIdx === -1) {
			break;
		}

		// 6. Scan forward from userIdx+1 for the immediately following model turn
		let modelIdx = -1;
		for (let i = userIdx + 1; i < items.length; i++) {
			if (
				items[i].metadataTag === ContextItemTag.DIALOGUE_HISTORY &&
				items[i].role === "model"
			) {
				modelIdx = i;
				break;
			}
		}

		// 7. Remove the entire exchange: all items from userIdx to modelIdx (inclusive).
		//    This correctly handles chatrooms where multiple users may send messages
		//    before a single model response, avoiding orphaned turns.
		if (modelIdx !== -1) {
			items.splice(userIdx, modelIdx - userIdx + 1);
		} else {
			// No model turn follows — drop the lone user turn by itself
			items.splice(userIdx, 1);
		}
		pairsDropped++;
	}

	return { truncated: items, pairsDropped };
}
