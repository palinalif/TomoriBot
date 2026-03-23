import type {
  ChatInputCommandInteraction,
  Client,
  SlashCommandSubcommandBuilder,
} from "discord.js";
import { getCachedTomoriState } from "@/utils/cache/tomoriStateCache";
import {
  getAllWhitelistChannels,
  removeChannelWhitelist,
} from "@/utils/db/channelWhitelist";
import { invalidateWhitelistCache } from "@/utils/cache/channelWhitelistCache";
import { localizer } from "@/utils/text/localizer";
import { log, ColorCode } from "@/utils/misc/logger";
import {
  replyInfoEmbed,
  promptWithRawModal,
} from "@/utils/discord/interactionHelper";
import type { UserRow, ErrorContext } from "@/types/db/schema";
import type {
  CheckboxGroupOption,
  ModalCheckboxGroupField,
} from "@/types/discord/modal";
import { CooldownType } from "@/types/db/schema";

/**
 * Modal custom ID for channel whitelist removal
 */
const MODAL_CUSTOM_ID = "server_whitelist_remove_modal";
const CHANNEL_CHECKBOX_ID_PREFIX = "channel_checkbox_group";
const MAX_OPTIONS_PER_GROUP = 10;
const MAX_GROUPS_PER_MODAL = 5;
const MAX_CHANNELS_PER_MODAL = MAX_OPTIONS_PER_GROUP * MAX_GROUPS_PER_MODAL;

/**
 * Configure the /server whitelist remove subcommand
 * Allows server managers to remove channels from the whitelist
 */
export const configureSubcommand = (
  subcommand: SlashCommandSubcommandBuilder,
) =>
  subcommand
    .setName("remove")
    .setDescription(
      localizer("en-US", "commands.server.whitelist.remove.description"),
    );

/**
 * Execute the /server whitelist remove command
 * Shows a modal with all whitelisted channels as checkboxes (all checked by default)
 * Unchecked channels will be removed from the whitelist
 */
export async function execute(
  _client: Client,
  interaction: ChatInputCommandInteraction,
  user: UserRow,
  locale: string,
): Promise<void> {
  const errorContext: ErrorContext = {
    userId: user.user_id,
    serverId: null,
    tomoriId: null,
  };

  try {
    // 1. Validate guild context
    if (!interaction.guild || !interaction.guildId) {
      await replyInfoEmbed(interaction, locale, {
        color: ColorCode.ERROR,
        titleKey: "general.errors.guild_only_title",
        descriptionKey: "general.errors.guild_only_description",
      });
      return;
    }

    // 2. Get Tomori state for server
    const tomoriState = await getCachedTomoriState(interaction.guildId);
    if (!tomoriState) {
      await replyInfoEmbed(interaction, locale, {
        color: ColorCode.ERROR,
        titleKey: "general.errors.tomori_not_setup_title",
        descriptionKey: "general.errors.tomori_not_setup_description",
      });
      return;
    }

    errorContext.serverId = tomoriState.server_id;
    errorContext.tomoriId = tomoriState.tomori_id;

    // 3. Get all whitelisted channels for this server
    const whitelistChannels = await getAllWhitelistChannels(
      tomoriState.server_id,
    );

    // 4. Check if there are any whitelisted channels
    if (whitelistChannels.length === 0) {
      await replyInfoEmbed(interaction, locale, {
        color: ColorCode.WARN,
        titleKey: "commands.server.whitelist.remove.no_channels_title",
        descriptionKey:
          "commands.server.whitelist.remove.no_channels_description",
      });
      return;
    }

    // 5. Discord checkbox groups allow at most 10 options each and 5 groups per modal
    if (whitelistChannels.length > MAX_CHANNELS_PER_MODAL) {
      await replyInfoEmbed(interaction, locale, {
        color: ColorCode.WARN,
        titleKey: "commands.server.whitelist.remove.too_many_channels_title",
        descriptionKey:
          "commands.server.whitelist.remove.too_many_channels_description",
        descriptionVars: {
          max_channels: MAX_CHANNELS_PER_MODAL.toString(),
        },
      });
      return;
    }

    // 6. Build checkbox groups by chunking whitelisted channels into groups of 10
    const checkboxGroups: ModalCheckboxGroupField[] = [];

    for (let i = 0; i < whitelistChannels.length; i += MAX_OPTIONS_PER_GROUP) {
      const chunk = whitelistChannels.slice(i, i + MAX_OPTIONS_PER_GROUP);
      const groupIndex = Math.floor(i / MAX_OPTIONS_PER_GROUP);
      const options: CheckboxGroupOption[] = [];

      for (const entry of chunk) {
        try {
          const channel = await interaction.guild.channels.fetch(
            entry.channel_disc_id,
          );
          const description = getWhitelistChannelSummary(entry, locale);

          options.push({
            label: channel?.name ?? entry.channel_disc_id,
            value: entry.channel_disc_id,
            description: description.substring(0, 100),
            default: true,
          });
        } catch (error) {
          log.warn("Failed to fetch channel for whitelist remove", error);

          const description = getWhitelistChannelSummary(entry, locale);

          options.push({
            label: `Unknown (${entry.channel_disc_id.substring(0, 10)}...)`,
            value: entry.channel_disc_id,
            description: description.substring(0, 100),
            default: true,
          });
        }
      }

      checkboxGroups.push({
        kind: "checkboxGroup" as const,
        customId: `${CHANNEL_CHECKBOX_ID_PREFIX}_${groupIndex}`,
        labelKey:
          groupIndex === 0
            ? "commands.server.whitelist.remove.checkbox_label"
            : "commands.server.whitelist.remove.checkbox_label_continued",
        descriptionKey:
          groupIndex === 0
            ? "commands.server.whitelist.remove.checkbox_description"
            : undefined,
        minValues: 0,
        required: false,
        options,
      });
    }

    // 7. Show the modal with checkbox groups for channel removal
    const modalResult = await promptWithRawModal(interaction, locale, {
      modalCustomId: MODAL_CUSTOM_ID,
      modalTitleKey: "commands.server.whitelist.remove.modal_title",
      components: checkboxGroups,
    });

    // 8. Handle modal outcome
    if (modalResult.outcome !== "submit") {
      log.info(
        `Whitelist channel removal modal ${modalResult.outcome} for user ${user.user_id}`,
      );
      return;
    }

    // 9. Extract checked channel IDs from all checkbox groups in the modal
    const modalSubmitInteraction = modalResult.interaction;
    const checkedChannelIds = new Set<string>();

    for (let groupIndex = 0; groupIndex < checkboxGroups.length; groupIndex++) {
      const groupValues =
        modalResult.multiValues?.[
          `${CHANNEL_CHECKBOX_ID_PREFIX}_${groupIndex}`
        ] ?? [];
      for (const channelId of groupValues) {
        checkedChannelIds.add(channelId);
      }
    }

    // Safety checks
    if (!modalSubmitInteraction) {
      log.error("Modal result unexpectedly missing interaction");
      return;
    }

    // 10. Find channels to remove (those NOT checked in the modal)
    const channelsToRemove: string[] = [];
    for (const entry of whitelistChannels) {
      if (!checkedChannelIds.has(entry.channel_disc_id)) {
        channelsToRemove.push(entry.channel_disc_id);
      }
    }

    // 11. If no channels selected for removal, inform user
    if (channelsToRemove.length === 0) {
      await replyInfoEmbed(modalSubmitInteraction, locale, {
        color: ColorCode.INFO,
        titleKey: "commands.server.whitelist.remove.no_removals_title",
        descriptionKey: "commands.server.whitelist.remove.no_removals_description",
      });
      return;
    }

    // 12. Remove all unchecked channels from the whitelist
    const results = await Promise.all(
      channelsToRemove.map((channelId) =>
        removeChannelWhitelist(tomoriState.server_id, channelId),
      ),
    );

    const failedRemovals = results.filter((r) => !r).length;
    if (failedRemovals > 0) {
      await replyInfoEmbed(modalSubmitInteraction, locale, {
        color: ColorCode.ERROR,
        titleKey: "general.errors.unknown_error_title",
        descriptionKey: "general.errors.unknown_error_description",
      });
      return;
    }

    // 13. Invalidate whitelist cache for this server
    invalidateWhitelistCache(interaction.guildId);

    // 14. Get channel names for success message
    const removedChannelNames: string[] = [];
    for (const channelId of channelsToRemove) {
      try {
        const channel = await interaction.guild.channels.fetch(channelId);
        removedChannelNames.push(channel?.name ?? channelId);
      } catch {
        // Channel might be deleted, use ID
        removedChannelNames.push(channelId);
      }
    }

    // 15. Send success message
    const descriptionVars: Record<string, string> = {};
    if (channelsToRemove.length === 1) {
      descriptionVars.channel_name = removedChannelNames[0];
    } else {
      descriptionVars.channels = formatRemovedChannelNames(removedChannelNames);
      descriptionVars.removed_count = channelsToRemove.length.toString();
    }

    await replyInfoEmbed(
      modalSubmitInteraction,
      locale,
      {
        color: ColorCode.SUCCESS,
        titleKey: "commands.server.whitelist.remove.success_title",
        descriptionKey: `commands.server.whitelist.remove.success_${
          channelsToRemove.length === 1 ? "singular" : "plural"
        }_description`,
        descriptionVars,
      },
      undefined,
    );

    log.info(
      `Channels ${channelsToRemove.join(", ")} removed from whitelist in server ${interaction.guildId}`,
    );
  } catch (error) {
    log.error(
      "Error executing /server whitelist remove command",
      error,
      errorContext,
    );

    // If interaction hasn't been replied to yet, send error
    if (!interaction.replied && !interaction.deferred) {
      await replyInfoEmbed(interaction, locale, {
        color: ColorCode.ERROR,
        titleKey: "general.errors.unknown_error_title",
        descriptionKey: "general.errors.unknown_error_description",
      });
    }
  }
}

/**
 * Get localized summary text for a whitelist channel's cooldown behavior.
 * @param entry - Whitelist entry to summarize
 * @param locale - The locale to use for localization
 * @returns Localized summary text
 */
function getWhitelistChannelSummary(
  entry: { cooldown_type: CooldownType | null; cooldown_length: number | null },
  locale: string,
): string {
  if (entry.cooldown_type === null || entry.cooldown_length === null) {
    return localizer(locale, "commands.choices.inherit_global");
  }

  const cooldownTypeName = getCooldownTypeName(entry.cooldown_type, locale);
  return entry.cooldown_type === CooldownType.OFF
    ? cooldownTypeName
    : `${cooldownTypeName}, ${entry.cooldown_length}s`;
}

/**
 * Get localized name for a cooldown type
 * @param cooldownType - The cooldown type
 * @param locale - The locale to use for localization
 * @returns Localized cooldown type name
 */
function getCooldownTypeName(cooldownType: CooldownType, locale: string): string {
  const key = getCooldownTypeKey(cooldownType);
  return localizer(locale, `commands.config.cooldown.type.choice_${key}`);
}

/**
 * Get the locale key suffix for a cooldown type
 * @param cooldownType - The cooldown type
 * @returns The locale key suffix (e.g., "off", "per_user", "per_channel")
 */
function getCooldownTypeKey(cooldownType: CooldownType): string {
  switch (cooldownType) {
    case CooldownType.OFF:
      return "off";
    case CooldownType.PER_USER:
      return "per_user";
    case CooldownType.PER_CHANNEL:
      return "per_channel";
    case CooldownType.SERVER_WIDE:
      return "server_wide";
    case CooldownType.STRICT_SERVER_WIDE:
      return "strict_server_wide";
    default:
      return "off";
  }
}

function formatRemovedChannelNames(channelNames: string[]): string {
  const maxVisibleNames = 10;
  const visibleNames = channelNames.slice(0, maxVisibleNames);
  const suffix = channelNames.length > maxVisibleNames ? ", ..." : "";
  return `${visibleNames.join(", ")}${suffix}`;
}
