import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import type { CheckboxGroupOption, ModalCheckboxGroupField } from "@/types/discord/modal";
import { tomoriConfigSchema, type ErrorContext, type UserRow } from "@/types/db/schema";
import { getCachedTomoriState, invalidateTomoriStateCache } from "@/utils/cache/tomoriStateCache";
import { sql } from "@/utils/db/client";
import { promptWithRawModal, replyInfoEmbed, safeSelectOptionText } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { localizer } from "@/utils/text/localizer";

const MODAL_CUSTOM_ID = "server_privatechannel_remove_modal";
const CHANNEL_CHECKBOX_ID_PREFIX = "server_privatechannel_checkbox_group";
const MAX_OPTIONS_PER_GROUP = 10;
const MAX_GROUPS_PER_MODAL = 5;
const MAX_ENTRIES_PER_MODAL = MAX_OPTIONS_PER_GROUP * MAX_GROUPS_PER_MODAL;

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand.setName("remove").setDescription(localizer("en-US", "commands.server.privatechannel.remove.description"));

export async function execute(
  _client: Client,
  interaction: ChatInputCommandInteraction,
  userData: UserRow,
  locale: string,
): Promise<void> {
  if (!interaction.guild || !interaction.guildId) {
    await replyInfoEmbed(interaction, userData.language_pref, {
      titleKey: "general.errors.guild_only_title",
      descriptionKey: "general.errors.guild_only_description",
      color: ColorCode.ERROR,
    });
    return;
  }

  try {
    const tomoriState = await getCachedTomoriState(interaction.guildId);
    if (!tomoriState) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.tomori_not_setup_title",
        descriptionKey: "general.errors.tomori_not_setup_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    const currentChannels = tomoriState.config.private_channel_ids ?? [];
    if (currentChannels.length === 0) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.server.privatechannel.remove.no_channels_title",
        descriptionKey: "commands.server.privatechannel.remove.no_channels_description",
        color: ColorCode.WARN,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const groupCount = Math.ceil(currentChannels.length / MAX_OPTIONS_PER_GROUP);
    if (groupCount > MAX_GROUPS_PER_MODAL) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.server.privatechannel.remove.too_many_entries_title",
        descriptionKey: "commands.server.privatechannel.remove.too_many_entries_description",
        descriptionVars: {
          channel_count: currentChannels.length.toString(),
          max_entries: MAX_ENTRIES_PER_MODAL.toString(),
          max_groups: MAX_GROUPS_PER_MODAL.toString(),
        },
        color: ColorCode.WARN,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const checkboxGroups = await buildCheckboxGroups(interaction, currentChannels, locale);
    const modalResult = await promptWithRawModal(
      interaction,
      locale,
      {
        modalCustomId: MODAL_CUSTOM_ID,
        modalTitleKey: "commands.server.privatechannel.remove.modal_title",
        components: checkboxGroups,
      },
      MessageFlags.Ephemeral,
    );

    if (modalResult.outcome !== "submit") {
      log.info(`Private channel removal modal ${modalResult.outcome} for user ${userData.user_id}`);
      return;
    }

    if (!modalResult.interaction) {
      log.error("Private channel removal modal unexpectedly missing interaction");
      return;
    }

    const checkedChannelIds = collectCheckedChannelIds(modalResult.multiValues, groupCount);
    const channelsToRemove = currentChannels.filter((channelId) => !checkedChannelIds.has(channelId));

    if (channelsToRemove.length === 0) {
      await replyInfoEmbed(modalResult.interaction, locale, {
        titleKey: "commands.server.privatechannel.remove.no_changes_title",
        descriptionKey: "commands.server.privatechannel.remove.no_changes_description",
        color: ColorCode.INFO,
      });
      return;
    }

    const updatedChannels = currentChannels.filter((channelId) => checkedChannelIds.has(channelId));
    const [updatedRow] = await sql`
      UPDATE tomori_configs
      SET private_channel_ids = ${formatTextArrayLiteral(updatedChannels)}::text[]
      WHERE server_id = ${tomoriState.server_id}
      RETURNING *
    `;

    if (!updatedRow) {
      const context: ErrorContext = {
        tomoriId: tomoriState.tomori_id,
        serverId: tomoriState.server_id,
        errorType: "CommandExecutionError",
        metadata: {
          command: "server privatechannel remove",
          guildId: interaction.guildId,
          removedChannelIds: channelsToRemove,
        },
      };
      await log.error("Failed to update private_channel_ids config", new Error("Database update failed"), context);
      await replyInfoEmbed(modalResult.interaction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    const validatedConfig = tomoriConfigSchema.safeParse(updatedRow);
    if (!validatedConfig.success) {
      const context: ErrorContext = {
        tomoriId: tomoriState.tomori_id,
        serverId: tomoriState.server_id,
        errorType: "SchemaValidationError",
        metadata: {
          command: "server privatechannel remove",
          validationErrors: validatedConfig.error.flatten(),
        },
      };
      await log.error("Failed to validate updated config after privatechannel remove", validatedConfig.error, context);
      await replyInfoEmbed(modalResult.interaction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    invalidateTomoriStateCache(interaction.guildId);

    const removedChannels = await formatChannelMentions(interaction, channelsToRemove, locale);
    const remainingCount = validatedConfig.data.private_channel_ids.length;

    await replyInfoEmbed(modalResult.interaction, locale, {
      titleKey: "commands.server.privatechannel.remove.success_title",
      descriptionKey: "commands.server.privatechannel.remove.success_description",
      descriptionVars: {
        removed_count: channelsToRemove.length.toString(),
        removed_channels: removedChannels,
        remaining_count: remainingCount.toString(),
      },
      color: ColorCode.WARN,
    });

    log.info(`Private channels removed in guild ${interaction.guildId}: ${channelsToRemove.join(", ")}`);
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      errorType: "CommandExecutionError",
      metadata: {
        command: "server privatechannel remove",
        guildId: interaction.guildId,
      },
    };
    await log.error("Error in /server private-channels remove command", error, context);

    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
    });
  }
}

async function buildCheckboxGroups(
  interaction: ChatInputCommandInteraction,
  channelIds: string[],
  locale: string,
): Promise<ModalCheckboxGroupField[]> {
  const checkboxGroups: ModalCheckboxGroupField[] = [];

  for (let i = 0; i < channelIds.length; i += MAX_OPTIONS_PER_GROUP) {
    const chunk = channelIds.slice(i, i + MAX_OPTIONS_PER_GROUP);
    const groupIndex = Math.floor(i / MAX_OPTIONS_PER_GROUP);
    const options: CheckboxGroupOption[] = [];

    for (const channelId of chunk) {
      const channel = await interaction.guild?.channels.fetch(channelId).catch(() => null);
      const channelLabel = channel?.name
        ? `#${channel.name}`
        : `${localizer(locale, "general.unknown")} (${channelId.slice(0, 10)}...)`;

      options.push({
        label: safeSelectOptionText(channelLabel),
        value: channelId,
        default: true,
      });
    }

    checkboxGroups.push({
      kind: "checkboxGroup",
      customId: `${CHANNEL_CHECKBOX_ID_PREFIX}_${groupIndex}`,
      labelKey:
        groupIndex === 0
          ? "commands.server.privatechannel.remove.checkbox_label"
          : "commands.server.privatechannel.remove.checkbox_label_continued",
      descriptionKey: groupIndex === 0 ? "commands.server.privatechannel.remove.checkbox_description" : undefined,
      minValues: 0,
      required: false,
      options,
    });
  }

  return checkboxGroups;
}

function collectCheckedChannelIds(multiValues: Record<string, string[]> | undefined, groupCount: number): Set<string> {
  const checkedChannelIds = new Set<string>();

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
    const groupValues = multiValues?.[`${CHANNEL_CHECKBOX_ID_PREFIX}_${groupIndex}`] ?? [];
    for (const channelId of groupValues) {
      checkedChannelIds.add(channelId);
    }
  }

  return checkedChannelIds;
}

function formatTextArrayLiteral(items: string[]): string {
  return `{${items.map((item) => `"${item.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;
}

async function formatChannelMentions(
  interaction: ChatInputCommandInteraction,
  channelIds: string[],
  locale: string,
): Promise<string> {
  const channelMentions: string[] = [];

  for (const channelId of channelIds) {
    const channel = await interaction.guild?.channels.fetch(channelId).catch(() => null);
    channelMentions.push(channel ? `<#${channel.id}>` : `${localizer(locale, "general.unknown")} (${channelId})`);
  }

  return channelMentions.join(", ");
}
