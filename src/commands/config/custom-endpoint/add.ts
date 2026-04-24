import type {
  Attachment,
  ChatInputCommandInteraction,
  Client,
  ModalSubmitInteraction,
  SlashCommandSubcommandBuilder,
} from "discord.js";
import { MessageFlags } from "discord.js";
import type { CustomEndpointApiStyle, CustomEndpointCapability, ErrorContext, UserRow } from "@/types/db/schema";
import { getCachedTomoriState, invalidateTomoriStateCache } from "@/utils/cache/tomoriStateCache";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { validateRemoteMcpUrl } from "@/utils/mcp/mcpUrlSecurity";
import {
  buildCapabilityAddModal,
  capabilityNeedsAddModal,
  ModalFieldId,
  parseCapabilityModalFields,
} from "@/utils/provider/customEndpointCapabilityModal";
import { registerCustomEndpoint, validateCustomEndpointReachability } from "@/utils/provider/customEndpointService";
import { isValidCustomEndpointLabel, normalizeCustomEndpointLabel } from "@/utils/provider/customProviderUtils";
import { localizer } from "@/utils/text/localizer";

async function loadWorkflowJson(attachment: Attachment | null): Promise<Record<string, unknown> | null> {
  if (!attachment) {
    return null;
  }

  const response = await fetch(attachment.url);
  if (!response.ok) {
    throw new Error(`Workflow download failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

/**
 * Phase 4.5: slimmed to routing fields only.
 * Capability-specific advanced fields are collected via a follow-up modal.
 * The workflow_json attachment is kept here since modals cannot hold file uploads.
 */
export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("add")
    .setDescription(localizer("en-US", "commands.config.custom_models.add.description"))
    .addStringOption((option) =>
      option
        .setName("endpoint_label")
        .setDescription(localizer("en-US", "commands.config.custom_models.add.label_description"))
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("capability")
        .setDescription(localizer("en-US", "commands.config.custom_models.add.capability_description"))
        .setRequired(true)
        .addChoices(
          { name: "Text", value: "text" },
          { name: "Embedding", value: "embedding" },
          { name: "Image", value: "image" },
          { name: "Video", value: "video" },
          { name: "Speech (TTS)", value: "speech" },
          { name: "Transcription (STT)", value: "transcription" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("api_style")
        .setDescription(localizer("en-US", "commands.config.custom_models.add.api_style_description"))
        .setRequired(true)
        .addChoices(
          { name: localizer("en-US", "general.api_styles.openai_compatible"), value: "openai-compatible" },
          { name: localizer("en-US", "general.api_styles.comfyui"), value: "comfyui" },
          { name: localizer("en-US", "general.api_styles.ollama_native"), value: "ollama-native" },
          { name: localizer("en-US", "general.api_styles.tts_clone"), value: "tts-clone" },
          {
            name: localizer("en-US", "general.api_styles.openai_compatible_transcription"),
            value: "openai-compatible-transcription",
          },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("endpoint_url")
        .setDescription(localizer("en-US", "commands.config.custom_models.add.endpoint_url_description"))
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("auth_token")
        .setDescription(localizer("en-US", "commands.config.custom_models.add.auth_token_description"))
        .setRequired(false),
    )
    .addAttachmentOption((option) =>
      option
        .setName("workflow_json")
        .setDescription(localizer("en-US", "commands.config.custom_models.add.workflow_description"))
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

  // Cache-backed; completes well within Discord's 3s window before showModal.
  const tomoriState = await getCachedTomoriState(interaction.guild?.id ?? interaction.user.id);
  if (!tomoriState) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.tomori_not_setup_title",
      descriptionKey: "general.errors.tomori_not_setup_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Parse routing fields from the slim slash command.
  const rawLabel = interaction.options.getString("endpoint_label", true);
  const label = normalizeCustomEndpointLabel(rawLabel);
  const capability = interaction.options.getString("capability", true) as CustomEndpointCapability;
  const apiStyle = interaction.options.getString("api_style", true) as CustomEndpointApiStyle;
  const endpointUrl = interaction.options.getString("endpoint_url", true).trim();
  const authToken = interaction.options.getString("auth_token");
  const workflowAttachment = interaction.options.getAttachment("workflow_json");

  // Sync validations before the interaction response (no async budget consumed).
  if (!isValidCustomEndpointLabel(label)) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.invalid_option_title",
      descriptionKey: "commands.config.custom_models.validation.invalid_label",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const urlValidation = await validateRemoteMcpUrl(endpointUrl);
  if (!urlValidation.valid) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.custom_endpoint_unreachable_title",
      descriptionKey: "commands.config.custom_models.validation.unreachable",
      descriptionVars: { reason: urlValidation.failureCode ?? "invalid_url" },
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Unique modal ID per invocation prevents stale awaitModalSubmit collisions.
  const modalCustomId = `custom_endpoint_add_modal_${interaction.id}`;

  // 1a. Capabilities with a detail modal: show it as the primary interaction response.
  if (capabilityNeedsAddModal(capability)) {
    const modal = buildCapabilityAddModal(capability, locale, modalCustomId);

    let modalSubmit: ModalSubmitInteraction;
    try {
      await interaction.showModal(modal);
      modalSubmit = await interaction.awaitModalSubmit({
        time: 600_000,
        filter: (i) => i.customId === modalCustomId && i.user.id === interaction.user.id,
      });
    } catch {
      // Timed out or dismissed — no follow-up needed.
      return;
    }

    // Defer the modal submit before all async work.
    await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const rawFields: Record<string, string> = {};
      for (const id of Object.values(ModalFieldId)) {
        try {
          rawFields[id] = modalSubmit.fields.getTextInputValue(id);
        } catch {
          rawFields[id] = "";
        }
      }

      const parsed = parseCapabilityModalFields(rawFields, capability);

      // Capability-specific model name requirement (text/embedding).
      if ((capability === "text" || capability === "embedding") && !parsed.modelName) {
        await replyInfoEmbed(modalSubmit, locale, {
          titleKey: "general.errors.invalid_option_title",
          descriptionKey: "commands.config.custom_models.validation.model_name_required",
          color: ColorCode.ERROR,
        });
        return;
      }

      // Transcription requires a model identifier.
      if (capability === "transcription" && !parsed.transcriptionModel) {
        await replyInfoEmbed(modalSubmit, locale, {
          titleKey: "general.errors.invalid_option_title",
          descriptionKey: "commands.config.custom_models.validation.transcription_model_required",
          color: ColorCode.ERROR,
        });
        return;
      }

      const reachability = await validateCustomEndpointReachability({ apiStyle, endpointUrl, apiKey: authToken });
      if (!reachability.ok) {
        await replyInfoEmbed(modalSubmit, locale, {
          titleKey: "general.errors.custom_endpoint_unreachable_title",
          descriptionKey: "commands.config.custom_models.validation.unreachable",
          descriptionVars: { reason: reachability.reason },
          color: ColorCode.ERROR,
        });
        return;
      }

      const displayName = parsed.displayName || parsed.modelName || label;

      let extraConfig: Record<string, unknown> = {};
      if (capability === "speech") {
        extraConfig = { script_markup: parsed.scriptMarkup, supports_instruct: parsed.supportsInstruct };
      } else if (capability === "transcription") {
        extraConfig = { model: parsed.transcriptionModel ?? "whisper-1", language: parsed.transcriptionLanguage };
      }

      const registered = await registerCustomEndpoint({
        scope: { kind: "server", ownerId: tomoriState.server_id, baseConfig: tomoriState.config },
        label,
        capability,
        apiStyle,
        endpointUrl,
        displayName,
        modelName: parsed.modelName,
        authToken,
        numCtx: parsed.numCtx,
        hasTools: parsed.hasTools,
        seesImages: parsed.seesImages,
        supportsStructOutput: parsed.supportsStructOutput,
        extraConfig,
      });

      if (!registered) {
        await replyInfoEmbed(modalSubmit, locale, {
          titleKey: "general.errors.update_failed_title",
          descriptionKey: "general.errors.update_failed_description",
          color: ColorCode.ERROR,
        });
        return;
      }

      invalidateTomoriStateCache(interaction.guild?.id ?? interaction.user.id);

      const isTtsCloneSpeech = capability === "speech" && apiStyle === "tts-clone";
      await replyInfoEmbed(modalSubmit, locale, {
        titleKey: "commands.config.custom_models.add.success_title",
        descriptionKey: isTtsCloneSpeech
          ? "commands.config.custom_models.add.speech_next_steps_description"
          : "commands.config.custom_models.add.success_description",
        descriptionVars: { display_name: displayName, label, capability },
        color: ColorCode.SUCCESS,
      });
    } catch (error) {
      const context: ErrorContext = {
        userId: userData.user_id,
        serverId: tomoriState.server_id,
        tomoriId: tomoriState.tomori_id,
        errorType: "CommandExecutionError",
        metadata: {
          command: "config custom-endpoint add",
          guildId: interaction.guild?.id,
          executorDiscordId: interaction.user.id,
        },
      };
      await log.error("Error executing /config custom-endpoint add (modal path)", error as Error, context);
      await replyInfoEmbed(modalSubmit, locale, {
        titleKey: "general.errors.unknown_error_title",
        descriptionKey: "general.errors.unknown_error_description",
        color: ColorCode.ERROR,
      });
    }
    return;
  }

  // 1b. Image / video: no capability modal — workflow_json is an attachment and can't go in modals.
  try {
    if ((capability === "image" || capability === "video") && apiStyle === "comfyui" && !workflowAttachment) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.invalid_option_title",
        descriptionKey: "commands.config.custom_models.validation.workflow_required",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const reachability = await validateCustomEndpointReachability({ apiStyle, endpointUrl, apiKey: authToken });
    if (!reachability.ok) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.custom_endpoint_unreachable_title",
        descriptionKey: "commands.config.custom_models.validation.unreachable",
        descriptionVars: { reason: reachability.reason },
        color: ColorCode.ERROR,
      });
      return;
    }

    const workflow = workflowAttachment ? await loadWorkflowJson(workflowAttachment) : null;
    const displayName = label;

    const registered = await registerCustomEndpoint({
      scope: { kind: "server", ownerId: tomoriState.server_id, baseConfig: tomoriState.config },
      label,
      capability,
      apiStyle,
      endpointUrl,
      displayName,
      modelName: null,
      authToken,
      extraConfig: workflow ? { workflow } : {},
    });

    if (!registered) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    invalidateTomoriStateCache(interaction.guild?.id ?? interaction.user.id);

    await replyInfoEmbed(interaction, locale, {
      titleKey: "commands.config.custom_models.add.success_title",
      descriptionKey: "commands.config.custom_models.add.success_description",
      descriptionVars: { display_name: displayName, label, capability },
      color: ColorCode.SUCCESS,
    });
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      serverId: tomoriState.server_id,
      tomoriId: tomoriState.tomori_id,
      errorType: "CommandExecutionError",
      metadata: {
        command: "config custom-endpoint add",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error("Error executing /config custom-endpoint add (image/video path)", error as Error, context);
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
