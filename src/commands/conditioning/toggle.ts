import type { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags } from "discord.js";
import type { UserRow } from "@/types/db/schema";
import { localizer } from "@/utils/text/localizer";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { ColorCode } from "@/utils/misc/logger";
import { invalidateTomoriStateCache } from "@/utils/cache/tomoriStateCache";
import { setPersonaConditioningEnabled } from "@/utils/db/conditioningDb";
import {
  getConditioningTypeOption,
  hasManageGuildPermission,
  selectConditioningPersona,
} from "@/utils/conditioning/conditioningCommandHelper";

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("toggle")
    .setDescription(localizer("en-US", "commands.conditioning.toggle.description"))
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription(localizer("en-US", "commands.conditioning.toggle.type_description"))
        .setRequired(true)
        .addChoices(
          { name: localizer("en-US", "commands.conditioning.toggle.type_choice_reward"), value: "reward" },
          { name: localizer("en-US", "commands.conditioning.toggle.type_choice_punish"), value: "punish" },
        ),
    )
    .addBooleanOption((option) =>
      option
        .setName("enabled")
        .setDescription(localizer("en-US", "commands.conditioning.toggle.enabled_description"))
        .setRequired(true),
    );

export async function execute(
  _client: Client,
  interaction: ChatInputCommandInteraction,
  _userData: UserRow,
  locale: string,
): Promise<void> {
  if (!hasManageGuildPermission(interaction)) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.permission_denied_title",
      descriptionKey: "general.errors.permission_denied_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const selection = await selectConditioningPersona(interaction, locale);
  if (!selection) return;

  const conditioningType = getConditioningTypeOption(interaction);
  const enabled = interaction.options.getBoolean("enabled", true);
  const currentEnabled =
    conditioningType === "reward"
      ? selection.persona.reward_conditioning_enabled
      : selection.persona.punish_conditioning_enabled;

  if (currentEnabled === enabled) {
    await replyInfoEmbed(selection.interaction, locale, {
      titleKey: "commands.conditioning.toggle.already_title",
      descriptionKey: enabled
        ? "commands.conditioning.toggle.already_enabled_description"
        : "commands.conditioning.toggle.already_disabled_description",
      descriptionVars: {
        persona_name: selection.persona.tomori_nickname,
        type_label: localizer(locale, `commands.conditioning.shared.type_${conditioningType}`),
      },
      color: ColorCode.INFO,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!selection.persona.tomori_id) {
    await replyInfoEmbed(selection.interaction, locale, {
      titleKey: "general.errors.operation_failed_title",
      descriptionKey: "general.errors.operation_failed_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const success = await setPersonaConditioningEnabled(selection.persona.tomori_id, conditioningType, enabled);
  if (!success) {
    await replyInfoEmbed(selection.interaction, locale, {
      titleKey: "general.errors.update_failed_title",
      descriptionKey: "general.errors.update_failed_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.guildId) {
    invalidateTomoriStateCache(interaction.guildId);
  }

  await replyInfoEmbed(selection.interaction, locale, {
    titleKey: "commands.conditioning.toggle.success_title",
    descriptionKey: enabled
      ? "commands.conditioning.toggle.enabled_success_description"
      : "commands.conditioning.toggle.disabled_success_description",
    descriptionVars: {
      persona_name: selection.persona.tomori_nickname,
      type_label: localizer(locale, `commands.conditioning.shared.type_${conditioningType}`),
    },
    color: ColorCode.SUCCESS,
    flags: MessageFlags.Ephemeral,
  });
}
