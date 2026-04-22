import type { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags } from "discord.js";
import type { ErrorContext, UserRow } from "@/types/db/schema";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { registerOpenRouterModelForScope } from "@/utils/provider/openrouterModelRegistry";
import { localizer } from "@/utils/text/localizer";

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("add")
    .setDescription(localizer("en-US", "commands.personal.openrouter_models.add.description"))
    .addStringOption((option) =>
      option
        .setName("model_name")
        .setDescription(localizer("en-US", "commands.personal.openrouter_models.add.model_name_description"))
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

    const result = await registerOpenRouterModelForScope(
      {
        kind: "personal",
        ownerId: userData.user_id,
      },
      modelName,
    );

    switch (result.status) {
      case "invalid_model":
        await replyInfoEmbed(interaction, locale, {
          titleKey: "commands.personal.openrouter_models.add.not_found_title",
          descriptionKey: "commands.personal.openrouter_models.add.not_found_description",
          descriptionVars: { model_name: modelName },
          color: ColorCode.ERROR,
        });
        return;
      case "already_available":
        await replyInfoEmbed(interaction, locale, {
          titleKey: "commands.personal.openrouter_models.add.already_available_title",
          descriptionKey: "commands.personal.openrouter_models.add.already_available_description",
          descriptionVars: { model_name: result.llm.llm_codename },
          color: ColorCode.WARN,
        });
        return;
      case "already_registered":
        await replyInfoEmbed(interaction, locale, {
          titleKey: "commands.personal.openrouter_models.add.already_registered_title",
          descriptionKey: "commands.personal.openrouter_models.add.already_registered_description",
          descriptionVars: { model_name: result.llm.llm_codename },
          color: ColorCode.WARN,
        });
        return;
      case "registered":
        await replyInfoEmbed(interaction, locale, {
          titleKey: "commands.personal.openrouter_models.add.success_title",
          descriptionKey: "commands.personal.openrouter_models.add.success_description",
          descriptionVars: { model_name: result.llm.llm_codename },
          color: ColorCode.SUCCESS,
        });
        return;
    }
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      errorType: "CommandExecutionError",
      metadata: {
        command: "personal openrouter-models add",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error("Error executing /personal openrouter-models add", error as Error, context);
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
    });
  }
}
