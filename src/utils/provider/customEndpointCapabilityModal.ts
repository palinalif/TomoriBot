/**
 * Capability-specific modal builder and field parser for custom endpoint add/edit flows.
 *
 * Phase 4.5: replaces wide slash-option form with a two-step pattern:
 *   Add:  slash (routing fields) → showModal (capability detail fields)
 *   Edit: endpoint-select modal → reply(Edit button) → button → showModal (capability detail fields pre-filled)
 *
 * Discord modals allow max 5 TextInput rows. The field layout per capability is:
 *   text:          model_name, display_name, num_ctx, text_capabilities, endpoint_url
 *   embedding:     model_name, display_name, endpoint_url
 *   speech:        display_name, endpoint_url, auth_token, script_markup, supports_instruct
 *   transcription: display_name, endpoint_url, auth_token, transcription_model, transcription_language
 *   image/video:   display_name, endpoint_url, auth_token   (workflow_json stays as slash param)
 *
 * For the add flow, endpoint_url and auth_token come from the initial slash params, so the add
 * modal only contains the capability-specific advanced fields (model_name, display_name, etc.).
 * The edit modal includes endpoint_url and auth_token since those are also editable.
 */

import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import type { CustomEndpointCapability } from "@/types/db/schema";
import { localizer } from "@/utils/text/localizer";

/** Custom IDs for each modal text input field */
export const ModalFieldId = {
  model_name: "model_name",
  display_name: "display_name",
  num_ctx: "num_ctx",
  /** Comma-separated capability flags: "tools, vision, structoutput" */
  text_capabilities: "text_capabilities",
  script_markup: "script_markup",
  supports_instruct: "supports_instruct",
  transcription_model: "transcription_model",
  transcription_language: "transcription_language",
  endpoint_url: "endpoint_url",
  auth_token: "auth_token",
} as const;

/** Capabilities that need a detail modal after the initial slash submission (add flow). */
export function capabilityNeedsAddModal(capability: CustomEndpointCapability): boolean {
  return capability !== "image" && capability !== "video";
}

/** Parse a boolean text field ("yes"/"no"/"true"/"false"); blank returns `defaultVal`. */
function parseBoolField(value: string, defaultVal: boolean): boolean {
  const v = value.trim().toLowerCase();
  if (!v || v === "-") return defaultVal;
  return v !== "no" && v !== "false" && v !== "0";
}

/** Parse comma-separated capability flags from a text field. */
function parseCapabilityFlags(value: string): {
  hasTools: boolean;
  seesImages: boolean;
  supportsStructOutput: boolean;
} {
  const flags = new Set(
    value
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return {
    hasTools: flags.has("tools") || flags.has("tool"),
    seesImages: flags.has("vision") || flags.has("image"),
    supportsStructOutput: flags.has("structoutput") || flags.has("struct") || flags.has("structured"),
  };
}

/** Parse a context window integer; returns null if blank or invalid (<512). */
function parseNumCtxField(value: string): number | null {
  const v = value.trim();
  if (!v || v === "-") return null;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) || n < 512 ? null : n;
}

export interface ParsedCapabilityModalFields {
  modelName: string | null;
  displayName: string | null;
  endpointUrl: string | null;
  authToken: string | null;
  numCtx: number | null;
  hasTools: boolean;
  seesImages: boolean;
  supportsStructOutput: boolean;
  scriptMarkup: "plain" | "bracket-tags" | "emoji";
  supportsInstruct: boolean;
  transcriptionModel: string | null;
  transcriptionLanguage: string | null;
}

/**
 * Parse modal submission fields into typed values.
 * Missing fields default to safe values; blank strings return null.
 */
export function parseCapabilityModalFields(
  fields: Record<string, string>,
  capability: CustomEndpointCapability,
): ParsedCapabilityModalFields {
  const result: ParsedCapabilityModalFields = {
    modelName: null,
    displayName: fields[ModalFieldId.display_name]?.trim() || null,
    endpointUrl: fields[ModalFieldId.endpoint_url]?.trim() || null,
    authToken: fields[ModalFieldId.auth_token]?.trim() || null,
    numCtx: null,
    hasTools: false,
    seesImages: false,
    supportsStructOutput: false,
    scriptMarkup: "plain",
    supportsInstruct: false,
    transcriptionModel: null,
    transcriptionLanguage: null,
  };

  switch (capability) {
    case "text": {
      result.modelName = fields[ModalFieldId.model_name]?.trim() || null;
      result.numCtx = parseNumCtxField(fields[ModalFieldId.num_ctx] ?? "");
      const capFlags = parseCapabilityFlags(fields[ModalFieldId.text_capabilities] ?? "");
      result.hasTools = capFlags.hasTools;
      result.seesImages = capFlags.seesImages;
      result.supportsStructOutput = capFlags.supportsStructOutput;
      break;
    }
    case "embedding": {
      result.modelName = fields[ModalFieldId.model_name]?.trim() || null;
      break;
    }
    case "speech": {
      const markupRaw = fields[ModalFieldId.script_markup]?.trim().toLowerCase() ?? "";
      const validMarkup: Array<ParsedCapabilityModalFields["scriptMarkup"]> = ["bracket-tags", "emoji"];
      result.scriptMarkup = validMarkup.includes(markupRaw as (typeof validMarkup)[number])
        ? (markupRaw as ParsedCapabilityModalFields["scriptMarkup"])
        : "plain";
      result.supportsInstruct = parseBoolField(fields[ModalFieldId.supports_instruct] ?? "", false);
      break;
    }
    case "transcription": {
      result.transcriptionModel = fields[ModalFieldId.transcription_model]?.trim() || null;
      result.transcriptionLanguage = fields[ModalFieldId.transcription_language]?.trim() || null;
      break;
    }
    case "image":
    case "video":
      break;
  }

  return result;
}

/** Helper that calls setValue only when the value is a non-empty string. */
function setIfNonEmpty(input: TextInputBuilder, value: string | null | undefined): TextInputBuilder {
  if (value) input.setValue(value);
  return input;
}

/**
 * Build a capability-specific add modal (routing fields already captured via slash params).
 * Only shows advanced detail fields relevant to the chosen capability.
 */
export function buildCapabilityAddModal(
  capability: CustomEndpointCapability,
  locale: string,
  modalCustomId: string,
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle(localizer(locale, `commands.config.custom_models.capability_modal.${capability}_title`));

  switch (capability) {
    case "text": {
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(ModalFieldId.model_name)
            .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.model_name_label"))
            .setPlaceholder(localizer(locale, "commands.config.custom_models.capability_modal.model_name_placeholder"))
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(200),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(ModalFieldId.display_name)
            .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.display_name_label"))
            .setPlaceholder(
              localizer(locale, "commands.config.custom_models.capability_modal.display_name_placeholder"),
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(100),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(ModalFieldId.num_ctx)
            .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.num_ctx_label"))
            .setPlaceholder(localizer(locale, "commands.config.custom_models.capability_modal.num_ctx_placeholder"))
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(8),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(ModalFieldId.text_capabilities)
            .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.text_capabilities_label"))
            .setPlaceholder(
              localizer(locale, "commands.config.custom_models.capability_modal.text_capabilities_placeholder"),
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(60),
        ),
      );
      break;
    }
    case "embedding": {
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(ModalFieldId.model_name)
            .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.model_name_label"))
            .setPlaceholder(localizer(locale, "commands.config.custom_models.capability_modal.model_name_placeholder"))
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(200),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(ModalFieldId.display_name)
            .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.display_name_label"))
            .setPlaceholder(
              localizer(locale, "commands.config.custom_models.capability_modal.display_name_placeholder"),
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(100),
        ),
      );
      break;
    }
    case "speech": {
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(ModalFieldId.display_name)
            .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.display_name_label"))
            .setPlaceholder(
              localizer(locale, "commands.config.custom_models.capability_modal.display_name_placeholder"),
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(100),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(ModalFieldId.script_markup)
            .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.script_markup_label"))
            .setPlaceholder(
              localizer(locale, "commands.config.custom_models.capability_modal.script_markup_placeholder"),
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(20),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(ModalFieldId.supports_instruct)
            .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.supports_instruct_label"))
            .setPlaceholder(
              localizer(locale, "commands.config.custom_models.capability_modal.supports_instruct_placeholder"),
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(5),
        ),
      );
      break;
    }
    case "transcription": {
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(ModalFieldId.display_name)
            .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.display_name_label"))
            .setPlaceholder(
              localizer(locale, "commands.config.custom_models.capability_modal.display_name_placeholder"),
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(100),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(ModalFieldId.transcription_model)
            .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.transcription_model_label"))
            .setPlaceholder(
              localizer(locale, "commands.config.custom_models.capability_modal.transcription_model_placeholder"),
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId(ModalFieldId.transcription_language)
            .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.transcription_language_label"))
            .setPlaceholder(
              localizer(locale, "commands.config.custom_models.capability_modal.transcription_language_placeholder"),
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(10),
        ),
      );
      break;
    }
    case "image":
    case "video":
      // No modal: workflow_json is the only advanced field and it must be an attachment.
      break;
  }

  return modal;
}

export interface EditModalExistingValues {
  modelName?: string | null;
  displayName?: string | null;
  endpointUrl?: string | null;
  numCtx?: number | null;
  hasTools?: boolean;
  seesImages?: boolean;
  supportsStructOutput?: boolean;
  scriptMarkup?: string | null;
  supportsInstruct?: boolean;
  transcriptionModel?: string | null;
  transcriptionLanguage?: string | null;
}

/**
 * Build a capability-specific edit modal pre-filled with the endpoint's current values.
 * Includes endpoint_url and auth_token so the user can update routing fields too.
 * auth_token is omitted for text/embedding (5-row limit reached by more critical fields).
 */
export function buildCapabilityEditModal(
  capability: CustomEndpointCapability,
  locale: string,
  modalCustomId: string,
  existing: EditModalExistingValues,
): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle(localizer(locale, `commands.config.custom_models.capability_modal.${capability}_edit_title`));

  // 1. endpoint_url always editable (all capabilities)
  const urlInput = new TextInputBuilder()
    .setCustomId(ModalFieldId.endpoint_url)
    .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.endpoint_url_label"))
    .setPlaceholder(localizer(locale, "commands.config.custom_models.capability_modal.endpoint_url_placeholder"))
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(500);
  setIfNonEmpty(urlInput, existing.endpointUrl);

  switch (capability) {
    case "text": {
      // 5 rows: model_name, display_name, num_ctx, text_capabilities, endpoint_url
      const existingCaps: string[] = [];
      if (existing.hasTools) existingCaps.push("tools");
      if (existing.seesImages) existingCaps.push("vision");
      if (existing.supportsStructOutput) existingCaps.push("structoutput");

      const modelInput = new TextInputBuilder()
        .setCustomId(ModalFieldId.model_name)
        .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.model_name_label"))
        .setPlaceholder(localizer(locale, "commands.config.custom_models.capability_modal.model_name_placeholder"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(200);
      setIfNonEmpty(modelInput, existing.modelName);

      const displayInput = new TextInputBuilder()
        .setCustomId(ModalFieldId.display_name)
        .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.display_name_label"))
        .setPlaceholder(localizer(locale, "commands.config.custom_models.capability_modal.display_name_placeholder"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100);
      setIfNonEmpty(displayInput, existing.displayName);

      const numCtxInput = new TextInputBuilder()
        .setCustomId(ModalFieldId.num_ctx)
        .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.num_ctx_label"))
        .setPlaceholder(localizer(locale, "commands.config.custom_models.capability_modal.num_ctx_placeholder"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(8);
      if (existing.numCtx != null) numCtxInput.setValue(String(existing.numCtx));

      const capsInput = new TextInputBuilder()
        .setCustomId(ModalFieldId.text_capabilities)
        .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.text_capabilities_label"))
        .setPlaceholder(
          localizer(locale, "commands.config.custom_models.capability_modal.text_capabilities_placeholder"),
        )
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(60);
      if (existingCaps.length > 0) capsInput.setValue(existingCaps.join(", "));

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(modelInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(displayInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(numCtxInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(capsInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput),
      );
      break;
    }
    case "embedding": {
      // 3 rows: model_name, display_name, endpoint_url
      const modelInput = new TextInputBuilder()
        .setCustomId(ModalFieldId.model_name)
        .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.model_name_label"))
        .setPlaceholder(localizer(locale, "commands.config.custom_models.capability_modal.model_name_placeholder"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(200);
      setIfNonEmpty(modelInput, existing.modelName);

      const displayInput = new TextInputBuilder()
        .setCustomId(ModalFieldId.display_name)
        .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.display_name_label"))
        .setPlaceholder(localizer(locale, "commands.config.custom_models.capability_modal.display_name_placeholder"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100);
      setIfNonEmpty(displayInput, existing.displayName);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(modelInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(displayInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput),
      );
      break;
    }
    case "speech": {
      // 5 rows: display_name, endpoint_url, auth_token, script_markup, supports_instruct
      const displayInput = new TextInputBuilder()
        .setCustomId(ModalFieldId.display_name)
        .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.display_name_label"))
        .setPlaceholder(localizer(locale, "commands.config.custom_models.capability_modal.display_name_placeholder"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100);
      setIfNonEmpty(displayInput, existing.displayName);

      const authInput = new TextInputBuilder()
        .setCustomId(ModalFieldId.auth_token)
        .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.auth_token_label"))
        .setPlaceholder(localizer(locale, "commands.config.custom_models.capability_modal.auth_token_placeholder"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500);

      const markupInput = new TextInputBuilder()
        .setCustomId(ModalFieldId.script_markup)
        .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.script_markup_label"))
        .setPlaceholder(localizer(locale, "commands.config.custom_models.capability_modal.script_markup_placeholder"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(20);
      setIfNonEmpty(markupInput, existing.scriptMarkup);

      const instructInput = new TextInputBuilder()
        .setCustomId(ModalFieldId.supports_instruct)
        .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.supports_instruct_label"))
        .setPlaceholder(
          localizer(locale, "commands.config.custom_models.capability_modal.supports_instruct_placeholder"),
        )
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(5);
      if (existing.supportsInstruct != null) instructInput.setValue(existing.supportsInstruct ? "yes" : "no");

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(displayInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(authInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(markupInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(instructInput),
      );
      break;
    }
    case "transcription": {
      // 5 rows: display_name, endpoint_url, auth_token, transcription_model, transcription_language
      const displayInput = new TextInputBuilder()
        .setCustomId(ModalFieldId.display_name)
        .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.display_name_label"))
        .setPlaceholder(localizer(locale, "commands.config.custom_models.capability_modal.display_name_placeholder"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100);
      setIfNonEmpty(displayInput, existing.displayName);

      const authInput = new TextInputBuilder()
        .setCustomId(ModalFieldId.auth_token)
        .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.auth_token_label"))
        .setPlaceholder(localizer(locale, "commands.config.custom_models.capability_modal.auth_token_placeholder"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500);

      const tModelInput = new TextInputBuilder()
        .setCustomId(ModalFieldId.transcription_model)
        .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.transcription_model_label"))
        .setPlaceholder(
          localizer(locale, "commands.config.custom_models.capability_modal.transcription_model_placeholder"),
        )
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100);
      setIfNonEmpty(tModelInput, existing.transcriptionModel);

      const tLangInput = new TextInputBuilder()
        .setCustomId(ModalFieldId.transcription_language)
        .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.transcription_language_label"))
        .setPlaceholder(
          localizer(locale, "commands.config.custom_models.capability_modal.transcription_language_placeholder"),
        )
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(10);
      setIfNonEmpty(tLangInput, existing.transcriptionLanguage);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(displayInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(authInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(tModelInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(tLangInput),
      );
      break;
    }
    case "image":
    case "video": {
      // 3 rows: display_name, endpoint_url, auth_token
      const displayInput = new TextInputBuilder()
        .setCustomId(ModalFieldId.display_name)
        .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.display_name_label"))
        .setPlaceholder(localizer(locale, "commands.config.custom_models.capability_modal.display_name_placeholder"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100);
      setIfNonEmpty(displayInput, existing.displayName);

      const authInput = new TextInputBuilder()
        .setCustomId(ModalFieldId.auth_token)
        .setLabel(localizer(locale, "commands.config.custom_models.capability_modal.auth_token_label"))
        .setPlaceholder(localizer(locale, "commands.config.custom_models.capability_modal.auth_token_placeholder"))
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(displayInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(urlInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(authInput),
      );
      break;
    }
  }

  return modal;
}
