import {
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import { getCachedTomoriState, invalidateTomoriStateCache } from "@/utils/cache/tomoriStateCache";
import { loadAllPersonasForServer } from "@/utils/db/dbRead";
import { updateTomori } from "@/utils/db/dbWrite";
import {
  acknowledgeModalSubmitForRefresh,
  promptWithPaginatedModal,
  replyInfoEmbed,
  replyPaginatedPersonaChoicesV2,
  safeSelectOptionText,
} from "@/utils/discord/interactionHelper";
import { ColorCode, log } from "@/utils/misc/logger";
import { ELEVENLABS_SERVICE_NAME, validateElevenLabsApiKey } from "@/utils/audio/elevenLabsAccount";
import { type ElevenLabsVoiceCatalogEntry, fetchElevenLabsVoiceCatalog } from "@/utils/audio/elevenLabsVoiceCatalog";
import type { ErrorContext, TomoriState, UserRow } from "@/types/db/schema";
import type { SelectOption } from "@/types/discord/modal";
import { registerCustomEndpoint, setActiveCustomEndpoint } from "@/utils/provider/customEndpointService";
import { localizer } from "@/utils/text/localizer";

const MIN_KEY_LENGTH = 10;
const VOICE_SELECT_MODAL_ID = "config_speech_elevenlabs_voice_modal";
const VOICE_SELECT_ID = "voice_select";
const SKIP_ASSIGNMENT_VALUE = "__skip__";

function buildVoiceDescription(voice: ElevenLabsVoiceCatalogEntry, locale: string): string {
  const summaryParts = [voice.category, voice.labels.gender, voice.labels.age, voice.labels.accent]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

  if (summaryParts.length > 0) {
    return safeSelectOptionText(summaryParts.join(" | "));
  }

  if (voice.description) {
    return safeSelectOptionText(voice.description);
  }

  return safeSelectOptionText(localizer(locale, "commands.config.voice.elevenlabs.voice_available_description"));
}

function buildVoiceOptions(voices: ElevenLabsVoiceCatalogEntry[], locale: string): SelectOption[] {
  return [
    {
      label: safeSelectOptionText(localizer(locale, "commands.config.speech.elevenlabs.skip_voice_label")),
      value: SKIP_ASSIGNMENT_VALUE,
      description: safeSelectOptionText(localizer(locale, "commands.config.speech.elevenlabs.skip_voice_description")),
    },
    ...voices.map((voice) => ({
      label: safeSelectOptionText(voice.name),
      value: voice.voiceId,
      description: buildVoiceDescription(voice, locale),
    })),
  ];
}

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("elevenlabs")
    .setDescription(localizer("en-US", "commands.config.speech.elevenlabs.description"))
    .addStringOption((option) =>
      option
        .setName("key")
        .setDescription(localizer("en-US", "commands.config.speech.elevenlabs.key_description"))
        .setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName("assign_voice")
        .setDescription(localizer("en-US", "commands.config.speech.elevenlabs.assign_voice_description"))
        .setRequired(false),
    );

export async function execute(
  _client: Client,
  interaction: ChatInputCommandInteraction,
  userData: UserRow,
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

  const serverDiscId = interaction.guild?.id ?? interaction.user.id;
  let selectedPersona: TomoriState | null = null;
  let tomoriState = await getCachedTomoriState(serverDiscId);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    if (!tomoriState) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.tomori_not_setup_title",
        descriptionKey: "general.errors.tomori_not_setup_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    const apiKey = interaction.options.getString("key", true).trim();
    const shouldAssignVoice = interaction.options.getBoolean("assign_voice") ?? true;
    if (apiKey.length < MIN_KEY_LENGTH) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.config.speech.elevenlabs.invalid_key_title",
        descriptionKey: "commands.config.speech.elevenlabs.invalid_key_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    const validationResult = await validateElevenLabsApiKey(apiKey);
    if (!validationResult.success) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.config.speech.elevenlabs.key_validation_failed_title",
        descriptionKey: "commands.config.speech.elevenlabs.key_validation_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    const speechRegistration = await registerCustomEndpoint({
      scope: {
        kind: "server",
        ownerId: tomoriState.server_id,
        baseConfig: tomoriState.config,
      },
      label: ELEVENLABS_SERVICE_NAME,
      capability: "speech",
      apiStyle: "elevenlabs",
      endpointUrl: "https://api.elevenlabs.io",
      displayName: "ElevenLabs TTS",
      modelName: null,
      authToken: apiKey,
      extraConfig: { script_markup: "bracket-tags", supports_instruct: false },
    });
    const transcriptionRegistration = await registerCustomEndpoint({
      scope: {
        kind: "server",
        ownerId: tomoriState.server_id,
        baseConfig: tomoriState.config,
      },
      label: ELEVENLABS_SERVICE_NAME,
      capability: "transcription",
      apiStyle: "elevenlabs-transcription",
      endpointUrl: "https://api.elevenlabs.io",
      displayName: "ElevenLabs STT",
      modelName: null,
      authToken: apiKey,
      extraConfig: {},
    });

    if (
      !speechRegistration?.customEndpoint.custom_endpoint_id ||
      !transcriptionRegistration?.customEndpoint.custom_endpoint_id
    ) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    await setActiveCustomEndpoint({
      serverId: tomoriState.server_id,
      capability: "speech",
      customEndpointId: speechRegistration.customEndpoint.custom_endpoint_id,
    });
    await setActiveCustomEndpoint({
      serverId: tomoriState.server_id,
      capability: "transcription",
      customEndpointId: transcriptionRegistration.customEndpoint.custom_endpoint_id,
    });
    invalidateTomoriStateCache(serverDiscId);
    tomoriState = await getCachedTomoriState(serverDiscId);

    if (!shouldAssignVoice) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.config.speech.elevenlabs.success_title",
        descriptionKey: "commands.config.speech.elevenlabs.success_skip_description",
        color: ColorCode.SUCCESS,
      });
      return;
    }

    const voiceCatalogResult = await fetchElevenLabsVoiceCatalog(apiKey);
    if (!voiceCatalogResult.success || !voiceCatalogResult.voices?.length) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.config.speech.elevenlabs.voice_fetch_failed_title",
        descriptionKey: "commands.config.speech.elevenlabs.voice_fetch_failed_description",
        color: ColorCode.WARN,
      });
      return;
    }

    const allPersonas = await loadAllPersonasForServer(serverDiscId);
    const personaSelection = await replyPaginatedPersonaChoicesV2(interaction, locale, {
      personas: allPersonas,
      color: ColorCode.INFO,
      preserveSelectedInteraction: true,
      titleKey: "commands.config.speech.elevenlabs.select_persona_title",
      onSelect: async () => {},
    });

    if (!personaSelection.success || personaSelection.selectedIndex === undefined || !personaSelection.interaction) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.config.speech.elevenlabs.success_title",
        descriptionKey: "commands.config.speech.elevenlabs.success_skip_description",
        color: ColorCode.SUCCESS,
      });
      return;
    }

    const personaButtonInteraction = personaSelection.interaction as ButtonInteraction;
    selectedPersona = allPersonas[personaSelection.selectedIndex] ?? null;
    if (!selectedPersona?.tomori_id) {
      await replyInfoEmbed(personaButtonInteraction, locale, {
        titleKey: "general.errors.invalid_option_title",
        descriptionKey: "general.errors.invalid_option_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    const modalResult = await promptWithPaginatedModal(personaButtonInteraction, locale, {
      modalCustomId: VOICE_SELECT_MODAL_ID,
      modalTitleKey: "commands.config.speech.elevenlabs.voice_modal_title",
      components: [
        {
          customId: VOICE_SELECT_ID,
          labelKey: "commands.config.voice.elevenlabs.select_label",
          descriptionKey: "commands.config.voice.elevenlabs.select_description",
          placeholder: "commands.config.voice.elevenlabs.select_placeholder",
          required: true,
          options: buildVoiceOptions(voiceCatalogResult.voices, locale),
        },
      ],
    });

    if (modalResult.outcome !== "submit" || !modalResult.interaction) {
      return;
    }

    const selectedVoiceId = modalResult.values?.[VOICE_SELECT_ID];
    const chosenVoice =
      !selectedVoiceId || selectedVoiceId === SKIP_ASSIGNMENT_VALUE
        ? null
        : (voiceCatalogResult.voices.find((voice) => voice.voiceId === selectedVoiceId) ?? null);

    if (selectedVoiceId !== SKIP_ASSIGNMENT_VALUE && !chosenVoice) {
      await replyInfoEmbed(modalResult.interaction, locale, {
        titleKey: "general.errors.invalid_option_title",
        descriptionKey: "general.errors.invalid_option_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    if (chosenVoice) {
      const updatedTomori = await updateTomori(selectedPersona.tomori_id, {
        speech_voice_id: chosenVoice.voiceId,
        speech_voice_name: chosenVoice.name,
        elevenlabs_voice_id: chosenVoice.voiceId,
        elevenlabs_voice_name: chosenVoice.name,
        speech_voice_sample_id: null,
      });

      if (!updatedTomori) {
        await replyInfoEmbed(modalResult.interaction, locale, {
          titleKey: "general.errors.update_failed_title",
          descriptionKey: "general.errors.update_failed_description",
          color: ColorCode.ERROR,
        });
        return;
      }

      invalidateTomoriStateCache(serverDiscId);
    }

    await acknowledgeModalSubmitForRefresh(modalResult.interaction);
    await replyInfoEmbed(interaction, locale, {
      titleKey: "commands.config.speech.elevenlabs.success_title",
      descriptionKey: chosenVoice
        ? "commands.config.speech.elevenlabs.success_assigned_description"
        : "commands.config.speech.elevenlabs.success_skip_description",
      descriptionVars: {
        persona: selectedPersona.tomori_nickname,
        voice: chosenVoice?.name ?? "",
      },
      color: ColorCode.SUCCESS,
    });
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      serverId: tomoriState?.server_id ?? selectedPersona?.server_id ?? null,
      tomoriId: tomoriState?.tomori_id ?? selectedPersona?.tomori_id ?? null,
      errorType: "CommandExecutionError",
      metadata: {
        command: "config speech elevenlabs",
        guildId: interaction.guild?.id ?? interaction.user.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error("Error executing /config speech elevenlabs", error as Error, context);
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
