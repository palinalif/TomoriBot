export const PERSONAL_DELIBERATE_TOOL_MODES = ["off", "follow", "on"] as const;
export type PersonalDeliberateToolMode = (typeof PERSONAL_DELIBERATE_TOOL_MODES)[number];

const URL_PATTERN = /\bhttps?:\/\/\S+/i;

const RELATIVE_TIME_PATTERN =
  /\b(?:in|for|after)\s+(?:about\s+|around\s+|like\s+|another\s+|a\s+)?\d+\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\b/i;
const SCHEDULE_TIME_PATTERN =
  /\b(?:tomorrow|tonight|today|later|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|from\s+now)\b/i;
const REMINDER_DIRECT_REQUEST_PATTERN =
  /\b(?:remind|ping|notify)\s+(?:me|us|them|him|her|[A-Za-z0-9_@{}.-]+)\b/i;
const REMINDER_CREATE_PATTERN =
  /\b(?:set|create|make|start|schedule|add)\b.{0,80}\b(?:reminder|timer|alarm|task|scheduled\s+task|task\s+reminder)\b/i;
const REMINDER_ANAPHORA_PATTERN =
  /\b(?:set|create|make|start|schedule|add|try|do)\b.{0,80}\b(?:one|another|it|that|the\s+same)\b.{0,80}\b(?:from\s+now|for\s+(?:a\s+)?(?:longer\s+)?time|seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\b/i;

function hasReminderCreationIntent(text: string): boolean {
  return (
    REMINDER_DIRECT_REQUEST_PATTERN.test(text) ||
    REMINDER_CREATE_PATTERN.test(text) ||
    (REMINDER_ANAPHORA_PATTERN.test(text) && (RELATIVE_TIME_PATTERN.test(text) || SCHEDULE_TIME_PATTERN.test(text)))
  );
}

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

const CROSS_CHANNEL_INTENT_PATTERNS: RegExp[] = [
  /\bcross[-_\s]?channel\b.{0,80}\b(?:message|send|post|peek|check|boomerang|tool|function)\b/i,
  /\b(?:send|post|say|tell|ask|message|write)\b.{0,120}\b(?:in|to|into|over\s+in)\s+(?:<#\d+>|#[^\s]+|`[^`]+`)/iu,
  /\b(?:send|post|say|tell|ask|message|write)\b.{0,120}\b(?:another|other|different|specific|target)\s+(?:channel|thread)\b/i,
  /\b(?:go|hop|peek|check|read|look)\b.{0,100}\b(?:another|other|different|specific|target|that|the)\s+(?:channel|thread)\b/i,
  /\b(?:peek|check|read|look)\b.{0,100}(?:<#\d+>|#[^\s]+|`[^`]+`)\b/iu,
  /\b(?:boomerang|report\s+back)\b.{0,120}\b(?:channel|thread|<#\d+>|#[^\s]+|`[^`]+`)\b/iu,
];

const WEB_TOOL_NAMES = ["web-search", "fetch"];
const MEMORY_TOOL_NAMES = ["create_long_term_memory", "update_long_term_memory"];
const MEDIA_ANALYSIS_TOOL_NAMES = [
  "analyze_image",
  "increase_media_context",
  "peek_profile_picture",
  "process_gif",
  "process_youtube_video",
  "read_file",
];
const GENERATION_TOOL_NAMES = ["generate_image", "generate_image_nai", "generate_video", "generate_voice_message"];
const MESSAGE_ACTION_TOOL_NAMES = [
  "interact_with_recent_message",
  "manage_message",
  "reveal_message_metadata",
];
const CAPABILITY_TOOL_NAMES = ["review_capabilities"];

function uniqueToolNames(toolNames: string[]): string[] {
  return Array.from(new Set(toolNames));
}

export function hasDeliberateToolIntent(content: string | null | undefined): boolean {
  const text = content?.trim();
  if (!text) return false;

  if (hasReminderCreationIntent(text)) {
    return true;
  }

  if (CROSS_CHANNEL_INTENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  if (TOOL_INTENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  return URL_PATTERN.test(text) && URL_TOOL_INTENT_PATTERNS.some((pattern) => pattern.test(text));
}

export function getDeliberateToolAllowedNames(content: string | null | undefined): string[] {
  const text = content?.trim();
  if (!text) return [];

  const allowedToolNames: string[] = [];

  if (hasReminderCreationIntent(text)) {
    allowedToolNames.push("create_task");
  }

  if (
    /\b(search|web\s*search|look\s+up|browse|google|fetch|latest|today|current|currently|up[- ]?to[- ]?date|news|recent)\b/i.test(
      text,
    ) ||
    (URL_PATTERN.test(text) && URL_TOOL_INTENT_PATTERNS.some((pattern) => pattern.test(text)))
  ) {
    allowedToolNames.push(...WEB_TOOL_NAMES);
  }

  if (
    /\b(remember|save\s+(?:this|that|it)|forget|delete\s+(?:that\s+)?memory|update\s+(?:your\s+)?memory|store\s+(?:this|that|it))\b/i.test(
      text,
    )
  ) {
    allowedToolNames.push(...MEMORY_TOOL_NAMES);
  }

  if (
    /\b(look\s+at|analy[sz]e|inspect|describe|what(?:'s| is)\s+in)\b.*\b(image|picture|photo|avatar|profile\s+picture|gif|video|youtube|attachment|file|document|pdf)\b/i.test(
      text,
    ) ||
    /\b(image|picture|photo|avatar|profile\s+picture|gif|video|youtube|attachment|file|document|pdf)\b.*\b(look\s+at|analy[sz]e|inspect|describe|summari[sz]e|read)\b/i.test(
      text,
    )
  ) {
    allowedToolNames.push(...MEDIA_ANALYSIS_TOOL_NAMES);
  }

  if (/\b(generate|create|make|draw)\b.*\b(image|picture|photo|video|voice|audio|speech)\b/i.test(text)) {
    allowedToolNames.push(...GENERATION_TOOL_NAMES);
  }

  if (/\b(react|reply\s+to|delete|pin|unpin|edit|manage)\b.*\b(message|post|that|it)\b/i.test(text)) {
    allowedToolNames.push(...MESSAGE_ACTION_TOOL_NAMES);
  }

  if (CROSS_CHANNEL_INTENT_PATTERNS.some((pattern) => pattern.test(text))) {
    allowedToolNames.push("cross_channel_message");
  }

  if (/\b(create|make|start|open)\b.*\b(thread)\b/i.test(text)) {
    allowedToolNames.push("create_thread");
  }

  if (/\b(capabilities|what\s+can\s+you\s+do|available\s+(?:tools|commands|settings)|review\s+(?:your\s+)?(?:capabilities|settings))\b/i.test(text)) {
    allowedToolNames.push(...CAPABILITY_TOOL_NAMES);
  }

  return uniqueToolNames(allowedToolNames);
}

export function filterDeliberateToolNames(toolNames: string[], allowedToolNames: string[] | null | undefined): string[] {
  if (!allowedToolNames?.length) return toolNames;
  const allowedSet = new Set(allowedToolNames);
  return toolNames.filter((toolName) => allowedSet.has(toolName));
}

export function isToolAllowedByDeliberateMode(
  toolName: string,
  allowedToolNames: string[] | null | undefined,
): boolean {
  return !allowedToolNames?.length || allowedToolNames.includes(toolName);
}

export function resolveDeliberateToolMode(
  serverDeliberateToolMode: boolean | null | undefined,
  personalMode: PersonalDeliberateToolMode | null | undefined,
): boolean {
  if (personalMode === "on") return true;
  if (personalMode === "off") return false;
  return Boolean(serverDeliberateToolMode);
}
