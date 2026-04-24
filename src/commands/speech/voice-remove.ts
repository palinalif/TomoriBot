import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type SlashCommandSubcommandBuilder,
  type StringSelectMenuInteraction,
} from "discord.js";
import { sql } from "@/utils/db/client";
import { log, ColorCode } from "@/utils/misc/logger";
import { replyInfoEmbed, safeSelectOptionText } from "@/utils/discord/interactionHelper";
import { createStandardEmbed } from "@/utils/discord/embedHelper";
import type { ErrorContext, UserRow } from "@/types/db/schema";
import { localizer } from "@/utils/text/localizer";

const VOICE_SAMPLES_BASE_DIR = path.resolve(process.cwd(), "data", "voice-samples");

const CONFIRM_BTN_ID = "voice_remove_confirm";
const CANCEL_BTN_ID = "voice_remove_cancel";
const SELECT_MENU_ID = "voice_remove_select";
const INTERACTION_TIMEOUT_MS = 30_000;

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand.setName("voice-remove").setDescription(localizer("en-US", "commands.speech.voice_remove.description"));

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
    // 1. Load all server voice samples.
    const sampleRows = await sql<{ sample_id: number; name: string; file_path: string; duration_ms: number }[]>`
      SELECT sample_id, name, file_path, duration_ms
      FROM voice_samples
      WHERE server_id = ${serverId}
      ORDER BY name
    `;

    if (!sampleRows.length) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.speech.voice_remove.no_sample_title",
        descriptionKey: "commands.speech.voice_remove.no_sample_description",
        color: ColorCode.WARN,
      });
      return;
    }

    // 2. Show a select menu so the user picks which sample to delete.
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(SELECT_MENU_ID)
      .setPlaceholder(localizer(locale, "commands.speech.voice_remove.select_placeholder"))
      .addOptions(
        sampleRows.map((s) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(safeSelectOptionText(s.name))
            .setValue(String(s.sample_id))
            .setDescription(
              s.duration_ms > 0
                ? safeSelectOptionText(`${Math.floor(s.duration_ms / 1000)}s`)
                : safeSelectOptionText(localizer(locale, "general.unknown")),
            ),
        ),
      );

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    const selectEmbed = createStandardEmbed(locale, {
      titleKey: "commands.speech.voice_remove.select_sample_title",
      color: ColorCode.WARN,
    });

    const selectMessage = await interaction.editReply({ embeds: [selectEmbed], components: [selectRow] });

    let selectInteraction: StringSelectMenuInteraction;
    try {
      selectInteraction = (await selectMessage.awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id && i.customId === SELECT_MENU_ID,
        time: INTERACTION_TIMEOUT_MS,
      })) as StringSelectMenuInteraction;
    } catch {
      await interaction.editReply({ components: [] }).catch(() => {});
      return;
    }

    await selectInteraction.deferUpdate();

    const selectedSampleId = Number(selectInteraction.values[0]);
    const sampleRow = sampleRows.find((s) => s.sample_id === selectedSampleId);
    if (!sampleRow) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.invalid_option_title",
        descriptionKey: "general.errors.invalid_option_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    // 3. Count how many personas currently reference this sample.
    const [refCountRow] = await sql<[{ count: string }]>`
      SELECT COUNT(*) AS count FROM tomoris
      WHERE server_id = ${serverId}
        AND speech_voice_sample_id = ${sampleRow.sample_id}
    `;
    const refCount = Number(refCountRow?.count ?? 0);

    // 4. Show confirm / cancel buttons.
    const confirmEmbed = createStandardEmbed(locale, {
      titleKey: "commands.speech.voice_remove.confirm_title",
      descriptionKey: "commands.speech.voice_remove.confirm_description",
      descriptionVars: { name: sampleRow.name, refs: String(refCount) },
      color: ColorCode.WARN,
    });

    const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(CONFIRM_BTN_ID)
        .setLabel(localizer(locale, "commands.speech.voice_remove.confirm_button"))
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(CANCEL_BTN_ID)
        .setLabel(localizer(locale, "commands.speech.voice_remove.cancel_button"))
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ embeds: [confirmEmbed], components: [confirmRow] });

    let buttonInteraction: ButtonInteraction;
    try {
      buttonInteraction = (await selectMessage.awaitMessageComponent({
        filter: (i) =>
          i.user.id === interaction.user.id && (i.customId === CONFIRM_BTN_ID || i.customId === CANCEL_BTN_ID),
        time: INTERACTION_TIMEOUT_MS,
      })) as ButtonInteraction;
    } catch {
      await interaction.editReply({ components: [] }).catch(() => {});
      return;
    }

    await buttonInteraction.deferUpdate();

    if (buttonInteraction.customId === CANCEL_BTN_ID) {
      await interaction.editReply({ embeds: [], components: [] });
      return;
    }

    // 5. Deletion confirmed: clear persona assignments, remove DB row, delete file.
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
      titleKey: "commands.speech.voice_remove.success_title",
      descriptionKey: "commands.speech.voice_remove.success_description",
      descriptionVars: { name: sampleRow.name },
      color: ColorCode.SUCCESS,
    });
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      serverId,
      errorType: "CommandExecutionError",
      metadata: {
        command: "speech voice-remove",
        guildId: interaction.guild?.id,
        executorDiscordId: interaction.user.id,
      },
    };
    await log.error("Error executing /speech voice-remove", error as Error, context);
    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
    });
  }
}
