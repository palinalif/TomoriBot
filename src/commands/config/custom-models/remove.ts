import type { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags } from "discord.js";
import type { CustomEndpointCapability, ErrorContext, UserRow } from "@/types/db/schema";
import { getCachedTomoriState, invalidateTomoriStateCache } from "@/utils/cache/tomoriStateCache";
import { sql } from "@/utils/db/client";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { removeCustomEndpointRegistration } from "@/utils/provider/customEndpointService";
import { buildServerCustomProviderName, normalizeCustomEndpointLabel } from "@/utils/provider/customProviderUtils";
import { localizer } from "@/utils/text/localizer";

async function resolveCurrentProvider(serverId: number, capability: CustomEndpointCapability): Promise<string | null> {
  switch (capability) {
    case "text":
    case "image":
    case "embedding":
    case "video": {
      const [row] =
        capability === "text"
          ? await sql`SELECT llm_provider AS provider FROM llms WHERE llm_id = (SELECT llm_id FROM tomori_configs WHERE server_id = ${serverId}) LIMIT 1`
          : capability === "image"
            ? await sql`SELECT provider FROM image_diffusion_models WHERE diffusion_model_id = (SELECT diffusion_model_id FROM tomori_configs WHERE server_id = ${serverId}) LIMIT 1`
            : capability === "embedding"
              ? await sql`SELECT provider FROM embedding_models WHERE embedding_model_id = (SELECT embedding_model_id FROM tomori_configs WHERE server_id = ${serverId}) LIMIT 1`
              : await sql`SELECT provider FROM video_generation_models WHERE video_model_id = (SELECT video_model_id FROM tomori_configs WHERE server_id = ${serverId}) LIMIT 1`;
      return row?.provider ? String(row.provider).toLowerCase() : null;
    }
  }
}

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("remove")
    .setDescription(localizer("en-US", "commands.config.custom_models.remove.description"))
    .addStringOption((option) =>
      option
        .setName("label")
        .setDescription(localizer("en-US", "commands.config.custom_models.remove.label_description"))
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("capability")
        .setDescription(localizer("en-US", "commands.config.custom_models.remove.capability_description"))
        .setRequired(true)
        .addChoices(
          { name: "Text", value: "text" },
          { name: "Embedding", value: "embedding" },
          { name: "Image", value: "image" },
          { name: "Video", value: "video" },
        ),
    );

export async function execute(
  _client: Client,
  interaction: ChatInputCommandInteraction,
  userData: UserRow,
  locale: string,
): Promise<void> {
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
    const label = normalizeCustomEndpointLabel(interaction.options.getString("label", true));
    const capability = interaction.options.getString("capability", true) as CustomEndpointCapability;
    const provider = buildServerCustomProviderName(tomoriState.server_id, label);
    const currentProvider = await resolveCurrentProvider(tomoriState.server_id, capability);

    const removed = await removeCustomEndpointRegistration({
      scope: {
        kind: "server",
        ownerId: tomoriState.server_id,
        baseConfig: tomoriState.config,
      },
      label,
      capability,
    });

    if (!removed) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.invalid_option_title",
        descriptionKey: "commands.config.custom_models.remove.not_found",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (currentProvider === provider) {
      switch (capability) {
        case "text":
          await sql`
						UPDATE tomori_configs
						SET llm_id = NULL,
						    custom_endpoint_url = NULL,
						    custom_model_name = NULL,
						    custom_num_ctx = NULL,
						    vision_llm_id = CASE WHEN vision_llm_id = llm_id THEN NULL ELSE vision_llm_id END
						WHERE server_id = ${tomoriState.server_id}
					`;
          break;
        case "embedding":
          await sql`UPDATE tomori_configs SET embedding_model_id = NULL WHERE server_id = ${tomoriState.server_id}`;
          break;
        case "image":
          await sql`UPDATE tomori_configs SET diffusion_model_id = NULL WHERE server_id = ${tomoriState.server_id}`;
          break;
        case "video":
          await sql`UPDATE tomori_configs SET video_model_id = NULL WHERE server_id = ${tomoriState.server_id}`;
          break;
      }
    }

    invalidateTomoriStateCache(interaction.guild?.id ?? interaction.user.id);
    await replyInfoEmbed(interaction, locale, {
      titleKey: "commands.config.custom_models.remove.success_title",
      descriptionKey: "commands.config.custom_models.remove.success_description",
      descriptionVars: {
        label,
        capability,
      },
      color: ColorCode.SUCCESS,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      serverId: tomoriState.server_id,
      tomoriId: tomoriState.tomori_id,
      errorType: "CommandExecutionError",
      metadata: {
        command: "config custom-models remove",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error("Error executing /config custom-models remove", error as Error, context);
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
