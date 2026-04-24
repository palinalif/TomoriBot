import type { Attachment, ChatInputCommandInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import type {
  CustomEndpointApiStyle,
  CustomEndpointCapability,
  CustomEndpointRow,
  TomoriConfigRow,
} from "@/types/db/schema";
import type { SelectOption } from "@/types/discord/modal";
import { loadSavedProviderConfig, loadUserSavedProviderConfig } from "@/utils/db/dbRead";
import { promptWithPaginatedModal, replyInfoEmbed, safeSelectOptionText } from "@/utils/discord/interactionHelper";
import { CUSTOM_ENDPOINT_PLACEHOLDER_KEY } from "@/utils/discord/customProviderModal";
import { log, ColorCode } from "@/utils/misc/logger";
import { validateRemoteMcpUrl } from "@/utils/mcp/mcpUrlSecurity";
import { buildServerCustomProviderName, buildUserCustomProviderName } from "@/utils/provider/customProviderUtils";
import { registerCustomEndpoint, validateCustomEndpointReachability } from "@/utils/provider/customEndpointService";
import { decryptApiKey } from "@/utils/security/crypto";
import { localizer } from "@/utils/text/localizer";

const SELECT_MODAL_CUSTOM_ID = "custom_endpoint_edit_select_modal";
const ENDPOINT_SELECT_ID = "endpoint_select";

type RegistrationScope =
  | {
      kind: "server";
      ownerId: number;
      baseConfig: TomoriConfigRow;
    }
  | {
      kind: "personal";
      ownerId: number;
      baseConfig: TomoriConfigRow;
    };

interface ExecuteCustomEndpointEditOptions {
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
    noChangesTitle: string;
    noChangesDescription: string;
    successTitle: string;
    successDescription: string;
    validationUnreachable: string;
    validationWorkflowRequired: string;
    validationModelNameRequired: string;
    capabilityText: string;
    capabilityEmbedding: string;
    capabilityImage: string;
    capabilityVideo: string;
  };
  strictRemoteValidation: boolean;
  loadEndpoints: (ownerId: number) => Promise<CustomEndpointRow[]>;
  onSuccess?: () => void | Promise<void>;
}

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
    const description = `${getCapabilityLabel(locale, keys, endpoint.capability)} - ${endpoint.display_name}`;

    return {
      label: safeSelectOptionText(`${endpoint.label} - ${primaryName}`),
      value: getEndpointSelectionValue(endpoint),
      description: safeSelectOptionText(description),
    };
  });
}

async function resolveExistingAuthToken(scope: RegistrationScope, label: string): Promise<string | null> {
  const provider =
    scope.kind === "server"
      ? buildServerCustomProviderName(scope.ownerId, label)
      : buildUserCustomProviderName(scope.ownerId, label);
  const existingConfig =
    scope.kind === "server"
      ? await loadSavedProviderConfig(scope.ownerId, provider)
      : await loadUserSavedProviderConfig(scope.ownerId, provider);

  if (!existingConfig?.api_key) {
    return null;
  }

  const decryptedKey = await decryptApiKey(existingConfig.api_key, existingConfig.key_version || 1);
  return !decryptedKey || decryptedKey === CUSTOM_ENDPOINT_PLACEHOLDER_KEY ? null : decryptedKey;
}

function hasWorkflow(extraConfig: Record<string, unknown>): boolean {
  return Boolean(extraConfig.workflow);
}

function didCommandProvideChanges(interaction: ChatInputCommandInteraction): boolean {
  return (
    interaction.options.getString("endpoint_url") !== null ||
    interaction.options.getString("api_style") !== null ||
    interaction.options.getString("model_name") !== null ||
    interaction.options.getString("display_name") !== null ||
    interaction.options.getString("auth_token") !== null ||
    interaction.options.getInteger("num_ctx") !== null ||
    interaction.options.getBoolean("has_tools") !== null ||
    interaction.options.getBoolean("sees_images") !== null ||
    interaction.options.getBoolean("supports_structoutput") !== null ||
    interaction.options.getAttachment("workflow_json") !== null
  );
}

function isSameOptionalString(nextValue: string | null, existingValue: string | null | undefined): boolean {
  return (nextValue ?? null) === (existingValue ?? null);
}

function didMergedConfigChange(params: {
  existing: CustomEndpointRow;
  endpointUrl: string;
  apiStyle: CustomEndpointApiStyle;
  modelName: string | null;
  displayName: string;
  numCtx: number | null;
  hasTools: boolean;
  seesImages: boolean;
  supportsStructOutput: boolean;
  extraConfig: Record<string, unknown>;
  authTokenProvided: boolean;
}): boolean {
  return (
    params.authTokenProvided ||
    params.endpointUrl !== params.existing.endpoint_url ||
    params.apiStyle !== params.existing.api_style ||
    !isSameOptionalString(params.modelName, params.existing.model_name) ||
    params.displayName !== params.existing.display_name ||
    (params.numCtx ?? null) !== (params.existing.num_ctx ?? null) ||
    params.hasTools !== params.existing.has_tools ||
    params.seesImages !== params.existing.sees_images ||
    params.supportsStructOutput !== params.existing.supports_structoutput ||
    JSON.stringify(params.extraConfig) !== JSON.stringify(params.existing.extra_config ?? {})
  );
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

  const selectModalResult = await promptWithPaginatedModal(interaction, locale, {
    modalCustomId: `${SELECT_MODAL_CUSTOM_ID}_${scope.kind}`,
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

  const replyInteraction = selectModalResult.interaction;
  const selectedValue = selectModalResult.values?.[ENDPOINT_SELECT_ID];
  const existingEndpoint = registeredEndpoints.find(
    (endpoint) => getEndpointSelectionValue(endpoint) === selectedValue,
  );
  if (!selectedValue || !existingEndpoint) {
    await replyInfoEmbed(replyInteraction, locale, {
      titleKey: "general.errors.invalid_option_title",
      descriptionKey: "general.errors.invalid_option_description",
      color: ColorCode.ERROR,
    });
    return;
  }

  if (!didCommandProvideChanges(interaction)) {
    await replyInfoEmbed(replyInteraction, locale, {
      titleKey: keys.noChangesTitle,
      descriptionKey: keys.noChangesDescription,
      color: ColorCode.WARN,
    });
    return;
  }

  await replyInteraction.deferReply({ flags: MessageFlags.Ephemeral });

  const endpointUrlOption = interaction.options.getString("endpoint_url");
  const apiStyleOption = interaction.options.getString("api_style") as CustomEndpointApiStyle | null;
  const modelNameOption = interaction.options.getString("model_name");
  const displayNameOption = interaction.options.getString("display_name");
  const authTokenOption = interaction.options.getString("auth_token");
  const numCtxOption = interaction.options.getInteger("num_ctx");
  const hasToolsOption = interaction.options.getBoolean("has_tools");
  const seesImagesOption = interaction.options.getBoolean("sees_images");
  const supportsStructOutputOption = interaction.options.getBoolean("supports_structoutput");
  const workflowAttachment = interaction.options.getAttachment("workflow_json");

  const endpointUrl = endpointUrlOption?.trim() || existingEndpoint.endpoint_url;
  const apiStyle = apiStyleOption ?? existingEndpoint.api_style;
  const modelName = modelNameOption !== null ? modelNameOption.trim() || null : (existingEndpoint.model_name ?? null);
  const displayName = displayNameOption?.trim() || existingEndpoint.display_name;
  const numCtx = numCtxOption ?? existingEndpoint.num_ctx ?? null;
  const hasTools = hasToolsOption ?? existingEndpoint.has_tools;
  const seesImages = seesImagesOption ?? existingEndpoint.sees_images;
  const supportsStructOutput = supportsStructOutputOption ?? existingEndpoint.supports_structoutput;
  const uploadedWorkflow = await loadWorkflowJson(workflowAttachment);
  const extraConfig = workflowAttachment
    ? {
        ...(existingEndpoint.extra_config ?? {}),
        workflow: uploadedWorkflow,
      }
    : (existingEndpoint.extra_config ?? {});

  if (
    !didMergedConfigChange({
      existing: existingEndpoint,
      endpointUrl,
      apiStyle,
      modelName,
      displayName,
      numCtx,
      hasTools,
      seesImages,
      supportsStructOutput,
      extraConfig,
      authTokenProvided: authTokenOption !== null,
    })
  ) {
    await replyInfoEmbed(replyInteraction, locale, {
      titleKey: keys.noChangesTitle,
      descriptionKey: keys.noChangesDescription,
      color: ColorCode.WARN,
    });
    return;
  }

  if (endpointUrlOption !== null) {
    const urlValidation = strictRemoteValidation
      ? await validateRemoteMcpUrl(endpointUrl, { strict: true })
      : await validateRemoteMcpUrl(endpointUrl);
    if (!urlValidation.valid) {
      await replyInfoEmbed(replyInteraction, locale, {
        titleKey: "general.errors.custom_endpoint_unreachable_title",
        descriptionKey: keys.validationUnreachable,
        descriptionVars: {
          reason: urlValidation.failureCode ?? "invalid_url",
        },
        color: ColorCode.ERROR,
      });
      return;
    }
  }

  if (
    (existingEndpoint.capability === "image" || existingEndpoint.capability === "video") &&
    apiStyle === "comfyui" &&
    !hasWorkflow(extraConfig)
  ) {
    await replyInfoEmbed(replyInteraction, locale, {
      titleKey: "general.errors.invalid_option_title",
      descriptionKey: keys.validationWorkflowRequired,
      color: ColorCode.ERROR,
    });
    return;
  }

  if ((existingEndpoint.capability === "text" || existingEndpoint.capability === "embedding") && !modelName) {
    await replyInfoEmbed(replyInteraction, locale, {
      titleKey: "general.errors.invalid_option_title",
      descriptionKey: keys.validationModelNameRequired,
      color: ColorCode.ERROR,
    });
    return;
  }

  const remoteSettingsChanged = endpointUrlOption !== null || apiStyleOption !== null || authTokenOption !== null;
  if (remoteSettingsChanged) {
    let authTokenForValidation = authTokenOption?.trim() || null;

    if (!authTokenForValidation && existingEndpoint.requires_auth) {
      try {
        authTokenForValidation = await resolveExistingAuthToken(scope, existingEndpoint.label);
      } catch (error) {
        log.warn(`Failed to load existing auth token for custom endpoint ${existingEndpoint.label}`, error);
      }
    }

    const reachability = await validateCustomEndpointReachability({
      apiStyle,
      endpointUrl,
      apiKey: authTokenForValidation,
      strict: strictRemoteValidation,
    });
    if (!reachability.ok) {
      await replyInfoEmbed(replyInteraction, locale, {
        titleKey: "general.errors.custom_endpoint_unreachable_title",
        descriptionKey: keys.validationUnreachable,
        descriptionVars: {
          reason: reachability.reason,
        },
        color: ColorCode.ERROR,
      });
      return;
    }
  }

  const registered = await registerCustomEndpoint({
    scope,
    label: existingEndpoint.label,
    capability: existingEndpoint.capability,
    apiStyle,
    endpointUrl,
    displayName,
    modelName,
    authToken: authTokenOption ?? undefined,
    numCtx,
    hasTools,
    seesImages,
    seesVideos: existingEndpoint.sees_videos,
    supportsStructOutput,
    extraConfig,
  });

  if (!registered) {
    await replyInfoEmbed(replyInteraction, locale, {
      titleKey: "general.errors.update_failed_title",
      descriptionKey: "general.errors.update_failed_description",
      color: ColorCode.ERROR,
    });
    return;
  }

  await onSuccess?.();

  await replyInfoEmbed(replyInteraction, locale, {
    titleKey: keys.successTitle,
    descriptionKey: keys.successDescription,
    descriptionVars: {
      display_name: displayName,
      label: existingEndpoint.label,
      capability: existingEndpoint.capability,
    },
    color: ColorCode.SUCCESS,
  });
}
