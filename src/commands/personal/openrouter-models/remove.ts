import type { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags } from "discord.js";
import type { ErrorContext, UserRow } from "@/types/db/schema";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { removeOpenRouterModelForScope } from "@/utils/provider/openrouterModelRegistry";
import { localizer } from "@/utils/text/localizer";

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("remove")
    .setDescription(localizer("en-US", "commands.personal.openrouter_models.remove.description"))
    .addStringOption((option) =>
      option
        .setName("model_name")
        .setDescription(localizer("en-US", "commands.personal.openrouter_models.remove.model_name_description"))
        .setRequired(true),
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

  try {
    const modelName = interaction.options.getString("model_name", true).trim();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await removeOpenRouterModelForScope(
      {
        kind: "personal",
        ownerId: userData.user_id,
      },
      modelName,
    );

    switch (result.status) {
      case "not_found":
        await replyInfoEmbed(interaction, locale, {
          titleKey: "general.errors.invalid_option_title",
          descriptionKey: "commands.personal.openrouter_models.remove.not_found_description",
          descriptionVars: { model_name: modelName },
          color: ColorCode.ERROR,
        });
        return;
      case "already_available":
        await replyInfoEmbed(interaction, locale, {
          titleKey: "commands.personal.openrouter_models.remove.already_available_title",
          descriptionKey: "commands.personal.openrouter_models.remove.already_available_description",
          descriptionVars: { model_name: modelName },
          color: ColorCode.WARN,
        });
        return;
      case "removed":
        await replyInfoEmbed(interaction, locale, {
          titleKey: "commands.personal.openrouter_models.remove.success_title",
          descriptionKey: result.stillReferenced
            ? "commands.personal.openrouter_models.remove.success_still_referenced_description"
            : "commands.personal.openrouter_models.remove.success_description",
          descriptionVars: { model_name: modelName },
          color: ColorCode.SUCCESS,
        });
        return;
    }
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      errorType: "CommandExecutionError",
      metadata: {
        command: "personal openrouter-models remove",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error("Error executing /personal openrouter-models remove", error as Error, context);
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
    });
  }
}
