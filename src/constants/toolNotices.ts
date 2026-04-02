export const TOOL_NOTICE_KEYS = [
  "web_search",
  "image_search",
  "video_search",
  "news_search",
  "web_fetch",
  "document_reading",
  "image_generation",
  "image_editing",
  "image_analysis",
  "profile_picture_analysis",
  "gif_processing",
  "youtube_processing",
  "mcp_tool_call",
] as const;

export type ToolNoticeKey = (typeof TOOL_NOTICE_KEYS)[number];

export function isToolNoticeKey(value: string): value is ToolNoticeKey {
  return TOOL_NOTICE_KEYS.includes(value as ToolNoticeKey);
}

export interface ToolNoticeDefinition {
  key: ToolNoticeKey;
  labelKey: string;
  descriptionKey: string;
}

export const TOOL_NOTICE_DEFINITIONS: ToolNoticeDefinition[] = [
  {
    key: "web_search",
    labelKey: "commands.config.toolnotices.visibility.notice_web_search_label",
    descriptionKey: "commands.config.toolnotices.visibility.notice_web_search_description",
  },
  {
    key: "image_search",
    labelKey: "commands.config.toolnotices.visibility.notice_image_search_label",
    descriptionKey: "commands.config.toolnotices.visibility.notice_image_search_description",
  },
  {
    key: "video_search",
    labelKey: "commands.config.toolnotices.visibility.notice_video_search_label",
    descriptionKey: "commands.config.toolnotices.visibility.notice_video_search_description",
  },
  {
    key: "news_search",
    labelKey: "commands.config.toolnotices.visibility.notice_news_search_label",
    descriptionKey: "commands.config.toolnotices.visibility.notice_news_search_description",
  },
  {
    key: "web_fetch",
    labelKey: "commands.config.toolnotices.visibility.notice_web_fetch_label",
    descriptionKey: "commands.config.toolnotices.visibility.notice_web_fetch_description",
  },
  {
    key: "document_reading",
    labelKey: "commands.config.toolnotices.visibility.notice_document_reading_label",
    descriptionKey: "commands.config.toolnotices.visibility.notice_document_reading_description",
  },
  {
    key: "image_generation",
    labelKey: "commands.config.toolnotices.visibility.notice_image_generation_label",
    descriptionKey: "commands.config.toolnotices.visibility.notice_image_generation_description",
  },
  {
    key: "image_editing",
    labelKey: "commands.config.toolnotices.visibility.notice_image_editing_label",
    descriptionKey: "commands.config.toolnotices.visibility.notice_image_editing_description",
  },
  {
    key: "image_analysis",
    labelKey: "commands.config.toolnotices.visibility.notice_image_analysis_label",
    descriptionKey: "commands.config.toolnotices.visibility.notice_image_analysis_description",
  },
  {
    key: "profile_picture_analysis",
    labelKey: "commands.config.toolnotices.visibility.notice_profile_picture_analysis_label",
    descriptionKey: "commands.config.toolnotices.visibility.notice_profile_picture_analysis_description",
  },
  {
    key: "gif_processing",
    labelKey: "commands.config.toolnotices.visibility.notice_gif_processing_label",
    descriptionKey: "commands.config.toolnotices.visibility.notice_gif_processing_description",
  },
  {
    key: "youtube_processing",
    labelKey: "commands.config.toolnotices.visibility.notice_youtube_processing_label",
    descriptionKey: "commands.config.toolnotices.visibility.notice_youtube_processing_description",
  },
  {
    key: "mcp_tool_call",
    labelKey: "commands.config.toolnotices.visibility.notice_mcp_tool_call_label",
    descriptionKey: "commands.config.toolnotices.visibility.notice_mcp_tool_call_description",
  },
];
