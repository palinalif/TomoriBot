import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import { sql } from "@/utils/db/client";
import { localizer } from "../../utils/text/localizer";
import { log, ColorCode } from "../../utils/misc/logger";
import { replyInfoEmbed } from "../../utils/discord/interactionHelper";
import { type UserRow, type ErrorContext, userSchema } from "../../types/db/schema";
import { invalidateUserCache } from "../../utils/cache/userCache";

/** Valid personal DTM mode values */
const DTM_MODES = ["off", "follow", "on"] as const;
type DtmMode = (typeof DTM_MODES)[number];

/**
 * Configures the `/personal deliberate-trigger-mode` subcommand.
 * Lets users choose one of three DTM states that override (or follow) the server setting.
 */
export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("deliberate-trigger-mode")
    .setDescription(localizer("en-US", "commands.personal.deliberatetriggermode.description"))
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription(localizer("en-US", "commands.personal.deliberatetriggermode.mode_description"))
        .setRequired(true)
        .addChoices(
          {
            name: localizer("en-US", "commands.personal.deliberatetriggermode.off_option"),
            value: "off",
          },
          {
            name: localizer("en-US", "commands.personal.deliberatetriggermode.follow_option"),
            value: "follow",
          },
          {
            name: localizer("en-US", "commands.personal.deliberatetriggermode.on_option"),
            value: "on",
          },
        ),
    );

/**
 * Sets the personal deliberate trigger mode preference for the invoking user.
 * - `off`    — DTM is always disabled for this user, even if the server has it enabled.
 * - `follow` — (default) DTM mirrors the server's setting.
 * - `on`     — DTM is always enabled for this user, even if the server has it disabled.
 *              Only direct invocations work: `@{trigger}` prefix, Discord @mention, replies,
 *              or `/bot respond`.
 * @param _client - Discord client instance
 * @param interaction - Command interaction
 * @param userData - User data from database
 * @param locale - Locale of the interaction
 */
export async function execute(
  _client: Client,
  interaction: ChatInputCommandInteraction,
  userData: UserRow,
  locale: string,
): Promise<void> {
  // 1. Defer the reply before async work to prevent timeout
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // 2. Read the selected mode from the interaction options
  const selectedMode = interaction.options.getString("mode", true) as DtmMode;

  try {
    // 3. Update the database with the chosen mode
    const [updatedRow] = await sql`
      UPDATE users
      SET personal_dtm = ${selectedMode}
      WHERE user_disc_id = ${userData.user_disc_id}
      RETURNING *
    `;

    if (!updatedRow) {
      const context: ErrorContext = {
        userId: userData.user_id,
        errorType: "DatabaseUpdateError",
        metadata: {
          command: "personal deliberatetriggermode",
          selectedMode,
          targetTable: "users",
        },
      };
      await log.error("Failed to update personal_dtm for user", new Error("Database update returned no rows"), context);

      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    // 4. Validate the returned row against the schema
    const validatedUser = userSchema.safeParse(updatedRow);
    if (!validatedUser.success) {
      const context: ErrorContext = {
        userId: userData.user_id,
        errorType: "SchemaValidationError",
        metadata: {
          command: "personal deliberatetriggermode",
          validationErrors: validatedUser.error.flatten(),
        },
      };
      await log.error("Failed to validate updated user after personal_dtm change", validatedUser.error, context);

      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    // 5. Invalidate user cache after successful write
    invalidateUserCache(userData.user_disc_id);

    // 6. Map each mode to its result color for visual clarity
    const colorByMode: Record<DtmMode, ColorCode> = {
      off: ColorCode.WARN,
      follow: ColorCode.INFO,
      on: ColorCode.SUCCESS,
    };

    // 7. Reply with the localized result for the chosen mode
    await replyInfoEmbed(interaction, locale, {
      titleKey: `commands.personal.deliberatetriggermode.${selectedMode}_title`,
      descriptionKey: `commands.personal.deliberatetriggermode.${selectedMode}_description`,
      color: colorByMode[selectedMode],
    });
  } catch (error) {
    const context: ErrorContext = {
      userId: userData.user_id,
      errorType: "CommandExecutionError",
      metadata: {
        command: "personal deliberatetriggermode",
        options: interaction.options?.data,
      },
    };
    await log.error(`Error in /personal deliberate-trigger-mode command`, error as Error, context);

    await replyInfoEmbed(interaction, locale, {
      titleKey: "general.errors.unknown_error_title",
      descriptionKey: "general.errors.unknown_error_description",
      color: ColorCode.ERROR,
    });
  }
}
