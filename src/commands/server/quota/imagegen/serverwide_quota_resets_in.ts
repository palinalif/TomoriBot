import type {
	ChatInputCommandInteraction,
	Client,
	SlashCommandSubcommandBuilder,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { sql } from "@/utils/db/client";
import { getQuotaConfig } from "@/utils/quota/imageQuotaManager";
import type { UserRow } from "@/types/db/schema";
import { localizer } from "@/utils/text/localizer";
import { log, ColorCode } from "@/utils/misc/logger";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";

// Reset period limits
const MIN_RESET_DAYS = 1;
const MAX_RESET_DAYS = 365;

/**
 * Configure the subcommand for /server quota imagegen serverwide_quota_resets_in
 */
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("serverwide_quota_resets_in")
		.setDescription(
			localizer(
				"en-US",
				"commands.server.quota.imagegen.serverwide_quota_resets_in_description",
			),
		)
		.addIntegerOption((option) =>
			option
				.setName("days")
				.setDescription(
					localizer(
						"en-US",
						"commands.server.quota.imagegen.serverwide_quota_resets_in_days_description",
					),
				)
				.setRequired(true)
				.setMinValue(MIN_RESET_DAYS)
				.setMaxValue(MAX_RESET_DAYS),
		);

/**
 * Execute /server quota imagegen serverwide_quota_resets_in
 * Sets how many days before server-wide quota resets
 */
export async function execute(
	_client: Client,
	interaction: ChatInputCommandInteraction,
	userData: UserRow,
	_locale: string,
): Promise<void> {
	// 1. Ensure command is run in a guild
	if (!interaction.guild || !interaction.channel) {
		await replyInfoEmbed(interaction, userData.language_pref, {
			titleKey: "general.errors.guild_only_title",
			descriptionKey: "general.errors.guild_only_description",
			color: ColorCode.ERROR,
		});
		return;
	}

	// 2. Check permissions (Manage Server required)
	if (!interaction.memberPermissions?.has("ManageGuild")) {
		await replyInfoEmbed(interaction, userData.language_pref, {
			titleKey: "general.errors.permission_denied_title",
			descriptionKey: "general.errors.permission_denied_description",
			color: ColorCode.ERROR,
		});
		return;
	}

	// 3. Defer before async work
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	try {
		// 4. Get server ID from database
		const [serverRow] = await sql<{ server_id: number }[]>`
			SELECT server_id FROM servers WHERE server_disc_id = ${interaction.guild.id}
		`;

		if (!serverRow) {
			await replyInfoEmbed(interaction, userData.language_pref, {
				titleKey: "general.errors.server_not_found_title",
				descriptionKey: "general.errors.server_not_found_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		const serverId = serverRow.server_id;

		// 5. Get current quota config (creates default if not exists)
		const currentConfig = await getQuotaConfig(serverId);

		// 6. Get new days value
		const days = interaction.options.getInteger("days", true);

		// 7. Update config
		await sql`
			UPDATE image_quota_configs
			SET serverwide_quota_resets_in = ${days}
			WHERE server_id = ${serverId}
		`;

		// 8. Update existing quota period end date if serverwide quota is active
		if (currentConfig.serverwide_quota > 0) {
			await sql`
				UPDATE serverwide_quotas
				SET quota_period_end = quota_period_start + (${days} || ' days')::interval
				WHERE server_id = ${serverId}
			`;
		}

		log.info("Updated serverwide quota reset days");

		// 9. Reply with success
		await replyInfoEmbed(interaction, userData.language_pref, {
			titleKey:
				"commands.server.quota.imagegen.serverwide_quota_resets_in_success_title",
			descriptionKey:
				"commands.server.quota.imagegen.serverwide_quota_resets_in_success_description",
			descriptionVars: { days: `${days}` },
			color: ColorCode.SUCCESS,
		});
	} catch (error) {
		log.error(
			"Error executing /server quota imagegen serverwide_quota_resets_in",
			error,
		);

		await replyInfoEmbed(interaction, userData.language_pref, {
			titleKey: "general.errors.generic_error_title",
			descriptionKey: "general.errors.generic_error_description",
			color: ColorCode.ERROR,
		});
	}
}
