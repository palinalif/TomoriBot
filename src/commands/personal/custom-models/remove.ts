import type { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags } from "discord.js";
import type { CustomEndpointCapability, ErrorContext, UserRow } from "@/types/db/schema";
import { getCachedTomoriState } from "@/utils/cache/tomoriStateCache";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { removeCustomEndpointRegistration } from "@/utils/provider/customEndpointService";
import { normalizeCustomEndpointLabel } from "@/utils/provider/customProviderUtils";
import { localizer } from "@/utils/text/localizer";

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("remove")
    .setDescription(localizer("en-US", "commands.personal.custom_models.remove.description"))
    .addStringOption((option) => option.setName("label").setDescription("Endpoint label").setRequired(true))
    .addStringOption((option) =>
      option
        .setName("capability")
        .setDescription("Capability")
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
  if (!userData.user_id) {
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
    const label = normalizeCustomEndpointLabel(interaction.options.getString("label", true));
    const capability = interaction.options.getString("capability", true) as CustomEndpointCapability;

    const removed = await removeCustomEndpointRegistration({
      scope: {
        kind: "personal",
        ownerId: userData.user_id,
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

    await replyInfoEmbed(interaction, locale, {
      titleKey: "commands.personal.custom_models.remove.success_title",
      descriptionKey: "commands.personal.custom_models.remove.success_description",
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
        command: "personal custom-models remove",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error("Error executing /personal custom-models remove", error as Error, context);
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
