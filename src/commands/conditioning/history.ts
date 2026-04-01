import type { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags } from "discord.js";
import type { UserRow } from "@/types/db/schema";
import type { ConditioningGroup } from "@/utils/db/conditioningDb";
import { localizer } from "@/utils/text/localizer";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { ColorCode } from "@/utils/misc/logger";
import { loadConditioningGroupsForPersona } from "@/utils/db/conditioningDb";
import { selectConditioningPersona, getConditioningTypeOption } from "@/utils/conditioning/conditioningCommandHelper";

const MAX_HISTORY_GROUPS_DISPLAY = 8;

function formatHistoryLine(group: ConditioningGroup, locale: string): string {
  const actionLabel = localizer(locale, `commands.${group.conditioningType}.${group.actionKey}.history_label`);
  const updatedTimestamp = Math.floor(group.updatedAt.getTime() / 1000);
  const users = group.userDiscIds.map((userDiscId) => `<@${userDiscId}>`).join(", ");

  if (group.reasonText.length > 0) {
    return localizer(locale, "commands.conditioning.history.entry_with_reason", {
      action_label: actionLabel,
      count: group.totalCount.toString(),
      users,
      updated_at: updatedTimestamp.toString(),
      reason: group.reasonText,
    });
  }

  return localizer(locale, "commands.conditioning.history.entry_without_reason", {
    action_label: actionLabel,
    count: group.totalCount.toString(),
    users,
    updated_at: updatedTimestamp.toString(),
  });
}

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("history")
    .setDescription(localizer("en-US", "commands.conditioning.history.description"))
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription(localizer("en-US", "commands.conditioning.history.type_description"))
        .setRequired(true)
        .addChoices(
          { name: localizer("en-US", "commands.conditioning.history.type_choice_reward"), value: "reward" },
          { name: localizer("en-US", "commands.conditioning.history.type_choice_punish"), value: "punish" },
        ),
    );

export async function execute(
  _client: Client,
  interaction: ChatInputCommandInteraction,
  _userData: UserRow,
  locale: string,
): Promise<void> {
  const selection = await selectConditioningPersona(interaction, locale);
  if (!selection) return;

  const conditioningType = getConditioningTypeOption(interaction);
  const groups = await loadConditioningGroupsForPersona(
    selection.persona.server_id,
    selection.persona.persona_lineage_id ?? 0,
    conditioningType,
  );

  if (groups.length === 0) {
    await replyInfoEmbed(selection.interaction, locale, {
      titleKey: "commands.conditioning.history.none_title",
      descriptionKey: "commands.conditioning.history.none_description",
      descriptionVars: {
        persona_name: selection.persona.tomori_nickname,
        type_label: localizer(locale, `commands.conditioning.shared.type_${conditioningType}`),
      },
      color: ColorCode.WARN,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const visibleGroups = groups.slice(0, MAX_HISTORY_GROUPS_DISPLAY);
  const statusLabel =
    conditioningType === "reward"
      ? selection.persona.reward_conditioning_enabled
        ? localizer(locale, "commands.conditioning.history.status_enabled")
        : localizer(locale, "commands.conditioning.history.status_disabled")
      : selection.persona.punish_conditioning_enabled
        ? localizer(locale, "commands.conditioning.history.status_enabled")
        : localizer(locale, "commands.conditioning.history.status_disabled");

  const description = localizer(locale, "commands.conditioning.history.summary", {
    persona_name: selection.persona.tomori_nickname,
    status_label: statusLabel,
    entry_count: groups.length.toString(),
    entries: visibleGroups.map((group) => formatHistoryLine(group, locale)).join("\n"),
    more_entries:
      groups.length > visibleGroups.length
        ? `\n\n${localizer(locale, "commands.conditioning.history.more_entries", {
            count: (groups.length - visibleGroups.length).toString(),
          })}`
        : "",
  });

  await replyInfoEmbed(selection.interaction, locale, {
    titleKey: `commands.conditioning.history.title_${conditioningType}`,
    description: description,
    color: ColorCode.INFO,
    flags: MessageFlags.Ephemeral,
  });
}
