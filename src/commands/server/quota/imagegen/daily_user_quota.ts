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

// Quota limits
const MIN_USER_QUOTA = 0; // 0 = unlimited
const MAX_USER_QUOTA = 100;

/**
 * Configure the subcommand for /server quota imagegen daily_user_quota
 */
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("daily_user_quota")
		.setDescription(
			localizer(
				"en-US",
				"commands.server.quota.imagegen.daily_user_quota_description",
			),
		)
		.addIntegerOption((option) =>
			option
				.setName("limit")
				.setDescription(
					localizer(
						"en-US",
						"commands.server.quota.imagegen.daily_user_quota_limit_description",
					),
				)
				.setRequired(true)
				.setMinValue(MIN_USER_QUOTA)
				.setMaxValue(MAX_USER_QUOTA),
		);

/**
 * Execute /server quota imagegen daily_user_quota
 * Sets per-user daily image generation limit
 */
export async function execute(
	_client: Client,
	interaction: ChatInputCommandInteraction,
	userData: UserRow,
	locale: string,
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

		// 5. Ensure quota config exists (creates default if not exists)
		await getQuotaConfig(serverId);

		// 6. Get new limit
		const limit = interaction.options.getInteger("limit", true);

		// 7. Update config
		await sql`
			UPDATE image_quota_configs
			SET daily_user_quota = ${limit}
			WHERE server_id = ${serverId}
		`;

		log.info("Updated daily user quota");

		// 8. Reply with success
		const limitText =
			limit === 0
				? localizer(locale, "commands.server.quota.imagegen.unlimited")
				: `${limit}`;

		await replyInfoEmbed(interaction, userData.language_pref, {
			titleKey: "commands.server.quota.imagegen.daily_user_quota_success_title",
			descriptionKey:
				"commands.server.quota.imagegen.daily_user_quota_success_description",
			descriptionVars: { limit: limitText },
			color: ColorCode.SUCCESS,
		});
	} catch (error) {
		log.error("Error executing /server quota imagegen daily_user_quota", error);

		await replyInfoEmbed(interaction, userData.language_pref, {
			titleKey: "general.errors.generic_error_title",
			descriptionKey: "general.errors.generic_error_description",
			color: ColorCode.ERROR,
		});
	}
}
