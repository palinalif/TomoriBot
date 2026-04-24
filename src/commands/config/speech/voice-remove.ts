import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import { sql } from "@/utils/db/client";
import { log, ColorCode } from "@/utils/misc/logger";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import { createStandardEmbed } from "@/utils/discord/embedHelper";
import type { ErrorContext, UserRow } from "@/types/db/schema";
import { localizer } from "@/utils/text/localizer";

const VOICE_SAMPLES_BASE_DIR = path.resolve(process.cwd(), "data", "voice-samples");

const CONFIRM_BTN_ID = "voice_remove_confirm";
const CANCEL_BTN_ID = "voice_remove_cancel";
const CONFIRM_TIMEOUT_MS = 30_000;

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("voice-remove")
    .setDescription(localizer("en-US", "commands.config.speech.voice_remove.description"));

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

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const [serverRow] = await sql<[{ server_id: number }]>`
    SELECT server_id FROM servers
    WHERE server_disc_id = ${interaction.guild?.id ?? interaction.user.id}
    LIMIT 1
  `;
  if (!serverRow) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.tomori_not_setup_title",
      descriptionKey: "general.errors.tomori_not_setup_description",
      color: ColorCode.ERROR,
    });
    return;
  }
  const serverId = serverRow.server_id;

  try {
    // Load the server's current voice sample.
    const [sampleRow] = await sql<[{ sample_id: number; name: string; file_path: string; duration_ms: number }]>`
      SELECT sample_id, name, file_path, duration_ms
      FROM voice_samples
      WHERE server_id = ${serverId}
      LIMIT 1
    `;

    if (!sampleRow) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.config.speech.voice_remove.no_sample_title",
        descriptionKey: "commands.config.speech.voice_remove.no_sample_description",
        color: ColorCode.WARN,
      });
      return;
    }

    // Count how many personas currently reference this sample.
    const [refCountRow] = await sql<[{ count: string }]>`
      SELECT COUNT(*) AS count FROM tomoris
      WHERE server_id = ${serverId}
        AND speech_voice_sample_id = ${sampleRow.sample_id}
    `;
    const refCount = Number(refCountRow?.count ?? 0);

    // Show a confirmation embed with Confirm / Cancel buttons.
    const confirmEmbed = createStandardEmbed(locale, {
      titleKey: "commands.config.speech.voice_remove.confirm_title",
      descriptionKey: "commands.config.speech.voice_remove.confirm_description",
      descriptionVars: {
        name: sampleRow.name,
        refs: String(refCount),
      },
      color: ColorCode.WARN,
    });

    const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(CONFIRM_BTN_ID)
        .setLabel(localizer(locale, "commands.config.speech.voice_remove.confirm_button"))
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(CANCEL_BTN_ID)
        .setLabel(localizer(locale, "commands.config.speech.voice_remove.cancel_button"))
        .setStyle(ButtonStyle.Secondary),
    );

    const confirmMessage = await interaction.editReply({
      embeds: [confirmEmbed],
      components: [confirmRow],
    });

    let buttonInteraction: ButtonInteraction;
    try {
      buttonInteraction = (await confirmMessage.awaitMessageComponent({
        filter: (i) =>
          i.user.id === interaction.user.id && (i.customId === CONFIRM_BTN_ID || i.customId === CANCEL_BTN_ID),
        time: CONFIRM_TIMEOUT_MS,
      })) as ButtonInteraction;
    } catch {
      // Timed out — disable the buttons silently.
      await interaction.editReply({ components: [] }).catch(() => {});
      return;
    }

    await buttonInteraction.deferUpdate();

    if (buttonInteraction.customId === CANCEL_BTN_ID) {
      await interaction.editReply({ embeds: [], components: [] });
      return;
    }

    // Deletion confirmed: remove DB row, clear persona assignments, delete file.
    await sql`
      UPDATE tomoris
      SET speech_voice_sample_id = NULL
      WHERE server_id = ${serverId}
        AND speech_voice_sample_id = ${sampleRow.sample_id}
    `;

    await sql`
      DELETE FROM voice_samples
      WHERE sample_id = ${sampleRow.sample_id}
    `;

    const absoluteFilePath = path.join(VOICE_SAMPLES_BASE_DIR, sampleRow.file_path);
    await fs.unlink(absoluteFilePath).catch((err) => {
      log.warn(`[VoiceRemove] Could not delete sample file at ${absoluteFilePath}`, err);
    });

    log.info(
      `[VoiceRemove] Deleted sample "${sampleRow.name}" (id=${sampleRow.sample_id}) for server ${serverId} | ${refCount} persona(s) cleared`,
    );

    await replyInfoEmbed(interaction, locale, {
      titleKey: "commands.config.speech.voice_remove.success_title",
      descriptionKey: "commands.config.speech.voice_remove.success_description",
      descriptionVars: { name: sampleRow.name },
      color: ColorCode.SUCCESS,
    });
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      serverId,
      errorType: "CommandExecutionError",
      metadata: {
        command: "config speech voice-remove",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error("Error executing /config speech voice-remove", error as Error, context);
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
    });
  }
}
