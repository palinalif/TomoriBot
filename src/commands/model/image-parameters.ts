import type { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags } from "discord.js";
import type { ErrorContext, UserRow } from "@/types/db/schema";
import { getCachedTomoriState } from "@/utils/cache/tomoriStateCache";
import { sql } from "@/utils/db/client";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { ColorCode, log } from "@/utils/misc/logger";
import { resolveCapabilityCredentials } from "@/utils/provider/credentialResolver";
import { localizer } from "@/utils/text/localizer";

type ImageParameterTarget = "img2img" | "tight" | "balanced" | "loose";

type ComfyUiImageParametersConfig = {
  reference_denoise?: number;
  inpaint?: Record<
    string,
    {
      description?: string;
      mask_threshold?: number;
      mask_grow?: number;
      mask_feather?: number;
      cfg?: number;
      denoise?: number;
    }
  >;
};

const PARAMETER_CONFIG_KEY = "comfyui_image_parameters";

function isImageParameterTarget(value: string): value is ImageParameterTarget {
  return value === "img2img" || value === "tight" || value === "balanced" || value === "loose";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readExistingParameters(extraConfig: Record<string, unknown>): ComfyUiImageParametersConfig {
  const rawParameters = extraConfig[PARAMETER_CONFIG_KEY];
  if (!isRecord(rawParameters)) {
    return {};
  }

  return rawParameters as ComfyUiImageParametersConfig;
}

function pruneEmptyParameterConfig(config: ComfyUiImageParametersConfig): ComfyUiImageParametersConfig | null {
  const nextConfig: ComfyUiImageParametersConfig = {};

  if (typeof config.reference_denoise === "number") {
    nextConfig.reference_denoise = config.reference_denoise;
  }

  const nextInpaint: ComfyUiImageParametersConfig["inpaint"] = {};
  for (const [mode, preset] of Object.entries(config.inpaint ?? {})) {
    if (!preset) {
      continue;
    }

    const nextPreset = Object.fromEntries(
      Object.entries(preset).filter(([, value]) => typeof value === "number" || typeof value === "string"),
    ) as NonNullable<ComfyUiImageParametersConfig["inpaint"]>[string];

    if (nextPreset && Object.keys(nextPreset).length > 0) {
      nextInpaint[mode] = nextPreset;
    }
  }

  if (Object.keys(nextInpaint).length > 0) {
    nextConfig.inpaint = nextInpaint;
  }

  return Object.keys(nextConfig).length > 0 ? nextConfig : null;
}

function formatChangedSettings(locale: string, settings: Array<{ labelKey: string; value: number | string }>): string {
  return settings.length > 0
    ? settings.map((setting) => `${localizer(locale, setting.labelKey)}=\`${setting.value}\``).join(", ")
    : localizer(locale, "general.none");
}

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("image-parameters")
    .setDescription(localizer("en-US", "commands.model.image-parameters.description"))
    .addStringOption((option) =>
      option
        .setName("target")
        .setDescription(localizer("en-US", "commands.model.image-parameters.target_description"))
        .setRequired(true)
        .addChoices(
          {
            name: localizer("en-US", "commands.model.image-parameters.target_img2img"),
            value: "img2img",
          },
          {
            name: localizer("en-US", "commands.model.image-parameters.target_tight"),
            value: "tight",
          },
          {
            name: localizer("en-US", "commands.model.image-parameters.target_balanced"),
            value: "balanced",
          },
          {
            name: localizer("en-US", "commands.model.image-parameters.target_loose"),
            value: "loose",
          },
        ),
    )
    .addNumberOption((option) =>
      option
        .setName("denoise")
        .setDescription(localizer("en-US", "commands.model.image-parameters.denoise_description"))
        .setMinValue(0)
        .setMaxValue(1)
        .setRequired(false),
    )
    .addNumberOption((option) =>
      option
        .setName("cfg")
        .setDescription(localizer("en-US", "commands.model.image-parameters.cfg_description"))
        .setMinValue(0)
        .setMaxValue(30)
        .setRequired(false),
    )
    .addNumberOption((option) =>
      option
        .setName("mask_threshold")
        .setDescription(localizer("en-US", "commands.model.image-parameters.mask_threshold_description"))
        .setMinValue(0)
        .setMaxValue(10)
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName("mask_grow")
        .setDescription(localizer("en-US", "commands.model.image-parameters.mask_grow_description"))
        .setMinValue(0)
        .setMaxValue(128)
        .setRequired(false),
    )
    .addNumberOption((option) =>
      option
        .setName("mask_feather")
        .setDescription(localizer("en-US", "commands.model.image-parameters.mask_feather_description"))
        .setMinValue(0)
        .setMaxValue(100)
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("reset")
        .setDescription(localizer("en-US", "commands.model.image-parameters.reset_description"))
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

  try {
    const target = interaction.options.getString("target", true);
    if (!isImageParameterTarget(target)) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.invalid_option_title",
        descriptionKey: "general.errors.invalid_option_description",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const denoise = interaction.options.getNumber("denoise");
    const cfg = interaction.options.getNumber("cfg");
    const maskThreshold = interaction.options.getNumber("mask_threshold");
    const maskGrow = interaction.options.getInteger("mask_grow");
    const maskFeather = interaction.options.getNumber("mask_feather");
    const reset = interaction.options.getBoolean("reset") ?? false;
    const hasAnyValue =
      denoise !== null || cfg !== null || maskThreshold !== null || maskGrow !== null || maskFeather !== null;

    if (!reset && !hasAnyValue) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.model.image-parameters.no_changes_title",
        descriptionKey: "commands.model.image-parameters.no_changes_description",
        color: ColorCode.WARN,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (target === "img2img" && !reset && denoise === null) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.model.image-parameters.img2img_masks_title",
        descriptionKey: "commands.model.image-parameters.img2img_masks_description",
        color: ColorCode.WARN,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const credentials = await resolveCapabilityCredentials(tomoriState.server_id, "image-standard");
    const endpoint = credentials.customEndpoint;
    if (!endpoint || endpoint.api_style !== "comfyui" || credentials.source !== "server") {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.model.image-parameters.unsupported_title",
        descriptionKey: "commands.model.image-parameters.unsupported_description",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!endpoint.custom_endpoint_id) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const extraConfig = { ...(endpoint.extra_config as Record<string, unknown>) };
    const nextParameters: ComfyUiImageParametersConfig = {
      ...readExistingParameters(extraConfig),
      inpaint: { ...readExistingParameters(extraConfig).inpaint },
    };

    const changedSettings: Array<{ labelKey: string; value: number | string }> = [];
    if (reset) {
      if (target === "img2img") {
        delete nextParameters.reference_denoise;
      } else {
        delete nextParameters.inpaint?.[target];
      }
      changedSettings.push({
        labelKey: "commands.model.image-parameters.reset_label",
        value: localizer(locale, `commands.model.image-parameters.target_${target}`),
      });
    } else if (target === "img2img") {
      if (denoise !== null) {
        nextParameters.reference_denoise = denoise;
        changedSettings.push({ labelKey: "commands.model.image-parameters.denoise_label", value: denoise });
      }
    } else {
      const nextPreset = { ...(nextParameters.inpaint?.[target] ?? {}) };
      if (denoise !== null) {
        nextPreset.denoise = denoise;
        changedSettings.push({ labelKey: "commands.model.image-parameters.denoise_label", value: denoise });
      }
      if (cfg !== null) {
        nextPreset.cfg = cfg;
        changedSettings.push({ labelKey: "commands.model.image-parameters.cfg_label", value: cfg });
      }
      if (maskThreshold !== null) {
        nextPreset.mask_threshold = maskThreshold;
        changedSettings.push({
          labelKey: "commands.model.image-parameters.mask_threshold_label",
          value: maskThreshold,
        });
      }
      if (maskGrow !== null) {
        nextPreset.mask_grow = maskGrow;
        changedSettings.push({ labelKey: "commands.model.image-parameters.mask_grow_label", value: maskGrow });
      }
      if (maskFeather !== null) {
        nextPreset.mask_feather = maskFeather;
        changedSettings.push({
          labelKey: "commands.model.image-parameters.mask_feather_label",
          value: maskFeather,
        });
      }
      nextParameters.inpaint = { ...(nextParameters.inpaint ?? {}), [target]: nextPreset };
    }

    const prunedParameters = pruneEmptyParameterConfig(nextParameters);
    if (prunedParameters) {
      extraConfig[PARAMETER_CONFIG_KEY] = prunedParameters;
    } else {
      delete extraConfig[PARAMETER_CONFIG_KEY];
    }

    await sql`
      UPDATE custom_endpoints
      SET extra_config = ${JSON.stringify(extraConfig)}::jsonb,
          updated_at = CURRENT_TIMESTAMP
      WHERE custom_endpoint_id = ${endpoint.custom_endpoint_id}
        AND server_id = ${tomoriState.server_id}
        AND user_id IS NULL
    `;

    await replyInfoEmbed(interaction, locale, {
      titleKey: "commands.model.image-parameters.success_title",
      descriptionKey: "commands.model.image-parameters.success_description",
      descriptionVars: {
        target: localizer(locale, `commands.model.image-parameters.target_${target}`),
        settings: formatChangedSettings(locale, changedSettings),
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
        command: "model image-parameters",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error(
      `Error executing /model image-parameters for user ${userData.user_disc_id}`,
      error as Error,
      context,
    );

    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
