import type {
	ProviderApiFamily,
	ProviderFeatureSupport,
	ProviderInfo,
} from "@/types/provider/interfaces";
import { customProviderInfo } from "@/providers/custom/providerInfo";
import { googleProviderInfo } from "@/providers/google/providerInfo";
import { novelaiProviderInfo } from "@/providers/novelai/providerInfo";
import { openrouterProviderInfo } from "@/providers/openrouter/providerInfo";

const providerInfos: readonly ProviderInfo[] = [
	googleProviderInfo,
	openrouterProviderInfo,
	novelaiProviderInfo,
	customProviderInfo,
] as const;

const providerInfoByCanonicalName = new Map<string, ProviderInfo>(
	providerInfos.map((info) => [info.name.toLowerCase(), info]),
);

const providerAliasToCanonicalName = new Map<string, string>();

for (const info of providerInfos) {
	providerAliasToCanonicalName.set(info.name.toLowerCase(), info.name);
	for (const alias of info.aliases ?? []) {
		providerAliasToCanonicalName.set(alias.toLowerCase(), info.name);
	}
}

export type ProviderFeatureName = keyof ProviderFeatureSupport;
export type ProviderFeatureImplementation =
	| "google"
	| "openrouter"
	| "novelai"
	| "custom";

const providerFeatureImplementations: Record<
	ProviderFeatureName,
	Partial<Record<string, ProviderFeatureImplementation>>
> = {
	nativeImageGeneration: {
		google: "google",
		openrouter: "openrouter",
	},
	embeddings: {
		google: "google",
		openrouter: "openrouter",
	},
	structuredOutput: {
		google: "google",
		openrouter: "openrouter",
	},
	presetGeneration: {
		google: "google",
		openrouter: "openrouter",
	},
	expressionInitialization: {
		google: "google",
		openrouter: "openrouter",
	},
	liveTokenCounting: {
		google: "google",
		openrouter: "openrouter",
	},
	conversationCompaction: {
		google: "google",
		openrouter: "openrouter",
	},
	historyExtraction: {
		google: "google",
		openrouter: "openrouter",
	},
};

export function normalizeProviderName(providerName: string): string {
	const normalizedName = providerName.toLowerCase().trim();
	return providerAliasToCanonicalName.get(normalizedName) ?? normalizedName;
}

export function getStaticProviderInfo(
	providerName: string,
): ProviderInfo | null {
	const canonicalName = normalizeProviderName(providerName);
	return providerInfoByCanonicalName.get(canonicalName) ?? null;
}

export function providerSupportsFeature(
	providerName: string,
	featureName: ProviderFeatureName,
): boolean {
	return getStaticProviderInfo(providerName)?.featureSupport[featureName] ?? false;
}

export function providerUsesApiFamily(
	providerName: string,
	apiFamily: ProviderApiFamily,
): boolean {
	return getStaticProviderInfo(providerName)?.apiFamily === apiFamily;
}

export function resolveProviderFeatureImplementation(
	providerName: string,
	featureName: ProviderFeatureName,
): ProviderFeatureImplementation | null {
	const canonicalName = normalizeProviderName(providerName);
	return providerFeatureImplementations[featureName][canonicalName] ?? null;
}
