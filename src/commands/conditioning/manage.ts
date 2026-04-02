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
import { hasManageGuildPermission, selectConditioningPersona } from "@/utils/conditioning/conditioningCommandHelper";
import type { ConditioningType } from "@/types/db/schema";

const CHECKBOX_GROUP_PREFIX = "conditioning_manage_group";
const MAX_OPTIONS_PER_GROUP = 10;
const MAX_GROUPS_PER_MODAL = 5;
const GROUPS_PER_PAGE = MAX_OPTIONS_PER_GROUP * (MAX_GROUPS_PER_MODAL - 1);
const PAGE_SELECT_TIMEOUT_MS = 300_000;
const PAGE_BUTTON_LIMIT = 24;
const CONDITIONING_TYPE_ORDER: ConditioningType[] = ["reward", "punish"];

function getManageTypeMarker(locale: string, conditioningType: ConditioningType): string {
  return localizer(locale, `commands.conditioning.manage.marker_${conditioningType}`);
}

function truncateOptionLabel(value: string): string {
  return value.length > 100 ? `${value.slice(0, 97)}...` : value;
}

function buildCheckboxGroups(groups: ConditioningGroup[], locale: string): ModalCheckboxGroupField[] {
  const checkboxGroups: ModalCheckboxGroupField[] = [];
  const indexedGroups = groups.map((group, index) => ({ group, index }));

  for (const conditioningType of CONDITIONING_TYPE_ORDER) {
    const typedGroups = indexedGroups.filter(({ group }) => group.conditioningType === conditioningType);
    for (let i = 0; i < typedGroups.length; i += MAX_OPTIONS_PER_GROUP) {
      const chunk = typedGroups.slice(i, i + MAX_OPTIONS_PER_GROUP);
      const groupIndex = Math.floor(i / MAX_OPTIONS_PER_GROUP);
      const typeMarker = getManageTypeMarker(locale, conditioningType);
      const options: CheckboxGroupOption[] = chunk.map(({ group, index }) => {
        const actionLabel = localizer(locale, `commands.${group.conditioningType}.${group.actionKey}.history_label`);
        const description =
          group.reasonText.length > 0
            ? localizer(locale, "commands.conditioning.manage.option_reason_description", {
                type_marker: typeMarker,
                count: group.totalCount.toString(),
                reason: group.reasonText,
              })
            : localizer(locale, "commands.conditioning.manage.option_stored_only_description", {
                type_marker: typeMarker,
                count: group.totalCount.toString(),
              });

        return {
          label: truncateOptionLabel(actionLabel),
          value: index.toString(),
          description: truncateOptionLabel(description),
          default: true,
        };
      });

      checkboxGroups.push({
        kind: "checkboxGroup",
        customId: `${CHECKBOX_GROUP_PREFIX}_${conditioningType}_${groupIndex}`,
        labelKey:
          groupIndex === 0
            ? `commands.conditioning.manage.${conditioningType}_checkbox_label`
            : `commands.conditioning.manage.${conditioningType}_checkbox_label_continued`,
        descriptionKey:
          groupIndex === 0 ? `commands.conditioning.manage.${conditioningType}_checkbox_description` : undefined,
        minValues: 0,
        required: false,
        options,
      });
    }
  }

  return checkboxGroups;
}

function collectSelectedIndexes(multiValues: Record<string, string[]> | undefined): Set<number> {
  const indexes = new Set<number>();
  for (const values of Object.values(multiValues ?? {})) {
    for (const value of values) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        indexes.add(parsed);
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
        .setCustomId(`conditioning_manage_page_${page}`)
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
  subcommand.setName("manage").setDescription(localizer("en-US", "commands.conditioning.manage.description"));

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

  const groups = await loadConditioningGroupsForPersona(
    selection.persona.server_id,
    selection.persona.persona_lineage_id ?? 0,
  );

  if (groups.length === 0) {
    await replyInfoEmbed(selection.interaction, locale, {
      titleKey: "commands.conditioning.manage.none_title",
      descriptionKey: "commands.conditioning.manage.none_description",
      descriptionVars: {
        persona_name: selection.persona.tomori_nickname,
      },
      color: ColorCode.WARN,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const totalPages = Math.ceil(groups.length / GROUPS_PER_PAGE);
  if (totalPages > PAGE_BUTTON_LIMIT) {
    await replyInfoEmbed(selection.interaction, locale, {
      titleKey: "commands.conditioning.manage.too_many_title",
      descriptionKey: "commands.conditioning.manage.too_many_description",
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
      titleKey: "commands.conditioning.manage.select_page_title",
      descriptionKey: "commands.conditioning.manage.select_page_description",
      descriptionVars: {
        persona_name: selection.persona.tomori_nickname,
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
          buttonInteraction.customId.startsWith("conditioning_manage_page_"),
        time: PAGE_SELECT_TIMEOUT_MS,
      })) as ButtonInteraction;
    } catch {
      log.info("[Conditioning Manage] Page selection timed out");
      return;
    }

    const selectedPage = Number.parseInt(pageButtonInteraction.customId.replace("conditioning_manage_page_", ""), 10);
    const startIndex = (selectedPage - 1) * GROUPS_PER_PAGE;
    pageGroups = groups.slice(startIndex, startIndex + GROUPS_PER_PAGE);
    modalSource = pageButtonInteraction;
  }

  const checkboxGroups = buildCheckboxGroups(pageGroups, locale);
  const modalResult = await promptWithRawModal(
    modalSource,
    locale,
    {
      modalCustomId: `conditioning_manage_${interaction.id}`,
      modalTitleKey: "commands.conditioning.manage.modal_title",
      components: checkboxGroups,
    },
    MessageFlags.Ephemeral,
  );

  if (modalResult.outcome !== "submit" || !modalResult.interaction) {
    return;
  }

  const selectedIndexes = collectSelectedIndexes(modalResult.multiValues);
  const groupsToDelete = pageGroups.filter((_group, index) => !selectedIndexes.has(index));

  if (groupsToDelete.length === 0) {
    await replyInfoEmbed(modalResult.interaction, locale, {
      titleKey: "commands.conditioning.manage.no_changes_title",
      descriptionKey: "commands.conditioning.manage.no_changes_description",
      color: ColorCode.INFO,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const deletedRows = await deleteConditioningGroupsForPersona(
    selection.persona.server_id,
    selection.persona.persona_lineage_id ?? 0,
    groupsToDelete.map((group) => ({
      conditioningType: group.conditioningType,
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

  const removedRewardGroups = groupsToDelete.filter((group) => group.conditioningType === "reward").length;
  const removedPunishGroups = groupsToDelete.filter((group) => group.conditioningType === "punish").length;

  await replyInfoEmbed(modalResult.interaction, locale, {
    titleKey: "commands.conditioning.manage.success_title",
    descriptionKey: "commands.conditioning.manage.success_description",
    descriptionVars: {
      persona_name: selection.persona.tomori_nickname,
      reward_groups: removedRewardGroups.toString(),
      punish_groups: removedPunishGroups.toString(),
      deleted_rows: deletedRows.toString(),
    },
    color: ColorCode.SUCCESS,
    flags: MessageFlags.Ephemeral,
  });
}
