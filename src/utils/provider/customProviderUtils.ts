import type { CustomEndpointCapability } from "@/types/db/schema";

const CUSTOM_PROVIDER_PREFIX = "custom:";
const SERVER_PROVIDER_SEGMENT = "s";
const USER_PROVIDER_SEGMENT = "u";
const CUSTOM_LABEL_PATTERN = /^[a-z0-9_-]{1,40}$/;

export interface ParsedCustomProvider {
  raw: string;
  label: string;
  scope: "server" | "personal";
  ownerId: number | null;
}

export function isCustomProvider(provider: string): boolean {
  return provider.trim().toLowerCase().startsWith(CUSTOM_PROVIDER_PREFIX);
}

export function normalizeCustomEndpointLabel(label: string): string {
  return label.trim().toLowerCase();
}

export function isValidCustomEndpointLabel(label: string): boolean {
  return CUSTOM_LABEL_PATTERN.test(normalizeCustomEndpointLabel(label));
}

export function buildServerCustomProviderName(serverId: number, label: string): string {
  return `${CUSTOM_PROVIDER_PREFIX}${SERVER_PROVIDER_SEGMENT}${serverId}:${normalizeCustomEndpointLabel(label)}`;
}

export function buildUserCustomProviderName(userId: number, label: string): string {
  return `${CUSTOM_PROVIDER_PREFIX}${USER_PROVIDER_SEGMENT}${userId}:${normalizeCustomEndpointLabel(label)}`;
}

export function parseCustomProvider(provider: string): ParsedCustomProvider | null {
  const normalized = provider.trim().toLowerCase();
  if (!isCustomProvider(normalized)) {
    return null;
  }

  const payload = normalized.slice(CUSTOM_PROVIDER_PREFIX.length);
  const [scopeWithId, ...labelParts] = payload.split(":");
  const label = labelParts.join(":");

  if (!scopeWithId || !label) {
    return null;
  }

  const scopePrefix = scopeWithId.charAt(0);
  const ownerId = Number.parseInt(scopeWithId.slice(1), 10);
  if (!Number.isInteger(ownerId) || ownerId <= 0) {
    return null;
  }

  if (scopePrefix === SERVER_PROVIDER_SEGMENT) {
    return {
      raw: normalized,
      label,
      scope: "server",
      ownerId,
    };
  }

  if (scopePrefix === USER_PROVIDER_SEGMENT) {
    return {
      raw: normalized,
      label,
      scope: "personal",
      ownerId,
    };
  }

  return null;
}

export function getCustomProviderLabel(provider: string): string | null {
  return parseCustomProvider(provider)?.label ?? null;
}

export function getCustomProviderDisplayName(provider: string): string {
  const label = getCustomProviderLabel(provider);
  return label ? `Custom:${label}` : "Custom";
}

export function buildSyntheticCustomModelCodename(provider: string, capability: CustomEndpointCapability): string {
  const slug = provider
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug}-${capability}`;
}
