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

/**
 * Configures the `/personal deliberate-trigger-mode` subcommand.
 * Toggles whether this user personally requires explicit invocations instead of
 * plain trigger words, regardless of server-level DTM setting.
 */
export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("deliberate-trigger-mode")
    .setDescription(localizer("en-US", "commands.personal.deliberatetriggermode.description"));

/**
 * Toggles personal deliberate trigger mode for the invoking user.
 * When enabled, plain trigger words no longer fire the bot for this user —
 * only direct invocations work: `@{trigger}` prefix, Discord @mention, replies,
 * or `/bot respond`. The server-level DTM setting applies to all users independently;
 * this flag lets individual users opt into stricter behavior even when the server
 * has DTM disabled.
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

  try {
    // 2. Toggle the current value
    const newValue = !(userData.personal_dtm ?? false);

    // 3. Update the database
    const [updatedRow] = await sql`
      UPDATE users
      SET personal_dtm = ${newValue}
      WHERE user_disc_id = ${userData.user_disc_id}
      RETURNING *
    `;

    if (!updatedRow) {
      const context: ErrorContext = {
        userId: userData.user_id,
        errorType: "DatabaseUpdateError",
        metadata: {
          command: "personal deliberatetriggermode",
          newValue,
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

    // 4. Validate the returned data
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
      await log.error("Failed to validate updated user after personal_dtm toggle", validatedUser.error, context);

      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.update_failed_title",
        descriptionKey: "general.errors.update_failed_description",
        color: ColorCode.ERROR,
      });
      return;
    }

    // 5. Invalidate user cache after successful write
    invalidateUserCache(userData.user_disc_id);

    // 6. Send success message reflecting the new state
    await replyInfoEmbed(interaction, locale, {
      titleKey: newValue
        ? "commands.personal.deliberatetriggermode.enabled_title"
        : "commands.personal.deliberatetriggermode.disabled_title",
      descriptionKey: newValue
        ? "commands.personal.deliberatetriggermode.enabled_description"
        : "commands.personal.deliberatetriggermode.disabled_description",
      color: newValue ? ColorCode.SUCCESS : ColorCode.WARN,
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
