import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import { sql } from "@/utils/db/client";
import { getCachedTomoriState, invalidateTomoriStateCache } from "@/utils/cache/tomoriStateCache";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { ColorCode, log } from "@/utils/misc/logger";
import { localizer } from "@/utils/text/localizer";
import { tomoriConfigSchema, type ErrorContext, type UserRow } from "@/types/db/schema";
import {
  DELIBERATE_TOOL_TRIGGER_TARGETS,
  getDeliberateToolTriggerTargetLabel,
  normalizeDeliberateToolTrigger,
  type DeliberateToolTriggerMap,
} from "@/utils/tools/deliberateToolMode";

const ACTIONS = ["add", "remove", "list"] as const;
const MAX_TRIGGERS_PER_TARGET = 16;
const MAX_TRIGGER_LENGTH = 40;

function formatTriggerList(triggerMap: DeliberateToolTriggerMap, targetValue?: string | null): string {
  const entries = Object.entries(triggerMap).filter(([target]) => !targetValue || target === targetValue);
  if (entries.length === 0) {
    return "No custom deliberate tool triggers are configured.";
  }

  return entries
    .map(([target, triggers]) => {
      const label = getDeliberateToolTriggerTargetLabel(target);
      const triggerText = triggers.map((trigger) => `\`${trigger}\``).join(", ");
      return `**${label}**: ${triggerText}`;
    })
    .join("\n");
}

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("deliberate-tool-trigger")
    .setDescription(localizer("en-US", "commands.server.deliberate-tool-trigger.description"))
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription(localizer("en-US", "commands.server.deliberate-tool-trigger.action_description"))
        .setRequired(true)
        .addChoices(
          ...ACTIONS.map((action) => ({
            name: localizer("en-US", `commands.server.deliberate-tool-trigger.action_${action}`),
            value: action,
          })),
        ),
    )
    .addStringOption((option) =>
      option
        .setName("tool")
        .setDescription(localizer("en-US", "commands.server.deliberate-tool-trigger.tool_description"))
        .addChoices(...DELIBERATE_TOOL_TRIGGER_TARGETS.map((target) => ({ name: target.label, value: target.value }))),
    )
    .addStringOption((option) =>
      option
        .setName("trigger")
        .setDescription(localizer("en-US", "commands.server.deliberate-tool-trigger.trigger_description"))
        .setMaxLength(MAX_TRIGGER_LENGTH),
    );

export async function execute(
  _client: Client,
  interaction: ChatInputCommandInteraction,
  userData: UserRow,
  locale: string,
): Promise<void> {
  const guildId = interaction.guild?.id ?? "";
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const tomoriState = await getCachedTomoriState(guildId);
    if (!tomoriState) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.tomori_not_setup_title",
        descriptionKey: "general.errors.tomori_not_setup_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    const action = interaction.options.getString("action", true) as (typeof ACTIONS)[number];
    const target = interaction.options.getString("tool");
    const trigger = normalizeDeliberateToolTrigger(interaction.options.getString("trigger"));

    const triggerMap: DeliberateToolTriggerMap = { ...(tomoriState.config.deliberate_tool_triggers ?? {}) };

    if (action === "list") {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.server.deliberate-tool-trigger.list_title",
        description: formatTriggerList(triggerMap, target),
        color: ColorCode.INFO,
      });
      return;
    }

    if (!target || !DELIBERATE_TOOL_TRIGGER_TARGETS.some((candidate) => candidate.value === target)) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.server.deliberate-tool-trigger.invalid_title",
        descriptionKey: "commands.server.deliberate-tool-trigger.missing_tool_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    if (!trigger) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.server.deliberate-tool-trigger.invalid_title",
        descriptionKey: "commands.server.deliberate-tool-trigger.missing_trigger_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    const currentTriggers = triggerMap[target] ?? [];
    if (action === "add") {
      if (currentTriggers.includes(trigger)) {
        await replyInfoEmbed(interaction, locale, {
          titleKey: "commands.server.deliberate-tool-trigger.duplicate_title",
          descriptionKey: "commands.server.deliberate-tool-trigger.duplicate_description",
          descriptionVars: { trigger, tool: getDeliberateToolTriggerTargetLabel(target) },
          color: ColorCode.WARN,
        });
        return;
      }

      if (currentTriggers.length >= MAX_TRIGGERS_PER_TARGET) {
        await replyInfoEmbed(interaction, locale, {
          titleKey: "commands.server.deliberate-tool-trigger.too_many_title",
          descriptionKey: "commands.server.deliberate-tool-trigger.too_many_description",
          descriptionVars: { max: MAX_TRIGGERS_PER_TARGET, tool: getDeliberateToolTriggerTargetLabel(target) },
          color: ColorCode.ERROR,
        });
        return;
      }

      triggerMap[target] = [...currentTriggers, trigger].sort();
    } else {
      if (!currentTriggers.includes(trigger)) {
        await replyInfoEmbed(interaction, locale, {
          titleKey: "commands.server.deliberate-tool-trigger.not_found_title",
          descriptionKey: "commands.server.deliberate-tool-trigger.not_found_description",
          descriptionVars: { trigger, tool: getDeliberateToolTriggerTargetLabel(target) },
          color: ColorCode.WARN,
        });
        return;
      }

      const nextTriggers = currentTriggers.filter((candidate) => candidate !== trigger);
      if (nextTriggers.length > 0) {
        triggerMap[target] = nextTriggers;
      } else {
        delete triggerMap[target];
      }
    }

    const [updatedRow] = await sql`
      UPDATE tomori_configs
      SET deliberate_tool_triggers = ${JSON.stringify(triggerMap)}::jsonb
      WHERE server_id = ${tomoriState.server_id}
      RETURNING *
    `;

    const validatedConfig = tomoriConfigSchema.safeParse(updatedRow);
    if (!updatedRow || !validatedConfig.success) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    invalidateTomoriStateCache(guildId);

    await replyInfoEmbed(interaction, locale, {
      titleKey:
        action === "add"
          ? "commands.server.deliberate-tool-trigger.added_title"
          : "commands.server.deliberate-tool-trigger.removed_title",
      descriptionKey:
        action === "add"
          ? "commands.server.deliberate-tool-trigger.added_description"
          : "commands.server.deliberate-tool-trigger.removed_description",
      descriptionVars: { trigger, tool: getDeliberateToolTriggerTargetLabel(target) },
      color: ColorCode.SUCCESS,
    });
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      serverId: (await getCachedTomoriState(guildId))?.server_id,
      errorType: "CommandExecutionError",
      metadata: {
        command: "server deliberate-tool-trigger",
        options: interaction.options?.data,
      },
    };
    await log.error("Error in /server deliberate-tool-trigger command", error as Error, context);

    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
    });
  }
}
