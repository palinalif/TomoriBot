/**
 * Reveal Message Metadata Tool
 *
 * Appends a compact recent-message metadata ledger into the current turn so the
 * model can inspect `ref_N` handles, timestamps, and actionability flags before
 * using message-management tools.
 */

import { BaseTool, type ToolContext, type ToolParameterSchema, type ToolResult } from "@/types/tool/interfaces";
import { log } from "@/utils/misc/logger";

export class RevealMessageMetadataTool extends BaseTool {
  name = "reveal_message_metadata";
  description =
    "Reveal recent message metadata for the current channel, including `ref_N` handles, timestamps, pin state, and whether each message can currently be pinned, edited, or deleted. Use this when you need to identify a specific recent message for `manage_message`, or when the user asks about message timing/metadata. Usually unnecessary if replying already exposed a `ref_N` for the target message.";
  category = "utility" as const;

  parameters: ToolParameterSchema = {
    type: "object",
    properties: {},
    required: [],
  };

  isAvailableFor(_provider: string): boolean {
    return true;
  }

  isAvailableForContext(provider: string, context?: ToolContext): boolean {
    if (!this.isAvailableFor(provider)) {
      return false;
    }

    if (context?.streamContext?.disableMessageMetadataContext) {
      log.info("RevealMessageMetadataTool: Disabled for this turn — metadata already revealed");
      return false;
    }

    return true;
  }

  async execute(_args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (context.streamContext?.disableMessageMetadataContext) {
      log.info("[RevealMessageMetadataTool] Execution blocked — metadata already revealed this turn");
      return {
        success: false,
        message: "Recent message metadata was already revealed earlier in this turn.",
      };
    }

    log.info("[RevealMessageMetadataTool] Signalling context rewrite with recent message metadata");

    return {
      success: true,
      message: "Revealing recent message metadata for this turn...",
      data: {
        type: "context_restart_with_message_metadata",
      },
    };
  }
}
