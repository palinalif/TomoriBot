import type { Attachment, ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags } from "discord.js";
import type { CustomEndpointApiStyle, CustomEndpointCapability, ErrorContext, UserRow } from "@/types/db/schema";
import { getCachedTomoriState, invalidateTomoriStateCache } from "@/utils/cache/tomoriStateCache";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { validateRemoteMcpUrl } from "@/utils/mcp/mcpUrlSecurity";
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

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("add")
    .setDescription(localizer("en-US", "commands.config.custom_models.add.description"))
    .addStringOption((option) =>
      option
        .setName("endpoint_url")
        .setDescription(localizer("en-US", "commands.config.custom_models.add.endpoint_url_description"))
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("endpoint_label")
        .setDescription(localizer("en-US", "commands.config.custom_models.add.label_description"))
        .setRequired(true),
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
        ),
    )
    .addStringOption((option) =>
      option
        .setName("model_name")
        .setDescription(localizer("en-US", "commands.config.custom_models.add.model_name_description"))
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
        ),
    )
    .addStringOption((option) =>
      option
        .setName("display_name")
        .setDescription(localizer("en-US", "commands.config.custom_models.add.display_name_description"))
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("auth_token")
        .setDescription(localizer("en-US", "commands.config.custom_models.add.auth_token_description"))
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName("num_ctx")
        .setDescription(localizer("en-US", "commands.config.custom_models.add.num_ctx_description"))
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("has_tools")
        .setDescription(localizer("en-US", "commands.config.custom_models.add.has_tools_description"))
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("sees_images")
        .setDescription(localizer("en-US", "commands.config.custom_models.add.sees_images_description"))
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("supports_structoutput")
        .setDescription(localizer("en-US", "commands.config.custom_models.add.supports_structoutput_description"))
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

  try {
    const rawLabel = interaction.options.getString("endpoint_label", true);
    const label = normalizeCustomEndpointLabel(rawLabel);
    const capability = interaction.options.getString("capability", true) as CustomEndpointCapability;
    const apiStyle = interaction.options.getString("api_style", true) as CustomEndpointApiStyle;
    const endpointUrl = interaction.options.getString("endpoint_url", true).trim();
    const rawModelName = interaction.options.getString("model_name", true);
    const displayName = interaction.options.getString("display_name")?.trim() || rawModelName.trim();
    const authToken = interaction.options.getString("auth_token");
    const numCtx = interaction.options.getInteger("num_ctx");
    const hasTools = interaction.options.getBoolean("has_tools") ?? false;
    const seesImages = interaction.options.getBoolean("sees_images") ?? false;
    const supportsStructOutput = interaction.options.getBoolean("supports_structoutput") ?? false;
    const workflowAttachment = interaction.options.getAttachment("workflow_json");

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
        descriptionVars: {
          reason: urlValidation.failureCode ?? "invalid_url",
        },
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if ((capability === "image" || capability === "video") && apiStyle === "comfyui" && !workflowAttachment) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.invalid_option_title",
        descriptionKey: "commands.config.custom_models.validation.workflow_required",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modelName = rawModelName.trim();

    if ((capability === "text" || capability === "embedding") && !modelName) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.invalid_option_title",
        descriptionKey: "commands.config.custom_models.validation.model_name_required",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const extraConfig = workflowAttachment ? { workflow: await loadWorkflowJson(workflowAttachment) } : {};
    const reachability = await validateCustomEndpointReachability({
      apiStyle,
      endpointUrl,
      apiKey: authToken,
    });
    if (!reachability.ok) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.custom_endpoint_unreachable_title",
        descriptionKey: "commands.config.custom_models.validation.unreachable",
        descriptionVars: {
          reason: reachability.reason,
        },
        color: ColorCode.ERROR,
      });
      return;
    }

    const registered = await registerCustomEndpoint({
      scope: {
        kind: "server",
        ownerId: tomoriState.server_id,
        baseConfig: tomoriState.config,
      },
      label,
      capability,
      apiStyle,
      endpointUrl,
      displayName,
      modelName: modelName || null,
      authToken,
      numCtx,
      hasTools,
      seesImages,
      supportsStructOutput,
      extraConfig,
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
      descriptionVars: {
        display_name: displayName,
        label,
        capability,
      },
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
    await log.error("Error executing /config custom-endpoint add", error as Error, context);
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
