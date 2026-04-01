import type { ConditioningType } from "@/types/db/schema";

export const REWARD_ACTION_KEYS = ["headpat", "hug", "kiss", "tickle"] as const;
export const PUNISH_ACTION_KEYS = ["spank", "pinch", "bite", "squeeze"] as const;

export type RewardActionKey = (typeof REWARD_ACTION_KEYS)[number];
export type PunishActionKey = (typeof PUNISH_ACTION_KEYS)[number];
export type ConditioningActionKey = RewardActionKey | PunishActionKey;

export const CONDITIONING_ACTION_KEYS_BY_TYPE = {
  reward: REWARD_ACTION_KEYS,
  punish: PUNISH_ACTION_KEYS,
} as const satisfies Record<ConditioningType, readonly ConditioningActionKey[]>;

const CONTEXT_PAST_PARTICIPLES: Record<ConditioningType, Record<ConditioningActionKey, string>> = {
  reward: {
    headpat: "headpatted",
    hug: "hugged",
    kiss: "kissed",
    tickle: "tickled",
    spank: "spanked",
    pinch: "pinched",
    bite: "bitten",
    squeeze: "squeezed",
  },
  punish: {
    headpat: "headpatted",
    hug: "hugged",
    kiss: "kissed",
    tickle: "tickled",
    spank: "spanked",
    pinch: "pinched",
    bite: "bitten",
    squeeze: "squeezed",
  },
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const CONDITIONING_REASON_MAX_LENGTH = parsePositiveInt(process.env.CONDITIONING_REASON_MAX_LENGTH, 250);
export const CONDITIONING_CONTEXT_MAX_GROUPS_PER_TYPE = parsePositiveInt(
  process.env.CONDITIONING_CONTEXT_MAX_GROUPS_PER_TYPE,
  10,
);

export function getConditioningActionKeysForType(type: ConditioningType): readonly ConditioningActionKey[] {
  return CONDITIONING_ACTION_KEYS_BY_TYPE[type];
}

export function isConditioningActionKey(type: ConditioningType, value: string): value is ConditioningActionKey {
  return getConditioningActionKeysForType(type).includes(value as ConditioningActionKey);
}

export function normalizeConditioningReason(reason: string | null | undefined): string {
  return (reason ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeConditioningReasonKey(reason: string | null | undefined): string {
  return normalizeConditioningReason(reason).toLowerCase();
}

export function getConditioningContextPastParticiple(
  type: ConditioningType,
  actionKey: ConditioningActionKey | string,
): string {
  const actionMap = CONTEXT_PAST_PARTICIPLES[type];
  return actionMap[actionKey as ConditioningActionKey] ?? actionKey;
}
