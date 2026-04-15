import {
  ChannelType,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import { getCachedAllPersonas, getCachedTomoriState } from "@/utils/cache/tomoriStateCache";
import { invalidateWhitelistCache } from "@/utils/cache/channelWhitelistCache";
import { getChannelWhitelistPersonas, replaceChannelPersonaWhitelist } from "@/utils/db/personaWhitelist";
import { promptWithRawModal, replyInfoEmbed, safeSelectOptionText } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { localizer } from "@/utils/text/localizer";
import type { ErrorContext, TomoriState, UserRow } from "@/types/db/schema";
import type { CheckboxGroupOption, ModalCheckboxGroupField } from "@/types/discord/modal";

const MODAL_CUSTOM_ID = "server_whitelist_persona_modal";
const PERSONA_CHECKBOX_ID_PREFIX = "persona_whitelist_checkbox_group";
const MAX_OPTIONS_PER_GROUP = 10;
const MAX_GROUPS_PER_MODAL = 5;
const MAX_ENTRIES_PER_MODAL = MAX_OPTIONS_PER_GROUP * MAX_GROUPS_PER_MODAL;

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("persona")
    .setDescription(localizer("en-US", "commands.server.whitelist.persona.description"))
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription(localizer("en-US", "commands.server.whitelist.persona.channel_description"))
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    );

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
    if (!interaction.guild || !interaction.guildId) {
      await replyInfoEmbed(interaction, locale, {
        color: ColorCode.ERROR,
        titleKey: "general.errors.guild_only_title",
        descriptionKey: "general.errors.guild_only_description",
      });
      return;
    }

    const channel = interaction.options.getChannel("channel", true);
    if (channel.type !== ChannelType.GuildText) {
      await replyInfoEmbed(interaction, locale, {
        color: ColorCode.ERROR,
        titleKey: "commands.server.whitelist.persona.invalid_channel_title",
        descriptionKey: "commands.server.whitelist.persona.invalid_channel_description",
      });
      return;
    }

    const [tomoriState, allPersonasRaw] = await Promise.all([
      getCachedTomoriState(interaction.guildId),
      getCachedAllPersonas(interaction.guildId),
    ]);
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

    const allPersonas = allPersonasRaw.filter(
      (persona): persona is TomoriState & { tomori_id: number } => typeof persona.tomori_id === "number",
    );
    if (allPersonas.length === 0) {
      await replyInfoEmbed(interaction, locale, {
        color: ColorCode.WARN,
        titleKey: "commands.server.whitelist.persona.no_personas_title",
        descriptionKey: "commands.server.whitelist.persona.no_personas_description",
      });
      return;
    }

    const groupCount = Math.ceil(allPersonas.length / MAX_OPTIONS_PER_GROUP);
    if (groupCount > MAX_GROUPS_PER_MODAL) {
      await replyInfoEmbed(interaction, locale, {
        color: ColorCode.WARN,
        titleKey: "commands.server.whitelist.persona.too_many_personas_title",
        descriptionKey: "commands.server.whitelist.persona.too_many_personas_description",
        descriptionVars: {
          persona_count: allPersonas.length.toString(),
          max_entries: MAX_ENTRIES_PER_MODAL.toString(),
          max_groups: MAX_GROUPS_PER_MODAL.toString(),
        },
      });
      return;
    }

    const currentEntries = await getChannelWhitelistPersonas(tomoriState.server_id, channel.id);
    const currentWhitelistIds = new Set(currentEntries.map((entry) => entry.tomori_id));
    const hasActiveWhitelist = currentWhitelistIds.size > 0;
    const channelName = channel.name ?? channel.id;
    const defaultAllowedIds = hasActiveWhitelist
      ? currentWhitelistIds
      : new Set(allPersonas.map((persona) => persona.tomori_id));

    const checkboxGroups = buildPersonaCheckboxGroups(allPersonas, defaultAllowedIds, locale);
    const modalResult = await promptWithRawModal(
      interaction,
      locale,
      {
        modalCustomId: MODAL_CUSTOM_ID,
        modalTitleKey: "commands.server.whitelist.persona.modal_title",
        components: checkboxGroups,
      },
      MessageFlags.Ephemeral,
    );

    if (modalResult.outcome !== "submit" || !modalResult.interaction) {
      log.info(`Persona whitelist modal ${modalResult.outcome} for user ${user.user_id}`);
      return;
    }

    const selectedPersonaIds = collectCheckedPersonaIds(modalResult.multiValues, groupCount);
    if (selectedPersonaIds.size === 0) {
      await replyInfoEmbed(modalResult.interaction, locale, {
        color: ColorCode.WARN,
        titleKey: "commands.server.whitelist.persona.no_personas_selected_title",
        descriptionKey: "commands.server.whitelist.persona.no_personas_selected_description",
      });
      return;
    }

    const normalizedSelectedIds =
      selectedPersonaIds.size === allPersonas.length ? [] : Array.from(selectedPersonaIds).sort((a, b) => a - b);
    const currentIds = [...currentWhitelistIds].sort((a, b) => a - b);

    if (areNumberArraysEqual(normalizedSelectedIds, currentIds)) {
      await replyInfoEmbed(modalResult.interaction, locale, {
        color: ColorCode.INFO,
        titleKey: "commands.server.whitelist.persona.already_set_title",
        descriptionKey: "commands.server.whitelist.persona.already_set_description",
        descriptionVars: {
          channel_name: channelName,
        },
      });
      return;
    }

    await replaceChannelPersonaWhitelist(tomoriState.server_id, channel.id, normalizedSelectedIds);
    invalidateWhitelistCache(interaction.guildId);

    if (normalizedSelectedIds.length === 0) {
      await replyInfoEmbed(modalResult.interaction, locale, {
        color: ColorCode.SUCCESS,
        titleKey: "commands.server.whitelist.persona.success_clear_title",
        descriptionKey: "commands.server.whitelist.persona.success_clear_description",
        descriptionVars: {
          channel_name: channelName,
        },
      });

      log.info(`Cleared persona whitelist for channel ${channel.id} in server ${interaction.guildId}`);
      return;
    }

    const selectedNames = allPersonas
      .filter((persona) => selectedPersonaIds.has(persona.tomori_id))
      .map((persona) => `**${persona.tomori_nickname}**`);

    await replyInfoEmbed(modalResult.interaction, locale, {
      color: ColorCode.SUCCESS,
      titleKey: "commands.server.whitelist.persona.success_title",
      descriptionKey: "commands.server.whitelist.persona.success_description",
      descriptionVars: {
        channel_name: channelName,
        persona_names: formatSelectedPersonaNames(selectedNames),
      },
    });

    log.info(
      `Updated persona whitelist for channel ${channel.id} in server ${interaction.guildId}: [${normalizedSelectedIds.join(", ")}]`,
    );
  } catch (error) {
    log.error("Error executing /server whitelist persona command", error, errorContext);

    if (!interaction.replied && !interaction.deferred) {
      await replyInfoEmbed(interaction, locale, {
        color: ColorCode.ERROR,
        titleKey: "general.errors.unknown_error_title",
        descriptionKey: "general.errors.unknown_error_description",
      });
    }
  }
}

function buildPersonaCheckboxGroups(
  personas: Array<TomoriState & { tomori_id: number }>,
  selectedPersonaIds: Set<number>,
  locale: string,
): ModalCheckboxGroupField[] {
  const checkboxGroups: ModalCheckboxGroupField[] = [];

  for (let index = 0; index < personas.length; index += MAX_OPTIONS_PER_GROUP) {
    const chunk = personas.slice(index, index + MAX_OPTIONS_PER_GROUP);
    const groupIndex = Math.floor(index / MAX_OPTIONS_PER_GROUP);
    const options: CheckboxGroupOption[] = chunk.map((persona) => ({
      label: safeSelectOptionText(persona.tomori_nickname),
      value: persona.tomori_id.toString(),
      description: localizer(
        locale,
        persona.is_alter
          ? "commands.server.whitelist.persona.alter_persona_description"
          : "commands.server.whitelist.persona.main_persona_description",
      ),
      default: selectedPersonaIds.has(persona.tomori_id),
    }));

    checkboxGroups.push({
      kind: "checkboxGroup",
      customId: `${PERSONA_CHECKBOX_ID_PREFIX}_${groupIndex}`,
      labelKey:
        groupIndex === 0
          ? "commands.server.whitelist.persona.checkbox_label"
          : "commands.server.whitelist.persona.checkbox_label_continued",
      descriptionKey: groupIndex === 0 ? "commands.server.whitelist.persona.checkbox_description" : undefined,
      minValues: 0,
      maxValues: options.length,
      required: false,
      options,
    });
  }

  return checkboxGroups;
}

function collectCheckedPersonaIds(multiValues: Record<string, string[]> | undefined, groupCount: number): Set<number> {
  const selectedIds = new Set<number>();

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
    const values = multiValues?.[`${PERSONA_CHECKBOX_ID_PREFIX}_${groupIndex}`] ?? [];
    for (const value of values) {
      const tomoriId = Number.parseInt(value, 10);
      if (Number.isInteger(tomoriId) && tomoriId > 0) {
        selectedIds.add(tomoriId);
      }
    }
  }

  return selectedIds;
}

function areNumberArraysEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function formatSelectedPersonaNames(names: string[]): string {
  const maxVisibleNames = 10;
  const visibleNames = names.slice(0, maxVisibleNames);
  const suffix = names.length > maxVisibleNames ? ", ..." : "";
  return `${visibleNames.join(", ")}${suffix}`;
}
