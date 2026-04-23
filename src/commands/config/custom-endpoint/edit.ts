import type { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags } from "discord.js";
import type { ErrorContext, UserRow } from "@/types/db/schema";
import { getCachedTomoriState, invalidateTomoriStateCache } from "@/utils/cache/tomoriStateCache";
import { loadCustomEndpointsForServer } from "@/utils/db/dbRead";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { executeCustomEndpointEditCommand } from "@/utils/provider/customEndpointEditCommand";
import { localizer } from "@/utils/text/localizer";

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("edit")
    .setDescription(localizer("en-US", "commands.config.custom_models.edit.description"))
    .addStringOption((option) =>
      option
        .setName("endpoint_url")
        .setDescription(localizer("en-US", "commands.config.custom_models.edit.endpoint_url_description"))
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("api_style")
        .setDescription(localizer("en-US", "commands.config.custom_models.edit.api_style_description"))
        .setRequired(false)
        .addChoices(
          { name: localizer("en-US", "general.api_styles.openai_compatible"), value: "openai-compatible" },
          { name: localizer("en-US", "general.api_styles.comfyui"), value: "comfyui" },
          { name: localizer("en-US", "general.api_styles.ollama_native"), value: "ollama-native" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("model_name")
        .setDescription(localizer("en-US", "commands.config.custom_models.edit.model_name_description"))
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("display_name")
        .setDescription(localizer("en-US", "commands.config.custom_models.edit.display_name_description"))
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("auth_token")
        .setDescription(localizer("en-US", "commands.config.custom_models.edit.auth_token_description"))
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName("num_ctx")
        .setDescription(localizer("en-US", "commands.config.custom_models.edit.num_ctx_description"))
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("has_tools")
        .setDescription(localizer("en-US", "commands.config.custom_models.edit.has_tools_description"))
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("sees_images")
        .setDescription(localizer("en-US", "commands.config.custom_models.edit.sees_images_description"))
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("supports_structoutput")
        .setDescription(localizer("en-US", "commands.config.custom_models.edit.supports_structoutput_description"))
        .setRequired(false),
    )
    .addAttachmentOption((option) =>
      option
        .setName("workflow_json")
        .setDescription(localizer("en-US", "commands.config.custom_models.edit.workflow_description"))
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
    await executeCustomEndpointEditCommand({
      interaction,
      locale,
      scope: {
        kind: "server",
        ownerId: tomoriState.server_id,
        baseConfig: tomoriState.config,
      },
      keys: {
        noneTitle: "commands.config.custom_models.edit.none_title",
        noneDescription: "commands.config.custom_models.edit.none_description",
        selectModalTitle: "commands.config.custom_models.edit.select_modal_title",
        selectLabel: "commands.config.custom_models.edit.select_label",
        selectDescription: "commands.config.custom_models.edit.select_description",
        selectPlaceholder: "commands.config.custom_models.edit.select_placeholder",
        noChangesTitle: "commands.config.custom_models.edit.no_changes_title",
        noChangesDescription: "commands.config.custom_models.edit.no_changes_description",
        successTitle: "commands.config.custom_models.edit.success_title",
        successDescription: "commands.config.custom_models.edit.success_description",
        validationUnreachable: "commands.config.custom_models.validation.unreachable",
        validationWorkflowRequired: "commands.config.custom_models.validation.workflow_required",
        validationModelNameRequired: "commands.config.custom_models.validation.model_name_required",
        capabilityText: "commands.config.custom_models.remove.capability_text",
        capabilityEmbedding: "commands.config.custom_models.remove.capability_embedding",
        capabilityImage: "commands.config.custom_models.remove.capability_image",
        capabilityVideo: "commands.config.custom_models.remove.capability_video",
      },
      strictRemoteValidation: false,
      loadEndpoints: loadCustomEndpointsForServer,
      onSuccess: () => {
        invalidateTomoriStateCache(interaction.guild?.id ?? interaction.user.id);
      },
    });
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      serverId: tomoriState.server_id,
      tomoriId: tomoriState.tomori_id,
      errorType: "CommandExecutionError",
      metadata: {
        command: "config custom-endpoint edit",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error("Error executing /config custom-endpoint edit", error as Error, context);
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
