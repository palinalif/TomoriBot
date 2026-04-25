/**
 * Phase 4.5 edit flow: endpoint-select modal → summary + Edit button → capability detail modal.
 *
 * Discord's interaction rules:
 *   - Slash command    → showModal (endpoint select) ✓
 *   - ModalSubmit      → reply/defer (NOT showModal) ✓ — so we reply with a button
 *   - ButtonInteraction → showModal (capability fields, pre-filled) ✓
 *   - ModalSubmit      → deferUpdate → register → editReply ✓
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, MessageFlags } from "discord.js";
import type { ButtonInteraction, ChatInputCommandInteraction, ModalSubmitInteraction } from "discord.js";
import type { CustomEndpointCapability, CustomEndpointRow, TomoriConfigRow } from "@/types/db/schema";
import type { SelectOption } from "@/types/discord/modal";
import { promptWithPaginatedModal, replyInfoEmbed, safeSelectOptionText } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { validateRemoteMcpUrl } from "@/utils/mcp/mcpUrlSecurity";
import {
  buildCapabilityEditModal,
  ModalFieldId,
  parseCapabilityModalFields,
} from "@/utils/provider/customEndpointCapabilityModal";
import { registerCustomEndpoint, validateCustomEndpointReachability } from "@/utils/provider/customEndpointService";
import { localizer } from "@/utils/text/localizer";

const SELECT_MODAL_CUSTOM_ID = "custom_endpoint_edit_select_modal";
const ENDPOINT_SELECT_ID = "endpoint_select";
const EDIT_BUTTON_ID = "edit_fields";
const CANCEL_BUTTON_ID = "cancel_edit";

type RegistrationScope =
  | { kind: "server"; ownerId: number; baseConfig: TomoriConfigRow }
  | { kind: "personal"; ownerId: number; baseConfig: TomoriConfigRow };

export interface ExecuteCustomEndpointEditOptions {
  interaction: ChatInputCommandInteraction;
  locale: string;
  scope: RegistrationScope;
  keys: {
    noneTitle: string;
    noneDescription: string;
    selectModalTitle: string;
    selectLabel: string;
    selectDescription: string;
    selectPlaceholder: string;
    successTitle: string;
    successDescription: string;
    validationUnreachable: string;
    capabilityText: string;
    capabilityEmbedding: string;
    capabilityImage: string;
    capabilityVideo: string;
    capabilitySpeech: string;
    capabilityTranscription: string;
  };
  strictRemoteValidation: boolean;
  loadEndpoints: (ownerId: number) => Promise<CustomEndpointRow[]>;
  onSuccess?: () => void | Promise<void>;
}

function getCapabilityLabel(
  locale: string,
  keys: ExecuteCustomEndpointEditOptions["keys"],
  capability: CustomEndpointCapability,
): string {
  switch (capability) {
    case "text":
      return localizer(locale, keys.capabilityText);
    case "embedding":
      return localizer(locale, keys.capabilityEmbedding);
    case "image":
      return localizer(locale, keys.capabilityImage);
    case "video":
      return localizer(locale, keys.capabilityVideo);
    case "speech":
    case "transcription":
      return capability;
  }
}

function getEndpointSelectionValue(endpoint: CustomEndpointRow): string {
  return endpoint.custom_endpoint_id?.toString() ?? `${endpoint.capability}:${endpoint.label}`;
}

function buildEndpointSelectOptions(
  endpoints: CustomEndpointRow[],
  locale: string,
  keys: ExecuteCustomEndpointEditOptions["keys"],
): SelectOption[] {
  return endpoints.map((endpoint) => {
    const primaryName = endpoint.model_name?.trim() || endpoint.display_name;
    const description = `${getCapabilityLabel(locale, keys, endpoint.capability)} — ${endpoint.display_name}`;
    return {
      label: safeSelectOptionText(`${endpoint.label} — ${primaryName}`),
      value: getEndpointSelectionValue(endpoint),
      description: safeSelectOptionText(description),
    };
  });
}

/** Build a concise embed summarising the selected endpoint's current configuration. */
function buildEndpointSummaryEmbed(locale: string, endpoint: CustomEndpointRow): EmbedBuilder {
  const extra = endpoint.extra_config as Record<string, unknown>;
  const lines: string[] = [
    `**${localizer(locale, "commands.config.custom_models.capability_modal.endpoint_url_label")}:** \`${endpoint.endpoint_url}\``,
    `**${localizer(locale, "commands.config.custom_models.edit.summary_capability")}:** ${endpoint.capability}`,
    `**${localizer(locale, "commands.config.custom_models.edit.summary_api_style")}:** ${endpoint.api_style}`,
  ];

  if (endpoint.model_name) {
    lines.push(
      `**${localizer(locale, "commands.config.custom_models.capability_modal.model_name_label")}:** \`${endpoint.model_name}\``,
    );
  }

  if (endpoint.display_name) {
    lines.push(
      `**${localizer(locale, "commands.config.custom_models.capability_modal.display_name_label")}:** ${endpoint.display_name}`,
    );
  }

  if (endpoint.capability === "text" || endpoint.capability === "embedding") {
    const caps: string[] = [];
    if (endpoint.has_tools) caps.push("tools");
    if (endpoint.sees_images) caps.push("vision");
    if (endpoint.supports_structoutput) caps.push("structoutput");
    if (caps.length > 0) {
      lines.push(
        `**${localizer(locale, "commands.config.custom_models.capability_modal.text_capabilities_label")}:** ${caps.join(", ")}`,
      );
    }
    if (endpoint.num_ctx) {
      lines.push(
        `**${localizer(locale, "commands.config.custom_models.capability_modal.num_ctx_label")}:** ${endpoint.num_ctx}`,
      );
    }
  }

  if (endpoint.capability === "speech") {
    const scriptMarkup = extra.script_markup as string | undefined;
    const supportsInstruct = extra.supports_instruct as boolean | undefined;
    if (scriptMarkup) {
      lines.push(
        `**${localizer(locale, "commands.config.custom_models.capability_modal.script_markup_label")}:** ${scriptMarkup}`,
      );
    }
    if (supportsInstruct != null) {
      lines.push(
        `**${localizer(locale, "commands.config.custom_models.capability_modal.supports_instruct_label")}:** ${supportsInstruct ? "yes" : "no"}`,
      );
    }
  }

  if (endpoint.capability === "transcription") {
    const model = extra.model as string | undefined;
    const language = extra.language as string | null | undefined;
    if (model) {
      lines.push(
        `**${localizer(locale, "commands.config.custom_models.capability_modal.transcription_model_label")}:** \`${model}\``,
      );
    }
    if (language) {
      lines.push(
        `**${localizer(locale, "commands.config.custom_models.capability_modal.transcription_language_label")}:** ${language}`,
      );
    }
  }

  return new EmbedBuilder()
    .setColor(ColorCode.INFO)
    .setTitle(localizer(locale, "commands.config.custom_models.edit.summary_title").replace("{label}", endpoint.label))
    .setDescription(lines.join("\n"));
}

export async function executeCustomEndpointEditCommand(options: ExecuteCustomEndpointEditOptions): Promise<void> {
  const { interaction, locale, scope, keys, strictRemoteValidation, loadEndpoints, onSuccess } = options;
  const registeredEndpoints = await loadEndpoints(scope.ownerId);

  if (registeredEndpoints.length === 0) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: keys.noneTitle,
      descriptionKey: keys.noneDescription,
      color: ColorCode.WARN,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Step 1: show endpoint selection modal (slash command → showModal is Discord-allowed).
  const selectModalResult = await promptWithPaginatedModal(interaction, locale, {
    modalCustomId: `${SELECT_MODAL_CUSTOM_ID}_${scope.kind}_${interaction.id}`,
    modalTitleKey: keys.selectModalTitle,
    components: [
      {
        customId: ENDPOINT_SELECT_ID,
        labelKey: keys.selectLabel,
        descriptionKey: keys.selectDescription,
        placeholder: keys.selectPlaceholder,
        required: true,
        options: buildEndpointSelectOptions(registeredEndpoints, locale, keys),
      },
    ],
  });

  if (selectModalResult.outcome !== "submit" || !selectModalResult.interaction) {
    return;
  }

  const selectInteraction = selectModalResult.interaction as ModalSubmitInteraction;
  const selectedValue = selectModalResult.values?.[ENDPOINT_SELECT_ID];
  const existingEndpoint = registeredEndpoints.find((e) => getEndpointSelectionValue(e) === selectedValue);

  if (!selectedValue || !existingEndpoint) {
    await replyInfoEmbed(selectInteraction, locale, {
      titleKey: "general.errors.invalid_option_title",
      descriptionKey: "general.errors.invalid_option_description",
      color: ColorCode.ERROR,
    });
    return;
  }

  // Step 2: reply with an endpoint summary embed + "Edit Fields" button.
  // (Modal submit → showModal is forbidden; we must use reply → button → showModal.)
  const summaryEmbed = buildEndpointSummaryEmbed(locale, existingEndpoint);
  const editButton = new ButtonBuilder()
    .setCustomId(EDIT_BUTTON_ID)
    .setLabel(localizer(locale, "commands.config.custom_models.edit.edit_fields_button"))
    .setStyle(ButtonStyle.Primary);
  const cancelButton = new ButtonBuilder()
    .setCustomId(CANCEL_BUTTON_ID)
    .setLabel(localizer(locale, "general.pagination.cancel"))
    .setStyle(ButtonStyle.Secondary);

  await selectInteraction.reply({
    embeds: [summaryEmbed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(editButton, cancelButton)],
    flags: MessageFlags.Ephemeral,
  });

  const summaryMessage = await selectInteraction.fetchReply();

  // Step 3: wait for the Edit Fields button click.
  let buttonInteraction: ButtonInteraction;
  try {
    buttonInteraction = await summaryMessage.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
      time: 300_000,
    });
  } catch {
    // Timed out or user ignored.
    await selectInteraction.editReply({ components: [] });
    return;
  }

  if (buttonInteraction.customId === CANCEL_BUTTON_ID) {
    await buttonInteraction.update({ components: [] });
    return;
  }

  // Step 4: from the button click, show the capability-specific edit modal (pre-filled).
  const extra = existingEndpoint.extra_config as Record<string, unknown>;
  const editModalCustomId = `custom_endpoint_edit_fields_${interaction.id}`;
  const editModal = buildCapabilityEditModal(existingEndpoint.capability, locale, editModalCustomId, {
    modelName: existingEndpoint.model_name,
    displayName: existingEndpoint.display_name,
    endpointUrl: existingEndpoint.endpoint_url,
    numCtx: existingEndpoint.num_ctx,
    hasTools: existingEndpoint.has_tools,
    seesImages: existingEndpoint.sees_images,
    supportsStructOutput: existingEndpoint.supports_structoutput,
    scriptMarkup: extra.script_markup as string | null,
    supportsInstruct: extra.supports_instruct as boolean | undefined,
    transcriptionModel: extra.model as string | null,
    transcriptionLanguage: extra.language as string | null,
  });

  let editModalSubmit: ModalSubmitInteraction;
  try {
    await buttonInteraction.showModal(editModal);
    editModalSubmit = await buttonInteraction.awaitModalSubmit({
      time: 600_000,
      filter: (i) => i.customId === editModalCustomId && i.user.id === interaction.user.id,
    });
  } catch {
    await selectInteraction.editReply({ components: [] });
    return;
  }

  // Step 5: defer the modal submit before async work.
  await editModalSubmit.deferUpdate();

  try {
    const rawFields: Record<string, string> = {};
    for (const id of Object.values(ModalFieldId)) {
      try {
        rawFields[id] = editModalSubmit.fields.getTextInputValue(id);
      } catch {
        rawFields[id] = "";
      }
    }

    const parsed = parseCapabilityModalFields(rawFields, existingEndpoint.capability);

    // Merge parsed values with existing, treating blank strings as "keep existing".
    const endpointUrl = parsed.endpointUrl || existingEndpoint.endpoint_url;
    const displayName = parsed.displayName || existingEndpoint.display_name;
    const modelName =
      parsed.modelName !== null
        ? parsed.modelName || existingEndpoint.model_name || null
        : (existingEndpoint.model_name ?? null);
    const numCtx = parsed.numCtx ?? existingEndpoint.num_ctx ?? null;
    const hasTools = rawFields[ModalFieldId.text_capabilities] ? parsed.hasTools : existingEndpoint.has_tools;
    const seesImages = rawFields[ModalFieldId.text_capabilities] ? parsed.seesImages : existingEndpoint.sees_images;
    const supportsStructOutput = rawFields[ModalFieldId.text_capabilities]
      ? parsed.supportsStructOutput
      : existingEndpoint.supports_structoutput;
    const authTokenProvided = Boolean(parsed.authToken);
    const authToken = authTokenProvided ? parsed.authToken : undefined;

    // Build extra_config (merge with existing).
    let extraConfig = { ...(existingEndpoint.extra_config as Record<string, unknown>) };
    if (existingEndpoint.capability === "speech") {
      extraConfig = {
        ...extraConfig,
        script_markup: parsed.scriptMarkup,
        supports_instruct: parsed.supportsInstruct,
      };
    } else if (existingEndpoint.capability === "transcription") {
      extraConfig = {
        ...extraConfig,
        model: parsed.transcriptionModel || (extra.model as string | null) || "whisper-1",
        language: parsed.transcriptionLanguage ?? (extra.language as string | null) ?? null,
      };
    }

    // Validate the new endpoint URL if it changed.
    if (endpointUrl !== existingEndpoint.endpoint_url) {
      const urlValidation = strictRemoteValidation
        ? await validateRemoteMcpUrl(endpointUrl, { strict: true })
        : await validateRemoteMcpUrl(endpointUrl);
      if (!urlValidation.valid) {
        await selectInteraction.editReply({
          embeds: [],
          components: [],
          content: localizer(locale, "commands.config.custom_models.validation.unreachable").replace(
            "{reason}",
            urlValidation.failureCode ?? "invalid_url",
          ),
        });
        return;
      }

      const reachability = await validateCustomEndpointReachability({
        apiStyle: existingEndpoint.api_style,
        endpointUrl,
        apiKey: authToken ?? null,
        strict: strictRemoteValidation,
      });
      if (!reachability.ok) {
        await selectInteraction.editReply({
          embeds: [],
          components: [],
          content: localizer(locale, "commands.config.custom_models.validation.unreachable").replace(
            "{reason}",
            reachability.reason,
          ),
        });
        return;
      }
    }

    const registered = await registerCustomEndpoint({
      scope,
      label: existingEndpoint.label,
      capability: existingEndpoint.capability,
      apiStyle: existingEndpoint.api_style,
      endpointUrl,
      displayName,
      modelName,
      authToken,
      numCtx,
      hasTools,
      seesImages,
      seesVideos: existingEndpoint.sees_videos,
      supportsStructOutput,
      extraConfig,
    });

    if (!registered) {
      await selectInteraction.editReply({
        embeds: [],
        components: [],
        content: localizer(locale, "general.errors.update_failed_description"),
      });
      return;
    }

    await onSuccess?.();

    await selectInteraction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(ColorCode.SUCCESS)
          .setTitle(localizer(locale, keys.successTitle))
          .setDescription(
            localizer(locale, keys.successDescription)
              .replace("{display_name}", displayName)
              .replace("{label}", existingEndpoint.label)
              .replace("{capability}", existingEndpoint.capability),
          ),
      ],
      components: [],
    });
  } catch (error) {
    log.error("Error in executeCustomEndpointEditCommand (fields modal)", error);
    await selectInteraction.editReply({
      embeds: [],
      components: [],
      content: localizer(locale, "general.errors.unknown_error_description"),
    });
  }
}
