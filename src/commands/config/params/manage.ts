import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
  type ModalSubmitInteraction,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import type { CheckboxGroupOption, ModalCheckboxGroupField } from "@/types/discord/modal";
import type { ErrorContext, TomoriConfigRow, UserRow } from "@/types/db/schema";
import { tomoriConfigSchema } from "@/types/db/schema";
import {
  SUPPORTED_PARAM_CONFIG_KEYS,
  SUPPORTED_PARAM_STATUS_FIELD_KEYS,
  SUPPORTED_PARAM_VALUES,
  type SupportedParamValue,
  isSupportedParamValue,
} from "@/constants/supportedParams";
import { getCachedTomoriState, invalidateTomoriStateCache } from "@/utils/cache/tomoriStateCache";
import { sql } from "@/utils/db/client";
import { promptWithRawModal, replyInfoEmbed, safeSelectOptionText } from "@/utils/discord/interactionHelper";
import { log, ColorCode } from "@/utils/misc/logger";
import { getProviderDisplayName, getStaticProviderInfo } from "@/utils/provider/providerInfoRegistry";
import { isActiveSamplingParam, selectAnthropicSamplingParams } from "@/utils/provider/samplingControl";
import { localizer } from "@/utils/text/localizer";

const CHECKBOX_ID_PREFIX = "config_params_manage_group";
const MAX_OPTIONS_PER_GROUP = 10;

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand.setName("manage").setDescription(localizer("en-US", "commands.config.params.manage.description"));

export async function execute(
  _client: Client,
  interaction: ChatInputCommandInteraction,
  userData: UserRow,
  locale: string,
): Promise<void> {
  const modalCustomId = `config_params_manage_modal_${interaction.id}`;
  let modalInteraction: ModalSubmitInteraction | null = null;

  if (!interaction.guild || !interaction.channel) {
    await replyInfoEmbed(interaction, userData.language_pref, {
      titleKey: "general.errors.guild_only_title",
      descriptionKey: "general.errors.guild_only_description",
      color: ColorCode.ERROR,
    });
    return;
  }

  try {
    const tomoriState = await getCachedTomoriState(interaction.guild.id);
    if (!tomoriState) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.tomori_not_setup_title",
        descriptionKey: "general.errors.tomori_not_setup_description",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const providerName = tomoriState.llm.llm_provider;
    const providerDisplayName = getProviderDisplayName(providerName);
    const providerInfo = getStaticProviderInfo(providerName);
    const checkboxGroups = buildCheckboxGroups(
      locale,
      providerName,
      tomoriState.config,
      tomoriState.config.llm_disabled_params ?? [],
      providerDisplayName,
      new Set(providerInfo?.supportedParams ?? []),
    );

    const modalResult = await promptWithRawModal(
      interaction,
      locale,
      {
        modalCustomId,
        modalTitleKey: "commands.config.params.manage.modal_title",
        components: checkboxGroups,
      },
      MessageFlags.Ephemeral,
    );

    if (modalResult.outcome !== "submit") {
      return;
    }

    if (!modalResult.interaction) {
      log.error("Config params manage modal unexpectedly missing interaction");
      return;
    }
    modalInteraction = modalResult.interaction;

    const selectedParams = collectCheckedParams(modalResult.multiValues, checkboxGroups.length);
    const nextDisabledParams = SUPPORTED_PARAM_VALUES.filter((param) => !selectedParams.has(param));
    const previousDisabledParams = new Set<SupportedParamValue>(tomoriState.config.llm_disabled_params ?? []);
    const nextDisabledSet = new Set<SupportedParamValue>(nextDisabledParams);
    const hasChanges = SUPPORTED_PARAM_VALUES.some(
      (param) => previousDisabledParams.has(param) !== nextDisabledSet.has(param),
    );

    if (!hasChanges) {
      await replyInfoEmbed(modalInteraction, locale, {
        titleKey: "commands.config.params.manage.no_changes_title",
        descriptionKey: "commands.config.params.manage.no_changes_description",
        descriptionVars: {
          provider: providerDisplayName,
        },
        color: ColorCode.INFO,
      });
      return;
    }

    const [updatedRow] = await sql`
      UPDATE tomori_configs
      SET llm_disabled_params = ${formatTextArrayLiteral(nextDisabledParams)}::text[]
      WHERE server_id = ${tomoriState.server_id}
      RETURNING *
    `;

    if (!updatedRow) {
      const context: ErrorContext = {
        userId: userData.user_id,
        serverId: tomoriState.server_id,
        tomoriId: tomoriState.tomori_id,
        errorType: "DatabaseUpdateError",
        metadata: {
          command: "config params manage",
          provider: providerName,
          disabledParams: nextDisabledParams,
        },
      };
      await log.error("Failed to update omitted LLM params", new Error("Database update failed"), context);
      await replyInfoEmbed(modalInteraction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    const validatedConfig = tomoriConfigSchema.safeParse(updatedRow);
    if (!validatedConfig.success) {
      const context: ErrorContext = {
        userId: userData.user_id,
        serverId: tomoriState.server_id,
        tomoriId: tomoriState.tomori_id,
        errorType: "SchemaValidationError",
        metadata: {
          command: "config params manage",
          provider: providerName,
          validationErrors: validatedConfig.error.flatten(),
        },
      };
      await log.error("Failed to validate updated omitted LLM params", validatedConfig.error, context);
      await replyInfoEmbed(modalInteraction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    invalidateTomoriStateCache(interaction.guild.id);

    const enabledParams = SUPPORTED_PARAM_VALUES.filter((param) => !nextDisabledSet.has(param));
    await replyInfoEmbed(modalInteraction, locale, {
      titleKey: "commands.config.params.manage.success_title",
      descriptionKey: "commands.config.params.manage.success_description",
      descriptionVars: {
        provider: providerDisplayName,
        enabled_count: enabledParams.length.toString(),
        enabled_list: formatParamList(locale, enabledParams),
        omitted_count: nextDisabledParams.length.toString(),
        omitted_list: formatParamList(locale, nextDisabledParams),
      },
      color: ColorCode.SUCCESS,
    });
  } catch (error) {
    let serverIdForError: number | null = null;
    let tomoriIdForError: number | null = null;
    if (interaction.guild?.id) {
      const state = await getCachedTomoriState(interaction.guild.id);
      serverIdForError = state?.server_id ?? null;
      tomoriIdForError = state?.tomori_id ?? null;
    }

    const context: ErrorContext = {
      userId: userData.user_id,
      serverId: serverIdForError,
      tomoriId: tomoriIdForError,
      errorType: "CommandExecutionError",
      metadata: {
        command: "config params manage",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error(`Error executing /config params manage for user ${userData.user_disc_id}`, error as Error, context);

    await replyInfoEmbed(modalInteraction ?? interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}

function buildCheckboxGroups(
  locale: string,
  providerName: string,
  config: TomoriConfigRow,
  disabledParams: SupportedParamValue[],
  providerDisplayName: string,
  supportedParams: ReadonlySet<SupportedParamValue>,
): ModalCheckboxGroupField[] {
  const disabledSet = new Set<SupportedParamValue>(disabledParams);
  const checkboxGroups: ModalCheckboxGroupField[] = [];
  const checkboxDescriptionKey =
    providerName === "anthropic"
      ? "commands.config.params.manage.checkbox_description_anthropic"
      : "commands.config.params.manage.checkbox_description";

  for (let index = 0; index < SUPPORTED_PARAM_VALUES.length; index += MAX_OPTIONS_PER_GROUP) {
    const chunk = SUPPORTED_PARAM_VALUES.slice(index, index + MAX_OPTIONS_PER_GROUP);
    const groupIndex = Math.floor(index / MAX_OPTIONS_PER_GROUP);
    const options: CheckboxGroupOption[] = chunk.map((param) => ({
      label: safeSelectOptionText(localizer(locale, SUPPORTED_PARAM_STATUS_FIELD_KEYS[param])),
      value: param,
      description: buildOptionDescription(locale, providerName, config, param, providerDisplayName, supportedParams),
      default: !disabledSet.has(param),
    }));

    checkboxGroups.push({
      kind: "checkboxGroup",
      customId: `${CHECKBOX_ID_PREFIX}_${groupIndex}`,
      labelKey:
        groupIndex === 0
          ? "commands.config.params.manage.checkbox_label"
          : "commands.config.params.manage.checkbox_label_continued",
      descriptionKey: groupIndex === 0 ? checkboxDescriptionKey : undefined,
      minValues: 0,
      maxValues: options.length,
      required: false,
      options,
    });
  }

  return checkboxGroups;
}

function buildOptionDescription(
  locale: string,
  providerName: string,
  config: TomoriConfigRow,
  param: SupportedParamValue,
  providerDisplayName: string,
  supportedParams: ReadonlySet<SupportedParamValue>,
): string {
  const value = formatParamValue(param, config);
  const status = buildOptionStatus(locale, providerName, config, param, providerDisplayName);

  if (!supportedParams.has(param)) {
    return safeSelectOptionText(
      localizer(locale, "commands.config.params.manage.option_description_unsupported", {
        value,
        provider: providerDisplayName,
      }),
    );
  }

  return safeSelectOptionText(
    localizer(locale, "commands.config.params.manage.option_description_supported", {
      value,
      status,
    }),
  );
}

function buildOptionStatus(
  locale: string,
  providerName: string,
  config: TomoriConfigRow,
  param: SupportedParamValue,
  providerDisplayName: string,
): string {
  if (config.llm_disabled_params?.includes(param) ?? false) {
    return localizer(locale, "commands.config.params.manage.state_disabled");
  }

  if (providerName === "anthropic" && (param === "temperature" || param === "topP")) {
    const anthropicSelection = selectAnthropicSamplingParams({
      temperature: config.llm_temperature,
      topP: config.llm_top_p,
      disabledParams: config.llm_disabled_params ?? [],
    });
    const isSent = (param === "temperature" ? anthropicSelection.temperature : anthropicSelection.topP) !== undefined;

    if (isSent) {
      return localizer(locale, "commands.config.params.manage.state_enabled_custom");
    }

    return isNeutralSamplingValue(config, param)
      ? localizer(locale, "commands.config.params.manage.state_enabled_default", {
          provider: providerDisplayName,
        })
      : localizer(locale, "commands.config.params.manage.state_enabled_omitted_conflict", {
          provider: providerDisplayName,
        });
  }

  return isActiveSamplingParam(config, param)
    ? localizer(locale, "commands.config.params.manage.state_enabled_custom")
    : localizer(locale, "commands.config.params.manage.state_enabled_default", {
        provider: providerDisplayName,
      });
}

function isNeutralSamplingValue(config: TomoriConfigRow, param: SupportedParamValue): boolean {
  switch (param) {
    case "temperature":
      return false;
    case "topP":
      return config.llm_top_p >= 1.0;
    case "topK":
      return config.llm_top_k <= 0;
    case "frequencyPenalty":
      return config.llm_frequency_penalty === 0;
    case "presencePenalty":
      return config.llm_presence_penalty === 0;
    case "minP":
      return config.llm_min_p <= 0;
  }
}

function formatParamValue(param: SupportedParamValue, config: TomoriConfigRow): string {
  const rawValue = config[SUPPORTED_PARAM_CONFIG_KEYS[param]];
  if (param === "topK") {
    return String(rawValue);
  }

  return Number(rawValue).toFixed(2);
}

function formatParamList(locale: string, params: readonly SupportedParamValue[]): string {
  if (params.length === 0) {
    return localizer(locale, "commands.choices.none");
  }

  return params.map((param) => `\`${localizer(locale, SUPPORTED_PARAM_STATUS_FIELD_KEYS[param])}\``).join(", ");
}

function collectCheckedParams(
  multiValues: Record<string, string[]> | undefined,
  groupCount: number,
): Set<SupportedParamValue> {
  const selectedParams = new Set<SupportedParamValue>();

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
    const groupValues = multiValues?.[`${CHECKBOX_ID_PREFIX}_${groupIndex}`] ?? [];
    for (const value of groupValues) {
      if (isSupportedParamValue(value)) {
        selectedParams.add(value);
      }
    }
  }

  return selectedParams;
}

function formatTextArrayLiteral(items: readonly string[]): string {
  return `{${items.map((item) => `"${item.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;
}
