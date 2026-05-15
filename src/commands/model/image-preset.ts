import type { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { MessageFlags } from "discord.js";
import type { ErrorContext, UserRow } from "@/types/db/schema";
import { getCachedTomoriState } from "@/utils/cache/tomoriStateCache";
import { sql } from "@/utils/db/client";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { ColorCode, log } from "@/utils/misc/logger";
import { resolveCapabilityCredentials } from "@/utils/provider/credentialResolver";
import { localizer } from "@/utils/text/localizer";

type ComfyUiImagePreset = {
  description?: string;
  mask_threshold?: number;
  mask_grow?: number;
  mask_feather?: number;
  cfg?: number;
  denoise?: number;
};

type ComfyUiImageParametersConfig = {
  reference_denoise?: number;
  inpaint?: Record<string, ComfyUiImagePreset>;
};

const PARAMETER_CONFIG_KEY = "comfyui_image_parameters";
const BUILT_IN_PRESET_NAMES = new Set(["tight", "balanced", "loose"]);
const PRESET_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePresetName(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return PRESET_NAME_PATTERN.test(normalized) ? normalized : null;
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

  const nextInpaint: Record<string, ComfyUiImagePreset> = {};
  for (const [name, preset] of Object.entries(config.inpaint ?? {})) {
    const nextPreset = Object.fromEntries(
      Object.entries(preset).filter(([, value]) => typeof value === "number" || typeof value === "string"),
    ) as ComfyUiImagePreset;

    if (Object.keys(nextPreset).length > 0) {
      nextInpaint[name] = nextPreset;
    }
  }

  if (Object.keys(nextInpaint).length > 0) {
    nextConfig.inpaint = nextInpaint;
  }

  return Object.keys(nextConfig).length > 0 ? nextConfig : null;
}

function formatPresetSettings(preset: Required<ComfyUiImagePreset>): string {
  return [
    `threshold=\`${preset.mask_threshold}\``,
    `grow=\`${preset.mask_grow}\``,
    `feather=\`${preset.mask_feather}\``,
    `cfg=\`${preset.cfg}\``,
    `denoise=\`${preset.denoise}\``,
  ].join(", ");
}

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("image-preset")
    .setDescription(localizer("en-US", "commands.model.image-preset.description"))
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription(localizer("en-US", "commands.model.image-preset.name_description"))
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(32),
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription(localizer("en-US", "commands.model.image-preset.preset_description_description"))
        .setRequired(false)
        .setMaxLength(220),
    )
    .addNumberOption((option) =>
      option
        .setName("denoise")
        .setDescription(localizer("en-US", "commands.model.image-preset.denoise_description"))
        .setMinValue(0)
        .setMaxValue(1)
        .setRequired(false),
    )
    .addNumberOption((option) =>
      option
        .setName("cfg")
        .setDescription(localizer("en-US", "commands.model.image-preset.cfg_description"))
        .setMinValue(0)
        .setMaxValue(30)
        .setRequired(false),
    )
    .addNumberOption((option) =>
      option
        .setName("mask_threshold")
        .setDescription(localizer("en-US", "commands.model.image-preset.mask_threshold_description"))
        .setMinValue(0)
        .setMaxValue(10)
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName("mask_grow")
        .setDescription(localizer("en-US", "commands.model.image-preset.mask_grow_description"))
        .setMinValue(0)
        .setMaxValue(128)
        .setRequired(false),
    )
    .addNumberOption((option) =>
      option
        .setName("mask_feather")
        .setDescription(localizer("en-US", "commands.model.image-preset.mask_feather_description"))
        .setMinValue(0)
        .setMaxValue(100)
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("remove")
        .setDescription(localizer("en-US", "commands.model.image-preset.remove_description"))
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
    const rawName = interaction.options.getString("name", true);
    const name = normalizePresetName(rawName);
    if (!name) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.model.image-preset.invalid_name_title",
        descriptionKey: "commands.model.image-preset.invalid_name_description",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (BUILT_IN_PRESET_NAMES.has(name)) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.model.image-preset.builtin_name_title",
        descriptionKey: "commands.model.image-preset.builtin_name_description",
        color: ColorCode.WARN,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const remove = interaction.options.getBoolean("remove") ?? false;
    const description = interaction.options.getString("description")?.trim() ?? null;
    const denoise = interaction.options.getNumber("denoise");
    const cfg = interaction.options.getNumber("cfg");
    const maskThreshold = interaction.options.getNumber("mask_threshold");
    const maskGrow = interaction.options.getInteger("mask_grow");
    const maskFeather = interaction.options.getNumber("mask_feather");

    const credentials = await resolveCapabilityCredentials(tomoriState.server_id, "image-standard");
    const endpoint = credentials.customEndpoint;
    if (!endpoint || endpoint.api_style !== "comfyui" || credentials.source !== "server") {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.model.image-preset.unsupported_title",
        descriptionKey: "commands.model.image-preset.unsupported_description",
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
    const existingParameters = readExistingParameters(extraConfig);
    const existingPreset = existingParameters.inpaint?.[name] ?? {};
    const nextParameters: ComfyUiImageParametersConfig = {
      ...existingParameters,
      inpaint: { ...(existingParameters.inpaint ?? {}) },
    };

    if (remove) {
      delete nextParameters.inpaint?.[name];
    } else {
      const nextPreset: ComfyUiImagePreset = {
        ...existingPreset,
        ...(description ? { description } : {}),
        ...(denoise !== null ? { denoise } : {}),
        ...(cfg !== null ? { cfg } : {}),
        ...(maskThreshold !== null ? { mask_threshold: maskThreshold } : {}),
        ...(maskGrow !== null ? { mask_grow: maskGrow } : {}),
        ...(maskFeather !== null ? { mask_feather: maskFeather } : {}),
      };

      if (
        !nextPreset.description ||
        typeof nextPreset.denoise !== "number" ||
        typeof nextPreset.cfg !== "number" ||
        typeof nextPreset.mask_threshold !== "number" ||
        typeof nextPreset.mask_grow !== "number" ||
        typeof nextPreset.mask_feather !== "number"
      ) {
        await replyInfoEmbed(interaction, locale, {
          titleKey: "commands.model.image-preset.missing_values_title",
          descriptionKey: "commands.model.image-preset.missing_values_description",
          color: ColorCode.WARN,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      nextParameters.inpaint = { ...(nextParameters.inpaint ?? {}), [name]: nextPreset };
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

    const savedPreset = nextParameters.inpaint?.[name] as Required<ComfyUiImagePreset> | undefined;
    await replyInfoEmbed(interaction, locale, {
      titleKey: remove
        ? "commands.model.image-preset.removed_title"
        : "commands.model.image-preset.success_title",
      descriptionKey: remove
        ? "commands.model.image-preset.removed_description"
        : "commands.model.image-preset.success_description",
      descriptionVars: {
        name,
        description: savedPreset?.description ?? "",
        settings: savedPreset ? formatPresetSettings(savedPreset) : "",
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
        command: "model image-preset",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error(`Error executing /model image-preset for user ${userData.user_disc_id}`, error as Error, context);

    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
  }
}
