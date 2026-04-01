import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import type { UserRow } from "@/types/db/schema";
import type { ConditioningGroup } from "@/utils/db/conditioningDb";
import type { CheckboxGroupOption, ModalCheckboxGroupField } from "@/types/discord/modal";
import { createStandardEmbed } from "@/utils/discord/embedHelper";
import { promptWithRawModal, replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { ColorCode, log } from "@/utils/misc/logger";
import { localizer } from "@/utils/text/localizer";
import { deleteConditioningGroupsForPersona, loadConditioningGroupsForPersona } from "@/utils/db/conditioningDb";
import {
  getConditioningTypeOption,
  hasManageGuildPermission,
  selectConditioningPersona,
} from "@/utils/conditioning/conditioningCommandHelper";

const CHECKBOX_GROUP_PREFIX = "conditioning_clear_group";
const MAX_OPTIONS_PER_GROUP = 10;
const MAX_GROUPS_PER_MODAL = 5;
const GROUPS_PER_PAGE = MAX_OPTIONS_PER_GROUP * MAX_GROUPS_PER_MODAL;
const PAGE_SELECT_TIMEOUT_MS = 300_000;
const PAGE_BUTTON_LIMIT = 24;

function truncateOptionLabel(value: string): string {
  return value.length > 100 ? `${value.slice(0, 97)}...` : value;
}

function buildCheckboxGroups(groups: ConditioningGroup[], locale: string): ModalCheckboxGroupField[] {
  const checkboxGroups: ModalCheckboxGroupField[] = [];

  for (let i = 0; i < groups.length; i += MAX_OPTIONS_PER_GROUP) {
    const chunk = groups.slice(i, i + MAX_OPTIONS_PER_GROUP);
    const groupIndex = Math.floor(i / MAX_OPTIONS_PER_GROUP);
    const options: CheckboxGroupOption[] = chunk.map((group, index) => {
      const actionLabel = localizer(locale, `commands.${group.conditioningType}.${group.actionKey}.history_label`);
      const description =
        group.reasonText.length > 0
          ? localizer(locale, "commands.conditioning.clear.option_reason_description", {
              count: group.totalCount.toString(),
              reason: group.reasonText,
            })
          : localizer(locale, "commands.conditioning.clear.option_stored_only_description", {
              count: group.totalCount.toString(),
            });

      return {
        label: truncateOptionLabel(`${actionLabel} ×${group.totalCount}`),
        value: index.toString(),
        description: truncateOptionLabel(description),
        default: true,
      };
    });

    checkboxGroups.push({
      kind: "checkboxGroup",
      customId: `${CHECKBOX_GROUP_PREFIX}_${groupIndex}`,
      labelKey:
        groupIndex === 0
          ? "commands.conditioning.clear.checkbox_label"
          : "commands.conditioning.clear.checkbox_label_continued",
      descriptionKey: groupIndex === 0 ? "commands.conditioning.clear.checkbox_description" : undefined,
      minValues: 0,
      required: false,
      options,
    });
  }

  return checkboxGroups;
}

function collectSelectedIndexes(multiValues: Record<string, string[]> | undefined, groupCount: number): Set<number> {
  const indexes = new Set<number>();
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
    const values = multiValues?.[`${CHECKBOX_GROUP_PREFIX}_${groupIndex}`] ?? [];
    for (const value of values) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        indexes.add(parsed + groupIndex * MAX_OPTIONS_PER_GROUP);
      }
    }
  }
  return indexes;
}

function buildPageActionRows(totalPages: number, totalGroups: number): ActionRowBuilder<ButtonBuilder>[] {
  const pageButtons: ButtonBuilder[] = [];
  const pageLimit = Math.min(totalPages, PAGE_BUTTON_LIMIT);

  for (let page = 1; page <= pageLimit; page++) {
    const start = (page - 1) * GROUPS_PER_PAGE + 1;
    const end = Math.min(page * GROUPS_PER_PAGE, totalGroups);
    pageButtons.push(
      new ButtonBuilder()
        .setCustomId(`conditioning_clear_page_${page}`)
        .setLabel(`${start}-${end}`)
        .setStyle(ButtonStyle.Primary),
    );
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < pageButtons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...pageButtons.slice(i, i + 5)));
  }

  return rows;
}

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("clear")
    .setDescription(localizer("en-US", "commands.conditioning.clear.description"))
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription(localizer("en-US", "commands.conditioning.clear.type_description"))
        .setRequired(true)
        .addChoices(
          { name: localizer("en-US", "commands.conditioning.clear.type_choice_reward"), value: "reward" },
          { name: localizer("en-US", "commands.conditioning.clear.type_choice_punish"), value: "punish" },
        ),
    );

export async function execute(
  _client: Client,
  interaction: ChatInputCommandInteraction,
  _userData: UserRow,
  locale: string,
): Promise<void> {
  if (!hasManageGuildPermission(interaction)) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.permission_denied_title",
      descriptionKey: "general.errors.permission_denied_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

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
      titleKey: "commands.conditioning.clear.none_title",
      descriptionKey: "commands.conditioning.clear.none_description",
      descriptionVars: {
        persona_name: selection.persona.tomori_nickname,
        type_label: localizer(locale, `commands.conditioning.shared.type_${conditioningType}`),
      },
      color: ColorCode.WARN,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const totalPages = Math.ceil(groups.length / GROUPS_PER_PAGE);
  if (totalPages > PAGE_BUTTON_LIMIT) {
    await replyInfoEmbed(selection.interaction, locale, {
      titleKey: "commands.conditioning.clear.too_many_title",
      descriptionKey: "commands.conditioning.clear.too_many_description",
      descriptionVars: {
        total_entries: groups.length.toString(),
        total_pages: totalPages.toString(),
        max_pages: PAGE_BUTTON_LIMIT.toString(),
      },
      color: ColorCode.WARN,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let modalSource: ChatInputCommandInteraction | ButtonInteraction = selection.interaction;
  let pageGroups = groups;

  if (totalPages > 1) {
    const pageSelectEmbed = createStandardEmbed(locale, {
      titleKey: "commands.conditioning.clear.select_page_title",
      descriptionKey: "commands.conditioning.clear.select_page_description",
      descriptionVars: {
        persona_name: selection.persona.tomori_nickname,
        type_label: localizer(locale, `commands.conditioning.shared.type_${conditioningType}`),
        total_entries: groups.length.toString(),
        total_pages: totalPages.toString(),
      },
      color: ColorCode.INFO,
    });

    const pageMessage = await selection.interaction.reply({
      embeds: [pageSelectEmbed],
      components: buildPageActionRows(totalPages, groups.length),
      flags: MessageFlags.Ephemeral,
    });

    let pageButtonInteraction: ButtonInteraction;
    try {
      pageButtonInteraction = (await pageMessage.awaitMessageComponent({
        filter: (buttonInteraction) =>
          buttonInteraction.user.id === interaction.user.id &&
          buttonInteraction.customId.startsWith("conditioning_clear_page_"),
        time: PAGE_SELECT_TIMEOUT_MS,
      })) as ButtonInteraction;
    } catch {
      log.info("[Conditioning Clear] Page selection timed out");
      return;
    }

    const selectedPage = Number.parseInt(pageButtonInteraction.customId.replace("conditioning_clear_page_", ""), 10);
    const startIndex = (selectedPage - 1) * GROUPS_PER_PAGE;
    pageGroups = groups.slice(startIndex, startIndex + GROUPS_PER_PAGE);
    modalSource = pageButtonInteraction;
  }

  const checkboxGroups = buildCheckboxGroups(pageGroups, locale);
  const modalResult = await promptWithRawModal(
    modalSource,
    locale,
    {
      modalCustomId: `conditioning_clear_${interaction.id}`,
      modalTitleKey: "commands.conditioning.clear.modal_title",
      components: checkboxGroups,
    },
    MessageFlags.Ephemeral,
  );

  if (modalResult.outcome !== "submit" || !modalResult.interaction) {
    return;
  }

  const selectedIndexes = collectSelectedIndexes(modalResult.multiValues, checkboxGroups.length);
  const groupsToDelete = pageGroups.filter((_group, index) => !selectedIndexes.has(index));

  if (groupsToDelete.length === 0) {
    await replyInfoEmbed(modalResult.interaction, locale, {
      titleKey: "commands.conditioning.clear.no_changes_title",
      descriptionKey: "commands.conditioning.clear.no_changes_description",
      color: ColorCode.INFO,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const deletedRows = await deleteConditioningGroupsForPersona(
    selection.persona.server_id,
    selection.persona.persona_lineage_id ?? 0,
    conditioningType,
    groupsToDelete.map((group) => ({
      actionKey: group.actionKey,
      reasonNormalized: group.reasonNormalized,
    })),
  );

  if (deletedRows === 0) {
    await replyInfoEmbed(modalResult.interaction, locale, {
      titleKey: "general.errors.update_failed_title",
      descriptionKey: "general.errors.update_failed_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await replyInfoEmbed(modalResult.interaction, locale, {
    titleKey: "commands.conditioning.clear.success_title",
    descriptionKey: "commands.conditioning.clear.success_description",
    descriptionVars: {
      persona_name: selection.persona.tomori_nickname,
      type_label: localizer(locale, `commands.conditioning.shared.type_${conditioningType}`),
      removed_groups: groupsToDelete.length.toString(),
      deleted_rows: deletedRows.toString(),
    },
    color: ColorCode.SUCCESS,
    flags: MessageFlags.Ephemeral,
  });
}
