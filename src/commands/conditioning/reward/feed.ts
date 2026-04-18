import { createConditioningInteractionCommand } from "@/utils/conditioning/conditioningInteractionCommand";
import { localizer } from "@/utils/text/localizer";
import { CONDITIONING_REASON_MAX_LENGTH } from "@/utils/conditioning/conditioning";

export const { configureSubcommand, execute } = createConditioningInteractionCommand("reward", "feed", {
  configureExtraOptions: (subcommand) =>
    subcommand.addStringOption((option) =>
      option
        .setName("food")
        .setDescription(localizer("en-US", "commands.reward.feed.food_description"))
        .setMaxLength(CONDITIONING_REASON_MAX_LENGTH)
        .setRequired(false),
    ),
  getExtraContext: (interaction) => {
    const food = interaction.options.getString("food")?.trim();
    return {
      food_text: food ? ` \`${food}\`` : "",
    };
  },
});
