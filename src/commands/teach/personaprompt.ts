import type { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags, TextInputStyle } from "discord.js";
import type { UserRow, TomoriState } from "@/types/db/schema";
import { log, ColorCode } from "@/utils/misc/logger";
import { replyInfoEmbed, promptWithRawModal, safeSelectOptionText } from "@/utils/discord/interactionHelper";
import { getCachedTomoriState, invalidateTomoriStateCache } from "@/utils/cache/tomoriStateCache";
import { loadAllPersonasForServer } from "@/utils/db/dbRead";
import { sql } from "@/utils/db/client";
import { localizer } from "@/utils/text/localizer";
import type { SelectOption } from "@/types/discord/modal";

const MODAL_CUSTOM_ID = "teach_personaprompt_modal";
const PERSONA_SELECT_ID = "persona_select";
const PERSONA_PROMPT_INPUT_IDS = [
  "persona_prompt_part1",
  "persona_prompt_part2",
  "persona_prompt_part3",
  "persona_prompt_part4",
] as const;
const PERSONA_PROMPT_PART_MAX_LENGTH = 4000;

function splitPromptIntoModalParts(prompt: string | null | undefined): string[] {
  const promptValue = prompt ?? "";

  return Array.from({ length: PERSONA_PROMPT_INPUT_IDS.length }, (_, index) =>
    promptValue.slice(index * PERSONA_PROMPT_PART_MAX_LENGTH, (index + 1) * PERSONA_PROMPT_PART_MAX_LENGTH),
  );
}

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand.setName("personaprompt").setDescription(localizer("en-US", "commands.teach.personaprompt.description"));

export async function execute(
  _client: Client,
  interaction: ChatInputCommandInteraction,
  _userData: UserRow,
  locale: string,
): Promise<void> {
  if (!interaction.channel) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.channel_only_title",
      descriptionKey: "general.errors.channel_only_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.guild) {
    const hasPermission = interaction.memberPermissions?.has("ManageGuild") ?? false;
    if (!hasPermission) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.teach.personaprompt.no_permission_title",
        descriptionKey: "commands.teach.personaprompt.no_permission_description",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  let tomoriState: TomoriState | null = null;
  try {
    const serverDiscId = interaction.guild?.id ?? interaction.user.id;
    tomoriState = await getCachedTomoriState(serverDiscId);
    if (!tomoriState) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.tomori_not_setup_title",
        descriptionKey: "general.errors.tomori_not_setup_description",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const allPersonas = await loadAllPersonasForServer(serverDiscId);
    const personaSelectOptions: SelectOption[] = allPersonas
      .filter((persona) => persona.tomori_id !== undefined)
      .map((persona) => ({
        label: safeSelectOptionText(persona.tomori_nickname),
        value: persona.tomori_id?.toString() ?? "",
        description: persona.is_alter
          ? localizer(locale, "commands.teach.personaprompt.alter_persona_description")
          : localizer(locale, "commands.teach.personaprompt.main_persona_description"),
      }))
      .filter((option) => option.value !== "");

    if (personaSelectOptions.length === 0) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.unknown_error_title",
        descriptionKey: "general.errors.unknown_error_description",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const initialPersona = allPersonas[0] ?? null;
    const existingPromptParts = splitPromptIntoModalParts(initialPersona?.persona_prompt);

    const modalResult = await promptWithRawModal(interaction, locale, {
      modalCustomId: MODAL_CUSTOM_ID,
      modalTitleKey: "commands.teach.personaprompt.modal_title",
      components: [
        {
          customId: PERSONA_SELECT_ID,
          labelKey: "commands.teach.personaprompt.persona_select_label",
          descriptionKey: "commands.teach.personaprompt.persona_select_description",
          placeholder: "commands.teach.personaprompt.persona_select_placeholder",
          required: true,
          options: personaSelectOptions,
        },
        {
          customId: PERSONA_PROMPT_INPUT_IDS[0],
          labelKey: "commands.teach.personaprompt.part1_label",
          descriptionKey: "commands.teach.personaprompt.part1_description",
          placeholder: "commands.teach.personaprompt.part1_placeholder",
          style: TextInputStyle.Paragraph,
          required: true,
          maxLength: PERSONA_PROMPT_PART_MAX_LENGTH,
          value: existingPromptParts[0] || undefined,
        },
        {
          customId: PERSONA_PROMPT_INPUT_IDS[1],
          labelKey: "commands.teach.personaprompt.part2_label",
          descriptionKey: "commands.teach.personaprompt.part2_description",
          placeholder: "commands.teach.personaprompt.part2_placeholder",
          style: TextInputStyle.Paragraph,
          required: false,
          maxLength: PERSONA_PROMPT_PART_MAX_LENGTH,
          value: existingPromptParts[1] || undefined,
        },
        {
          customId: PERSONA_PROMPT_INPUT_IDS[2],
          labelKey: "commands.teach.personaprompt.part3_label",
          descriptionKey: "commands.teach.personaprompt.part3_description",
          placeholder: "commands.teach.personaprompt.part3_placeholder",
          style: TextInputStyle.Paragraph,
          required: false,
          maxLength: PERSONA_PROMPT_PART_MAX_LENGTH,
          value: existingPromptParts[2] || undefined,
        },
        {
          customId: PERSONA_PROMPT_INPUT_IDS[3],
          labelKey: "commands.teach.personaprompt.part4_label",
          descriptionKey: "commands.teach.personaprompt.part4_description",
          placeholder: "commands.teach.personaprompt.part4_placeholder",
          style: TextInputStyle.Paragraph,
          required: false,
          maxLength: PERSONA_PROMPT_PART_MAX_LENGTH,
          value: existingPromptParts[3] || undefined,
        },
      ],
    });

    if (modalResult.outcome !== "submit") {
      log.info(`Teach personaprompt modal ${modalResult.outcome} for user ${interaction.user.id}`);
      return;
    }

    const modalSubmitInteraction = modalResult.interaction;
    const selectedPersonaId = modalResult.values?.[PERSONA_SELECT_ID];
    const personaPrompt = PERSONA_PROMPT_INPUT_IDS.map((inputId) => modalResult.values?.[inputId] || "")
      .join("")
      .trim();
    if (!modalSubmitInteraction || !selectedPersonaId || !personaPrompt) {
      return;
    }

    const selectedPersona = allPersonas.find((persona) => persona.tomori_id?.toString() === selectedPersonaId) ?? null;
    if (!selectedPersona?.tomori_id) {
      await replyInfoEmbed(modalSubmitInteraction, locale, {
        titleKey: "general.errors.invalid_option_title",
        descriptionKey: "general.errors.invalid_option_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    await sql`
			INSERT INTO persona_configs (tomori_id, persona_prompt)
			VALUES (${selectedPersona.tomori_id}, ${personaPrompt})
			ON CONFLICT (tomori_id) DO UPDATE
			SET persona_prompt = EXCLUDED.persona_prompt
		`;

    invalidateTomoriStateCache(serverDiscId);

    await replyInfoEmbed(modalSubmitInteraction, locale, {
      titleKey: "commands.teach.personaprompt.success_title",
      descriptionKey: "commands.teach.personaprompt.success_description",
      descriptionVars: { persona_name: selectedPersona.tomori_nickname },
      color: ColorCode.SUCCESS,
    });
  } catch (error) {
    await log.error("Error in /teach personaprompt command", error, {
      serverId: tomoriState?.server_id,
      tomoriId: tomoriState?.tomori_id,
      errorType: "CommandExecutionError",
      metadata: {
        command: "teach personaprompt",
        guildId: interaction.guild?.id,
        userId: interaction.user.id,
      },
    });

    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
