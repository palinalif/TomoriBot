import { MessageFlags, type ButtonInteraction, type ChatInputCommandInteraction } from "discord.js";
import type { SavedProviderConfigRow } from "@/types/db/schema";
import { replyInfoEmbed, replyPaginatedChoices } from "@/utils/discord/interactionHelper";
import { ColorCode } from "@/utils/misc/logger";
import { getProviderDisplayName } from "@/utils/provider/providerInfoRegistry";

export interface SavedProviderSelectionResult {
  interaction: ChatInputCommandInteraction | ButtonInteraction;
  provider: string;
}

export async function promptForSavedProvider(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  locale: string,
  savedProviders: SavedProviderConfigRow[],
): Promise<SavedProviderSelectionResult | null> {
  if (savedProviders.length === 0) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "commands.config.model.providerPicker.no_providers_title",
      descriptionKey: "commands.config.model.providerPicker.no_providers_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }

  if (savedProviders.length === 1) {
    return {
      interaction,
      provider: savedProviders[0].provider.toLowerCase(),
    };
  }

  const providerLabels = savedProviders.map((savedProvider) => getProviderDisplayName(savedProvider.provider));
  const selectionResult = await replyPaginatedChoices(interaction, locale, {
    titleKey: "commands.config.model.providerPicker.title",
    descriptionKey: "commands.config.model.providerPicker.description",
    items: providerLabels,
    color: ColorCode.INFO,
    preserveSelectedInteraction: true,
    onSelect: async () => {},
  });

  if (!selectionResult.success || selectionResult.selectedIndex === undefined || !selectionResult.interaction) {
    return null;
  }

  return {
    interaction: selectionResult.interaction,
    provider: savedProviders[selectionResult.selectedIndex]?.provider.toLowerCase() ?? "",
  };
}
