import type {
  ProviderApiFamily,
  ProviderFeatureSupport,
  ProviderInfo,
  SupportedParam,
} from "@/types/provider/interfaces";
import { customProviderInfo } from "@/providers/custom/providerInfo";
import { deepseekProviderInfo } from "@/providers/deepseek/providerInfo";
import { zaiProviderInfo } from "@/providers/zai/providerInfo";
import { zaicodingProviderInfo } from "@/providers/zaicoding/providerInfo";
import { googleProviderInfo } from "@/providers/google/providerInfo";
import { novelaiProviderInfo } from "@/providers/novelai/providerInfo";
import { nvidiaProviderInfo } from "@/providers/nvidia/providerInfo";
import { openrouterProviderInfo } from "@/providers/openrouter/providerInfo";
import { vertexProviderInfo } from "@/providers/vertex/providerInfo";
import { anthropicProviderInfo } from "@/providers/anthropic/providerInfo";

const providerInfos: readonly ProviderInfo[] = [
  googleProviderInfo,
  openrouterProviderInfo,
  novelaiProviderInfo,
  nvidiaProviderInfo,
  customProviderInfo,
  deepseekProviderInfo,
  zaiProviderInfo,
  zaicodingProviderInfo,
  vertexProviderInfo,
  anthropicProviderInfo,
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
  | "custom"
  | "deepseek"
  | "nvidia"
  | "zai"
  | "vertex"
  | "anthropic";

const providerFeatureImplementations: Partial<
  Record<ProviderFeatureName, Partial<Record<string, ProviderFeatureImplementation>>>
> = {
  nativeImageGeneration: {
    google: "google",
    openrouter: "openrouter",
    zai: "zai",
    nvidia: "nvidia",
  },
  nativeVideoGeneration: {
    google: "google",
    openrouter: "openrouter",
    zai: "zai",
  },
  liveTokenCounting: {
    google: "google",
    openrouter: "openrouter",
    deepseek: "deepseek",
    zai: "zai",
    zaicoding: "zai",
    anthropic: "anthropic",
  },
};

export function normalizeProviderName(providerName: string): string {
  const normalizedName = providerName.toLowerCase().trim();
  return providerAliasToCanonicalName.get(normalizedName) ?? normalizedName;
}

export function getStaticProviderInfo(providerName: string): ProviderInfo | null {
  const canonicalName = normalizeProviderName(providerName);
  return providerInfoByCanonicalName.get(canonicalName) ?? null;
}

export function getProviderDisplayName(providerName: string): string {
  return getStaticProviderInfo(providerName)?.displayName ?? providerName;
}

export function providerSupportsFeature(providerName: string, featureName: ProviderFeatureName): boolean {
  return getStaticProviderInfo(providerName)?.featureSupport[featureName] ?? false;
}

export function providerUsesApiFamily(providerName: string, apiFamily: ProviderApiFamily): boolean {
  return getStaticProviderInfo(providerName)?.apiFamily === apiFamily;
}

export function resolveProviderFeatureImplementation(
  providerName: string,
  featureName: ProviderFeatureName,
): ProviderFeatureImplementation | null {
  const canonicalName = normalizeProviderName(providerName);
  return providerFeatureImplementations[featureName]?.[canonicalName] ?? null;
}

/**
 * Returns a locale-formatted list of provider display names
 * that support the given generation parameter.
 */
export function getProviderDisplayNamesForParam(param: SupportedParam, locale: string): string {
  const separator = locale === "ja" ? "\u3001" : ", ";
  const names = providerInfos.filter((info) => info.supportedParams.includes(param)).map((info) => info.displayName);
  return names.join(separator);
}
