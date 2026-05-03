export const PERSONAL_DELIBERATE_TOOL_MODES = ["off", "follow", "on"] as const;
export type PersonalDeliberateToolMode = (typeof PERSONAL_DELIBERATE_TOOL_MODES)[number];

const URL_PATTERN = /\bhttps?:\/\/\S+/i;

const TOOL_INTENT_PATTERNS: RegExp[] = [
  /\b(search|web\s*search|look\s+up|browse|google|fetch|read\s+this\s+(?:url|link|page)|open\s+this\s+(?:url|link|page))\b/i,
  /\b(latest|today|current|currently|up[- ]?to[- ]?date|news|recent)\b/i,
  /\b(remember|save\s+(?:this|that|it)|forget|delete\s+(?:that\s+)?memory|update\s+(?:your\s+)?memory|store\s+(?:this|that|it))\b/i,
  /\b(look\s+at|analy[sz]e|inspect|describe|what(?:'s| is)\s+in)\b.*\b(image|picture|photo|avatar|profile\s+picture|gif|video|youtube|attachment)\b/i,
  /\b(image|picture|photo|avatar|profile\s+picture|gif|video|youtube|attachment)\b.*\b(look\s+at|analy[sz]e|inspect|describe|summari[sz]e)\b/i,
  /\b(generate|create|make|draw)\b.*\b(image|picture|photo|video|voice|audio|speech|thread)\b/i,
  /\b(react|reply\s+to|delete|pin|unpin|edit|manage)\b.*\b(message|post|that|it)\b/i,
  /\b(create|make|start|open)\b.*\b(thread)\b/i,
];

const URL_TOOL_INTENT_PATTERNS: RegExp[] = [
  /\b(summari[sz]e|read|inspect|analy[sz]e|fetch|open|browse|check|look\s+at)\b/i,
  /\b(what(?:'s| is)\s+(?:this|on|in)|tell\s+me\s+about\s+this)\b/i,
];

export function hasDeliberateToolIntent(content: string | null | undefined): boolean {
  const text = content?.trim();
  if (!text) return false;

  if (TOOL_INTENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  return URL_PATTERN.test(text) && URL_TOOL_INTENT_PATTERNS.some((pattern) => pattern.test(text));
}

export function resolveDeliberateToolMode(
  serverDeliberateToolMode: boolean | null | undefined,
  personalMode: PersonalDeliberateToolMode | null | undefined,
): boolean {
  if (personalMode === "on") return true;
  if (personalMode === "off") return false;
  return Boolean(serverDeliberateToolMode);
}
