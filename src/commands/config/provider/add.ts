import {
  MessageFlags,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type Client,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import { loadSavedProviderConfig, loadUniqueProviders } from "@/utils/db/dbRead";
import { upsertSavedProviderConfig } from "@/utils/db/dbWrite";
import { getCachedTomoriState } from "@/utils/cache/tomoriStateCache";
import { localizer } from "@/utils/text/localizer";
import { log, ColorCode } from "@/utils/misc/logger";
import { replyInfoEmbed, promptWithRawModal } from "@/utils/discord/interactionHelper";
import type { ErrorContext, UserRow } from "@/types/db/schema";
import type { ModalComponent, SelectOption } from "@/types/discord/modal";
import { ProviderFactory } from "@/utils/provider/providerFactory";
import { getProviderDisplayName } from "@/utils/provider/providerInfoRegistry";
import { encryptApiKey } from "@/utils/security/crypto";
import {
  CUSTOM_ENDPOINT_PLACEHOLDER_KEY,
  getCustomEndpointValidationMessage,
  isCustomProvider,
  promptCustomCapabilities,
} from "@/utils/discord/customProviderModal";
import { validateRemoteMcpUrl } from "@/utils/mcp/mcpUrlSecurity";
import { buildSavedProviderConfigFromExistingOrDefaults } from "@/utils/provider/savedProviderConfig";

const MODAL_CUSTOM_ID = "config_provider_add_modal";
const PROVIDER_SELECT_ID = "provider_select";
const API_KEY_INPUT_ID = "api_key_input";
const BEARER_TOKEN_INPUT_ID = "bearer_token_input";

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand.setName("add").setDescription(localizer("en-US", "commands.config.provider.add.description"));

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

  const serverId = interaction.guild?.id ?? interaction.user.id;
  const tomoriState = await getCachedTomoriState(serverId);
  if (!tomoriState) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.tomori_not_setup_title",
      descriptionKey: "general.errors.tomori_not_setup_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const uniqueProviders = (await loadUniqueProviders()) ?? [];
  if (!uniqueProviders.length) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "commands.config.api-key.set.no_providers_title",
      descriptionKey: "commands.config.api-key.set.no_providers_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const providerSelectOptions: SelectOption[] = uniqueProviders.map((provider) => ({
    label: getProviderDisplayName(provider),
    value: provider.toLowerCase(),
    description: undefined,
  }));

  let modalSubmitInteraction: import("discord.js").ModalSubmitInteraction | undefined;

  try {
    const modalComponents: ModalComponent[] = [
      {
        customId: PROVIDER_SELECT_ID,
        labelKey: "commands.config.provider.switch.provider_label",
        descriptionKey: "commands.config.provider.switch.provider_description",
        placeholder: "commands.config.provider.switch.provider_placeholder",
        required: true,
        options: providerSelectOptions,
      },
      {
        customId: API_KEY_INPUT_ID,
        labelKey: "commands.config.provider.switch.api_key_label",
        descriptionKey: "commands.config.provider.switch.api_key_description_with_custom",
        placeholder: "commands.config.provider.switch.api_key_placeholder",
        required: true,
        style: TextInputStyle.Short,
        maxLength: 200,
      },
      {
        customId: BEARER_TOKEN_INPUT_ID,
        labelKey: "commands.config.provider.switch.bearer_token_label",
        descriptionKey: "commands.config.provider.switch.bearer_token_description",
        placeholder: "commands.config.provider.switch.bearer_token_placeholder",
        required: false,
        style: TextInputStyle.Short,
        maxLength: 200,
      },
    ];

    const modalResult = await promptWithRawModal(
      interaction,
      locale,
      {
        modalCustomId: MODAL_CUSTOM_ID,
        modalTitleKey: "commands.config.provider.add.modal_title",
        components: modalComponents,
      },
      MessageFlags.Ephemeral,
    );

    if (modalResult.outcome !== "submit") {
      return;
    }

    modalSubmitInteraction = modalResult.interaction;
    const selectedProvider = modalResult.values?.[PROVIDER_SELECT_ID]?.trim().toLowerCase();
    const apiKeyInput = modalResult.values?.[API_KEY_INPUT_ID]?.trim();
    const bearerTokenInput = modalResult.values?.[BEARER_TOKEN_INPUT_ID]?.trim() || null;

    if (!modalSubmitInteraction || !selectedProvider || !apiKeyInput) {
      log.error("Provider add modal result unexpectedly missing interaction or values");
      return;
    }

    const existingConfig = await loadSavedProviderConfig(tomoriState.server_id, selectedProvider);
    let encryptedApiKey: Buffer | null;
    let keyVersion = 1;
    let customEndpointUrl: string | null = existingConfig?.custom_endpoint_url ?? null;
    let customModelName: string | null = existingConfig?.custom_model_name ?? null;
    let customNumCtx: number | null = existingConfig?.custom_num_ctx ?? null;
    let llmId: number | null | undefined = existingConfig?.llm_id ?? null;

    if (isCustomProvider(selectedProvider)) {
      const urlValidation = await validateRemoteMcpUrl(apiKeyInput);
      if (!urlValidation.valid) {
        const validationMessage = getCustomEndpointValidationMessage(urlValidation);
        await replyInfoEmbed(modalSubmitInteraction, locale, {
          titleKey: "commands.config.custom.endpoint_url_invalid_title",
          descriptionKey: validationMessage.descriptionKey,
          descriptionVars: validationMessage.descriptionVars,
          color: ColorCode.ERROR,
        });
        return;
      }

      customEndpointUrl = apiKeyInput;

      const capabilitiesResult = await promptCustomCapabilities(modalSubmitInteraction, locale, serverId);
      if (!capabilitiesResult.success) {
        await replyInfoEmbed(modalSubmitInteraction, locale, {
          titleKey: "general.errors.operation_failed_title",
          description: capabilitiesResult.error || localizer(locale, "commands.config.custom.capabilities_timeout"),
          color: ColorCode.ERROR,
        });
        return;
      }

      llmId = capabilitiesResult.llmId ?? llmId;
      customModelName = capabilitiesResult.modelName ?? customModelName;
      customNumCtx = capabilitiesResult.numCtx ?? customNumCtx;

      if (bearerTokenInput && bearerTokenInput.length >= 8) {
        const tokenResult = await encryptApiKey(bearerTokenInput);
        encryptedApiKey = tokenResult.encrypted;
        keyVersion = tokenResult.version;
      } else {
        const placeholderResult = await encryptApiKey(CUSTOM_ENDPOINT_PLACEHOLDER_KEY);
        encryptedApiKey = placeholderResult.encrypted;
        keyVersion = placeholderResult.version;
      }
    } else {
      if (apiKeyInput.length < 10) {
        await replyInfoEmbed(modalSubmitInteraction, locale, {
          titleKey: "commands.config.api-key.set.invalid_key_title",
          descriptionKey: "commands.config.api-key.set.invalid_key_description",
          color: ColorCode.ERROR,
        });
        return;
      }

      let validationResult: Awaited<
        ReturnType<Awaited<ReturnType<typeof ProviderFactory.getProviderByName>>["validateApiKey"]>
      > = { valid: false };
      let providerInstance: Awaited<ReturnType<typeof ProviderFactory.getProviderByName>> | undefined;
      try {
        providerInstance = await ProviderFactory.getProviderByName(selectedProvider);
        validationResult = await providerInstance.validateApiKey(apiKeyInput);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("Unsupported provider")) {
          await replyInfoEmbed(modalSubmitInteraction, locale, {
            titleKey: "commands.config.api-key.set.unsupported_provider_title",
            descriptionKey: "commands.config.api-key.set.unsupported_provider_description",
            descriptionVars: {
              provider: selectedProvider,
            },
            color: ColorCode.ERROR,
          });
        } else {
          await replyInfoEmbed(modalSubmitInteraction, locale, {
            titleKey: "commands.config.api-key.set.validation_error_title",
            descriptionKey: "commands.config.api-key.set.validation_error_description",
            color: ColorCode.ERROR,
          });
        }
        return;
      }

      if (!validationResult.valid) {
        let errorDescription = "API key validation failed";
        if (validationResult.error) {
          try {
            if (providerInstance) {
              errorDescription =
                providerInstance.formatErrorDescription(validationResult.error, locale) ??
                `Error ${validationResult.error.code ?? "unknown"}: ${validationResult.error.message}`;
            }
          } catch (providerError) {
            log.warn("Failed to format provider validation error description", providerError);
          }
        }

        await replyInfoEmbed(modalSubmitInteraction, locale, {
          titleKey: "commands.config.api-key.set.key_validation_failed_title",
          description: errorDescription,
          color: ColorCode.ERROR,
        });
        return;
      }

      const encryptionResult = await encryptApiKey(apiKeyInput);
      encryptedApiKey = encryptionResult.encrypted;
      keyVersion = encryptionResult.version;
    }

    const savedConfig = await buildSavedProviderConfigFromExistingOrDefaults({
      serverId: tomoriState.server_id,
      provider: selectedProvider,
      apiKey: encryptedApiKey,
      keyVersion,
      baseConfig: tomoriState.config,
      existingConfig,
      llmId,
      customEndpointUrl,
      customModelName,
      customNumCtx,
    });

    const upserted = await upsertSavedProviderConfig(tomoriState.server_id, savedConfig);
    if (!upserted) {
      await replyInfoEmbed(modalSubmitInteraction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    await replyInfoEmbed(modalSubmitInteraction, locale, {
      titleKey: "commands.config.provider.add.success_title",
      descriptionKey: existingConfig
        ? "commands.config.provider.add.updated_existing"
        : "commands.config.provider.add.success",
      descriptionVars: {
        provider: getProviderDisplayName(selectedProvider),
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
        command: "config provider add",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error(`Error executing /config provider add for user ${userData.user_disc_id}`, error as Error, context);

    await replyInfoEmbed(modalSubmitInteraction ?? interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
