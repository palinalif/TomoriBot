import { randomUUID } from "node:crypto";
import { z } from "zod";

export const LOGIT_BIAS_MIN = -100;
export const LOGIT_BIAS_MAX = 100;
export const LOGIT_BIAS_TEXT_MAX_LENGTH = 200;

export const logitBiasEntrySchema = z.object({
	id: z.string().min(1).max(100),
	text: z.string().trim().min(1).max(LOGIT_BIAS_TEXT_MAX_LENGTH),
	value: z.number().min(LOGIT_BIAS_MIN).max(LOGIT_BIAS_MAX),
});

export type LogitBiasEntry = z.infer<typeof logitBiasEntrySchema>;

function parseArrayLike(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}
	return [];
}

export function normalizeLogitBiasEntries(value: unknown): LogitBiasEntry[] {
	const entries = parseArrayLike(value);
	const normalized: LogitBiasEntry[] = [];

	for (const entry of entries) {
		const parsed = logitBiasEntrySchema.safeParse(entry);
		if (!parsed.success) continue;
		normalized.push(parsed.data);
	}

	return normalized;
}

export function parseLogitBiasInputTerms(input: string): string[] {
	const seen = new Set<string>();
	const terms: string[] = [];

	for (const rawTerm of input.split(",")) {
		const term = rawTerm.trim();
		if (term.length === 0 || seen.has(term)) continue;
		seen.add(term);
		terms.push(term);
	}

	return terms;
}

export function parseLogitBiasValue(input: string): number | null {
	const trimmed = input.trim();
	if (trimmed.length === 0) return null;

	const value = Number(trimmed);
	if (!Number.isFinite(value)) return null;
	if (value < LOGIT_BIAS_MIN || value > LOGIT_BIAS_MAX) return null;

	return value;
}

export function mergeLogitBiasEntries(
	existingEntries: LogitBiasEntry[],
	incomingEntries: LogitBiasEntry[],
): {
	entries: LogitBiasEntry[];
	addedCount: number;
	updatedCount: number;
} {
	const mergedEntries = [...existingEntries];
	let addedCount = 0;
	let updatedCount = 0;

	for (const incomingEntry of incomingEntries) {
		const existingIndex = mergedEntries.findIndex(
			(entry) => entry.text === incomingEntry.text,
		);

		if (existingIndex >= 0) {
			if (mergedEntries[existingIndex].value === incomingEntry.value) {
				continue;
			}
			mergedEntries[existingIndex] = {
				...mergedEntries[existingIndex],
				value: incomingEntry.value,
			};
			updatedCount++;
			continue;
		}

		mergedEntries.push(incomingEntry);
		addedCount++;
	}

	return {
		entries: mergedEntries,
		addedCount,
		updatedCount,
	};
}

export function buildLogitBiasEntries(
	terms: string[],
	value: number,
): LogitBiasEntry[] {
	return terms.map((term) => ({
		id: randomUUID(),
		text: term,
		value,
	}));
}

export function formatLogitBiasValue(value: number): string {
	if (Number.isInteger(value)) {
		return value.toString();
	}
	return Number.parseFloat(value.toFixed(4)).toString();
}

export function parseNumericTokenId(term: string): string | null {
	if (!/^\d+$/.test(term)) return null;

	const numericId = Number(term);
	if (!Number.isSafeInteger(numericId) || numericId < 0) return null;

	return numericId.toString();
}

export function buildRuntimeLogitBiasMap(
	entries: LogitBiasEntry[],
): Record<string, number> {
	const runtimeLogitBias: Record<string, number> = {};

	for (const entry of entries) {
		const tokenId = parseNumericTokenId(entry.text);
		if (!tokenId) continue;
		runtimeLogitBias[tokenId] = entry.value;
	}

	return runtimeLogitBias;
}

export function countRuntimeReadyLogitBiasEntries(
	entries: LogitBiasEntry[],
): number {
	let count = 0;

	for (const entry of entries) {
		if (parseNumericTokenId(entry.text)) {
			count++;
		}
	}

	return count;
}
