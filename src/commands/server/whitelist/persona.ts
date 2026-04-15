import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type ModalSubmitInteraction,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import type { ModalCheckboxGroupField } from "@/types/discord/modal";
import { createStandardEmbed } from "@/utils/discord/embedHelper";
import { getCachedAllPersonas, getCachedTomoriState } from "@/utils/cache/tomoriStateCache";
import { invalidateWhitelistCache } from "@/utils/cache/channelWhitelistCache";
import { getPersonaWhitelistChannels, replacePersonaWhitelistChannels } from "@/utils/db/personaWhitelist";
import {
  CHECKLIST_CHANNELS_PER_PAGE,
  CHECKLIST_MAX_PAGE_BUTTONS,
  CHECKLIST_PAGE_SELECT_TIMEOUT_MS,
  buildChannelCheckboxGroups,
  buildChecklistPageActionRows,
  collectCheckedIds,
  formatChecklistChannelMentions,
  loadGuildTextChecklistChannels,
  type ChecklistChannelTarget,
} from "@/utils/discord/channelChecklistManager";
import { promptWithRawModal, replyInfoEmbed, replyPaginatedPersonaChoicesV2 } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { localizer } from "@/utils/text/localizer";
import type { ErrorContext, TomoriState, UserRow } from "@/types/db/schema";

const MODAL_CUSTOM_ID = "server_whitelist_persona_modal";
const CHECKBOX_ID_PREFIX = "server_whitelist_persona_checkbox_group";
const PAGE_BUTTON_PREFIX = "server_whitelist_persona_page_";
const DONE_BUTTON_ID = "server_whitelist_persona_done";

type PersonaWithId = TomoriState & { tomori_id: number };
type ResponseInteraction = ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction;

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand.setName("persona").setDescription(localizer("en-US", "commands.server.whitelist.persona.description"));

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
  let responseInteraction: ResponseInteraction = interaction;

  try {
    if (!interaction.guild || !interaction.guildId) {
      await replyInfoEmbed(interaction, locale, {
        color: ColorCode.ERROR,
        titleKey: "general.errors.guild_only_title",
        descriptionKey: "general.errors.guild_only_description",
      });
      return;
    }

    const [tomoriState, allPersonasRaw, availableChannels] = await Promise.all([
      getCachedTomoriState(interaction.guildId),
      getCachedAllPersonas(interaction.guildId),
      loadGuildTextChecklistChannels(interaction.guild),
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
      (persona): persona is PersonaWithId => typeof persona.tomori_id === "number",
    );
    if (allPersonas.length === 0) {
      await replyInfoEmbed(interaction, locale, {
        color: ColorCode.WARN,
        titleKey: "commands.server.whitelist.persona.no_personas_title",
        descriptionKey: "commands.server.whitelist.persona.no_personas_description",
      });
      return;
    }

    const personaSelection = await replyPaginatedPersonaChoicesV2(interaction, locale, {
      personas: allPersonas,
      color: ColorCode.INFO,
      preserveSelectedInteraction: true,
      onSelect: async () => {},
    });

    if (!personaSelection.success) {
      return;
    }

    if (personaSelection.selectedIndex === undefined || !personaSelection.interaction) {
      return;
    }

    responseInteraction = personaSelection.interaction;
    const personaButtonInteraction = personaSelection.interaction;
    const selectedPersona = allPersonas[personaSelection.selectedIndex] ?? null;
    if (!selectedPersona?.tomori_id) {
      await replyInfoEmbed(personaButtonInteraction, locale, {
        color: ColorCode.ERROR,
        titleKey: "general.errors.invalid_option_title",
        descriptionKey: "general.errors.invalid_option_description",
      });
      return;
    }

    errorContext.tomoriId = selectedPersona.tomori_id;

    if (availableChannels.length === 0) {
      await replyInfoEmbed(personaButtonInteraction, locale, {
        color: ColorCode.WARN,
        titleKey: "commands.server.whitelist.persona.no_channels_title",
        descriptionKey: "commands.server.whitelist.persona.no_channels_description",
        descriptionVars: {
          persona_name: selectedPersona.tomori_nickname,
        },
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const currentEntries = await getPersonaWhitelistChannels(tomoriState.server_id, selectedPersona.tomori_id);
    const initialSelectedIds = new Set(currentEntries.map((entry) => entry.channel_disc_id));

    if (availableChannels.length <= CHECKLIST_CHANNELS_PER_PAGE) {
      await executeSinglePage(
        personaButtonInteraction,
        locale,
        tomoriState.server_id,
        interaction.guildId,
        selectedPersona,
        availableChannels,
        initialSelectedIds,
      );
      return;
    }

    await executeMultiPage(
      personaButtonInteraction,
      locale,
      tomoriState.server_id,
      interaction.guildId,
      selectedPersona,
      availableChannels,
      initialSelectedIds,
    );
  } catch (error) {
    log.error("Error executing /server whitelist persona command", error, errorContext);

    if (!responseInteraction.replied && !responseInteraction.deferred) {
      await replyInfoEmbed(responseInteraction, locale, {
        color: ColorCode.ERROR,
        titleKey: "general.errors.unknown_error_title",
        descriptionKey: "general.errors.unknown_error_description",
      });
    }
  }
}

async function executeSinglePage(
  interaction: ButtonInteraction,
  locale: string,
  serverId: number,
  guildId: string,
  persona: PersonaWithId,
  availableChannels: ChecklistChannelTarget[],
  selectedIds: Set<string>,
): Promise<void> {
  const checkboxGroups = buildCheckboxGroups(availableChannels, selectedIds, locale);
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
    return;
  }

  const nextSelectedIds = collectCheckedIds(modalResult.multiValues, CHECKBOX_ID_PREFIX, checkboxGroups.length);
  await persistUpdate(
    modalResult.interaction,
    locale,
    serverId,
    guildId,
    persona,
    selectedIds,
    nextSelectedIds,
    availableChannels,
  );
}

async function executeMultiPage(
  interaction: ButtonInteraction,
  locale: string,
  serverId: number,
  guildId: string,
  persona: PersonaWithId,
  availableChannels: ChecklistChannelTarget[],
  initialSelectedIds: Set<string>,
): Promise<void> {
  const totalPages = Math.ceil(availableChannels.length / CHECKLIST_CHANNELS_PER_PAGE);
  let selectedIds = new Set(initialSelectedIds);

  if (totalPages > CHECKLIST_MAX_PAGE_BUTTONS) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "commands.server.whitelist.persona.too_many_pages_title",
      descriptionKey: "commands.server.whitelist.persona.too_many_pages_description",
      descriptionVars: {
        persona_name: persona.tomori_nickname,
        channel_count: availableChannels.length.toString(),
        max_pages: CHECKLIST_MAX_PAGE_BUTTONS.toString(),
      },
      color: ColorCode.WARN,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    embeds: [buildPageSelectEmbed(locale, persona, availableChannels.length, totalPages, selectedIds.size)],
    components: buildChecklistPageActionRows(
      totalPages,
      availableChannels.length,
      localizer(locale, "commands.server.whitelist.persona.done_button"),
      PAGE_BUTTON_PREFIX,
      DONE_BUTTON_ID,
    ),
    flags: MessageFlags.Ephemeral,
  });

  const pageSelectMessage = await interaction.fetchReply();

  while (true) {
    let buttonInteraction: ButtonInteraction;

    try {
      buttonInteraction = (await pageSelectMessage.awaitMessageComponent({
        filter: (i) =>
          i.user.id === interaction.user.id &&
          (i.customId.startsWith(PAGE_BUTTON_PREFIX) || i.customId === DONE_BUTTON_ID),
        time: CHECKLIST_PAGE_SELECT_TIMEOUT_MS,
      })) as ButtonInteraction;
    } catch {
      log.info("[WhitelistPersona] Page selection timed out");
      break;
    }

    if (buttonInteraction.customId === DONE_BUTTON_ID) {
      await buttonInteraction.deferUpdate();
      break;
    }

    const selectedPage = Number.parseInt(buttonInteraction.customId.replace(PAGE_BUTTON_PREFIX, ""), 10);
    if (!Number.isInteger(selectedPage) || selectedPage < 1 || selectedPage > totalPages) {
      await buttonInteraction.deferUpdate();
      continue;
    }

    const startIndex = (selectedPage - 1) * CHECKLIST_CHANNELS_PER_PAGE;
    const pageChannels = availableChannels.slice(startIndex, startIndex + CHECKLIST_CHANNELS_PER_PAGE);
    const checkboxGroups = buildCheckboxGroups(pageChannels, selectedIds, locale);

    const modalResult = await promptWithRawModal(
      buttonInteraction,
      locale,
      {
        modalCustomId: MODAL_CUSTOM_ID,
        modalTitleKey: "commands.server.whitelist.persona.modal_title",
        components: checkboxGroups,
      },
      MessageFlags.Ephemeral,
    );

    if (modalResult.outcome === "submit" && modalResult.interaction) {
      const pageSelectedIds = collectCheckedIds(modalResult.multiValues, CHECKBOX_ID_PREFIX, checkboxGroups.length);
      const nextSelectedIds = new Set(selectedIds);

      for (const channel of pageChannels) {
        nextSelectedIds.delete(channel.id);
      }
      for (const channelId of pageSelectedIds) {
        nextSelectedIds.add(channelId);
      }

      selectedIds = await persistUpdate(
        modalResult.interaction,
        locale,
        serverId,
        guildId,
        persona,
        selectedIds,
        nextSelectedIds,
        availableChannels,
      );
    }

    try {
      await interaction.editReply({
        embeds: [buildPageSelectEmbed(locale, persona, availableChannels.length, totalPages, selectedIds.size)],
        components: buildChecklistPageActionRows(
          totalPages,
          availableChannels.length,
          localizer(locale, "commands.server.whitelist.persona.done_button"),
          PAGE_BUTTON_PREFIX,
          DONE_BUTTON_ID,
        ),
      });
    } catch {
      break;
    }
  }

  try {
    await interaction.editReply({
      embeds: [buildPageSelectEmbed(locale, persona, availableChannels.length, totalPages, selectedIds.size)],
      components: [],
    });
  } catch {
    // Best effort cleanup.
  }
}

function buildCheckboxGroups(
  channels: ChecklistChannelTarget[],
  selectedIds: Set<string>,
  locale: string,
): ModalCheckboxGroupField[] {
  return buildChannelCheckboxGroups({
    channels,
    selectedIds,
    locale,
    checkboxIdPrefix: CHECKBOX_ID_PREFIX,
    labelKey: "commands.server.whitelist.persona.checkbox_label",
    labelKeyContinued: "commands.server.whitelist.persona.checkbox_label_continued",
    descriptionKey: "commands.server.whitelist.persona.checkbox_description",
  });
}

function buildPageSelectEmbed(
  locale: string,
  persona: PersonaWithId,
  channelCount: number,
  totalPages: number,
  selectedCount: number,
) {
  return createStandardEmbed(locale, {
    titleKey: "commands.server.whitelist.persona.select_page_title",
    descriptionKey: "commands.server.whitelist.persona.select_page_description",
    descriptionVars: {
      persona_name: persona.tomori_nickname,
      channel_count: channelCount.toString(),
      total_pages: totalPages.toString(),
      selected_count: selectedCount.toString(),
    },
    color: ColorCode.INFO,
  });
}

async function persistUpdate(
  responseInteraction: ModalSubmitInteraction,
  locale: string,
  serverId: number,
  guildId: string,
  persona: PersonaWithId,
  previousSelectedIds: Set<string>,
  nextSelectedIds: Set<string>,
  availableChannels: ChecklistChannelTarget[],
): Promise<Set<string>> {
  const normalizedSelectedIds = availableChannels
    .filter((channel) => nextSelectedIds.has(channel.id))
    .map((channel) => channel.id);
  const enabledIds = normalizedSelectedIds.filter((channelId) => !previousSelectedIds.has(channelId));
  const disabledIds = [...previousSelectedIds].filter((channelId) => !nextSelectedIds.has(channelId));

  if (enabledIds.length === 0 && disabledIds.length === 0) {
    await replyInfoEmbed(responseInteraction, locale, {
      titleKey: "commands.server.whitelist.persona.no_changes_title",
      descriptionKey: "commands.server.whitelist.persona.no_changes_description",
      descriptionVars: {
        persona_name: persona.tomori_nickname,
      },
      color: ColorCode.INFO,
    });
    return previousSelectedIds;
  }

  await replacePersonaWhitelistChannels(serverId, persona.tomori_id, normalizedSelectedIds);
  invalidateWhitelistCache(guildId);

  if (normalizedSelectedIds.length === 0) {
    await replyInfoEmbed(responseInteraction, locale, {
      titleKey: "commands.server.whitelist.persona.success_clear_title",
      descriptionKey: "commands.server.whitelist.persona.success_clear_description",
      descriptionVars: {
        persona_name: persona.tomori_nickname,
      },
      color: ColorCode.SUCCESS,
    });

    log.info(`Cleared channel whitelist restriction for persona ${persona.tomori_id} in server ${guildId}`);
    return new Set<string>();
  }

  await replyInfoEmbed(responseInteraction, locale, {
    titleKey: "commands.server.whitelist.persona.success_title",
    descriptionKey: "commands.server.whitelist.persona.success_description",
    descriptionVars: {
      persona_name: persona.tomori_nickname,
      selected_count: normalizedSelectedIds.length.toString(),
      selected_channels: formatChecklistChannelMentions(normalizedSelectedIds, availableChannels, locale),
    },
    color: ColorCode.SUCCESS,
  });

  log.info(
    `Updated channel whitelist restriction for persona ${persona.tomori_id} in server ${guildId}: [${normalizedSelectedIds.join(", ")}]`,
  );

  return new Set(normalizedSelectedIds);
}
