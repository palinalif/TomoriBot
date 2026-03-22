/**
 * /config remove modeloverride
 * Removes channel or persona model overrides from the server.
 * Supports single-item removal via paginated modal select, as well as
 * bulk purge of all channel overrides, all persona overrides, or everything at once.
 */

import {
	EmbedBuilder,
	MessageFlags,
	type ChatInputCommandInteraction,
	type Client,
	type SlashCommandSubcommandBuilder,
} from "discord.js";
import { localizer } from "@/utils/text/localizer";
import { log, ColorCode } from "@/utils/misc/logger";
import {
	replyInfoEmbed,
	promptWithPaginatedModal,
	safeSelectOptionText,
} from "@/utils/discord/interactionHelper";
import {
	getCachedTomoriState,
	getCachedAllPersonas,
	invalidateTomoriStateCache,
} from "@/utils/cache/tomoriStateCache";
import {
	invalidateChannelLlmCache,
	invalidateAllChannelLlmCacheForServer,
} from "@/utils/cache/channelLlmCache";
import { getAllChannelLlmOverridesForServer } from "@/utils/db/dbRead";
import {
	deleteChannelLlmOverride,
	setPersonaLlmOverride,
	clearAllChannelLlmOverridesForServer,
	clearAllPersonaLlmOverridesForServer,
} from "@/utils/db/dbWrite";
import type { UserRow, ErrorContext, TomoriState, LlmRow } from "@/types/db/schema";
import type { SelectOption } from "@/types/discord/modal";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_MODAL_CUSTOM_ID = "config_remove_modeloverride_channel_modal";
const PERSONA_MODAL_CUSTOM_ID = "config_remove_modeloverride_persona_modal";
const OVERRIDE_SELECT_ID = "override_select";

// ─── Subcommand Configuration ─────────────────────────────────────────────────

/**
 * Configures the 'modeloverride' subcommand for /config remove.
 */
export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("modeloverride")
		.setDescription(
			localizer(
				"en-US",
				"commands.config.remove.modeloverride.description",
			),
		)
		.addStringOption((option) =>
			option
				.setName("scope")
				.setDescription(
					localizer(
						"en-US",
						"commands.config.remove.modeloverride.scope_description",
					),
				)
				.setRequired(true)
				.addChoices(
					{
						name: localizer(
							"en-US",
							"commands.config.remove.modeloverride.scope_channel",
						),
						value: "channel",
					},
					{
						name: localizer(
							"en-US",
							"commands.config.remove.modeloverride.scope_persona",
						),
						value: "persona",
					},
					{
						name: localizer(
							"en-US",
							"commands.config.remove.modeloverride.scope_all_channels",
						),
						value: "all_channels",
					},
					{
						name: localizer(
							"en-US",
							"commands.config.remove.modeloverride.scope_all_personas",
						),
						value: "all_personas",
					},
					{
						name: localizer(
							"en-US",
							"commands.config.remove.modeloverride.scope_everything",
						),
						value: "everything",
					},
				),
		);

// ─── Execute ──────────────────────────────────────────────────────────────────

/**
 * Executes the /config remove modeloverride command.
 * Routes to the appropriate removal flow based on the scope option.
 *
 * @param _client - Discord client instance
 * @param interaction - Slash command interaction
 * @param userData - Invoking user's data
 * @param locale - User's preferred locale
 */
export async function execute(
	_client: Client,
	interaction: ChatInputCommandInteraction,
	userData: UserRow,
	locale: string,
): Promise<void> {
	// 1. Ensure command is run in a guild
	if (!interaction.guild) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.guild_only_title",
			descriptionKey: "general.errors.guild_only_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// NOTE: No deferReply here for single-item scopes — promptWithPaginatedModal
	// must be the first acknowledgment. Bulk scopes defer inside their handlers.

	try {
		// 2. Load Tomori state to get database server_id
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

		const scope = interaction.options.getString("scope", true);

		// 3. Route to the appropriate handler based on scope
		switch (scope) {
			case "channel":
				await handleChannelScope(interaction, locale, userData, tomoriState);
				break;
			case "persona":
				await handlePersonaScope(interaction, locale, userData, tomoriState);
				break;
			case "all_channels":
				await handlePurgeAllChannels(interaction, locale, tomoriState);
				break;
			case "all_personas":
				await handlePurgeAllPersonas(interaction, locale, tomoriState);
				break;
			case "everything":
				await handlePurgeEverything(interaction, locale, tomoriState);
				break;
		}
	} catch (error) {
		const context: ErrorContext = {
			userId: userData.user_id,
			errorType: "CommandExecutionError",
			metadata: { command: "config remove modeloverride" },
		};
		await log.error(
			"Error in /config remove modeloverride",
			error as Error,
			context,
		);

		if (!interaction.replied && !interaction.deferred) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.errors.unknown_error_title",
				descriptionKey: "general.errors.unknown_error_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
		} else {
			await interaction.editReply({
				embeds: [
					new EmbedBuilder()
						.setTitle(
							localizer(locale, "general.errors.unknown_error_title"),
						)
						.setDescription(
							localizer(
								locale,
								"general.errors.unknown_error_description",
							),
						)
						.setColor(ColorCode.ERROR),
				],
			});
		}
	}
}

// ─── Channel Scope ────────────────────────────────────────────────────────────

/**
 * Handles removal of a single channel model override.
 * Presents a select of all existing channel overrides, then deletes the chosen one.
 *
 * @param interaction - Slash command interaction
 * @param locale - User's preferred locale
 * @param userData - Invoking user's data
 * @param tomoriState - Loaded TomoriState for this server
 */
async function handleChannelScope(
	interaction: ChatInputCommandInteraction,
	locale: string,
	_userData: UserRow,
	tomoriState: TomoriState,
): Promise<void> {
	// 1. Load all channel overrides for this server
	const overrides = await getAllChannelLlmOverridesForServer(
		tomoriState.server_id,
	);

	if (overrides.length === 0) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "commands.config.remove.modeloverride.channel_none_title",
			descriptionKey:
				"commands.config.remove.modeloverride.channel_none_description",
			color: ColorCode.WARN,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// 2. Build select options: label shows "#channel → model (provider)"
	//    Value is the array index so channel_disc_id length doesn't risk truncation
	const overrideOptions: SelectOption[] = overrides.map((entry, index) => {
		const guildChannel = interaction.guild?.channels.cache.get(
			entry.channelDiscId,
		);
		const channelName = guildChannel
			? `#${guildChannel.name}`
			: `<#${entry.channelDiscId}>`;
		const label = safeSelectOptionText(
			`${channelName} → ${entry.llm.llm_codename} (${entry.llm.llm_provider})`,
		);
		return { value: index.toString(), label };
	});

	// 3. Show modal — this is the first interaction acknowledgment
	const modalResult = await promptWithPaginatedModal(interaction, locale, {
		modalCustomId: CHANNEL_MODAL_CUSTOM_ID,
		modalTitleKey:
			"commands.config.remove.modeloverride.channel_modal_title",
		components: [
			{
				customId: OVERRIDE_SELECT_ID,
				labelKey:
					"commands.config.remove.modeloverride.channel_select_label",
				placeholder:
					"commands.config.remove.modeloverride.channel_select_placeholder",
				required: true,
				options: overrideOptions,
			},
		],
	});

	if (modalResult.outcome !== "submit") return;

	// biome-ignore lint/style/noNonNullAssertion: "submit" outcome guarantees interaction and values exist
	const modalInteraction = modalResult.interaction!;
	// biome-ignore lint/style/noNonNullAssertion: "submit" outcome guarantees interaction and values exist
	const values = modalResult.values!;

	// 4. Defer the modal submit reply
	if (!modalInteraction.deferred && !modalInteraction.replied) {
		await modalInteraction.deferReply({ flags: MessageFlags.Ephemeral });
	}

	// 5. Resolve selected entry from index
	const selectedIndex = Number.parseInt(
		values[OVERRIDE_SELECT_ID] ?? "0",
		10,
	);
	const selectedEntry = overrides[selectedIndex];

	if (!selectedEntry) {
		await replyInfoEmbed(modalInteraction, locale, {
			titleKey: "general.errors.unknown_error_title",
			descriptionKey: "general.errors.unknown_error_description",
			color: ColorCode.ERROR,
		});
		return;
	}

	// 6. Delete from DB
	const deleted = await deleteChannelLlmOverride(
		tomoriState.server_id,
		selectedEntry.channelDiscId,
	);

	if (!deleted) {
		const context: ErrorContext = {
			serverId: tomoriState.server_id,
			errorType: "DatabaseDeleteError",
			metadata: {
				operation: "deleteChannelLlmOverride",
				channelDiscId: selectedEntry.channelDiscId,
			},
		};
		await log.error(
			"Failed to delete channel LLM override",
			new Error("deleteChannelLlmOverride returned false"),
			context,
		);
		await replyInfoEmbed(modalInteraction, locale, {
			titleKey: "general.errors.update_failed_title",
			descriptionKey: "general.errors.update_failed_description",
			color: ColorCode.ERROR,
		});
		return;
	}

	// 7. Invalidate channel LLM cache so next message uses the server default
	invalidateChannelLlmCache(tomoriState.server_id, selectedEntry.channelDiscId);

	// 8. Reply success
	const channelMention =
		interaction.guild?.channels.cache.get(selectedEntry.channelDiscId)
			?.toString() ?? `<#${selectedEntry.channelDiscId}>`;

	await replyInfoEmbed(modalInteraction, locale, {
		titleKey: "commands.config.remove.modeloverride.channel_success_title",
		descriptionKey:
			"commands.config.remove.modeloverride.channel_success_description",
		descriptionVars: { channel: channelMention },
		color: ColorCode.SUCCESS,
	});

	log.success(
		`Channel LLM override for ${selectedEntry.channelDiscId} removed from server ${interaction.guild?.id}`,
	);
}

// ─── Persona Scope ────────────────────────────────────────────────────────────

/**
 * Handles removal of a single persona model override.
 * Only shows personas that currently have an override set.
 * Clears the override by setting persona_llm to null.
 *
 * @param interaction - Slash command interaction
 * @param locale - User's preferred locale
 * @param userData - Invoking user's data
 * @param tomoriState - Loaded TomoriState for this server
 */
async function handlePersonaScope(
	interaction: ChatInputCommandInteraction,
	locale: string,
	_userData: UserRow,
	tomoriState: TomoriState,
): Promise<void> {
	// 1. Load all personas, then filter to those with an active override
	const allPersonas = await getCachedAllPersonas(
		interaction.guild?.id ?? interaction.user.id,
	);
	const personasWithOverride = allPersonas.filter(
		(p): p is TomoriState & { persona_llm: LlmRow } => p.persona_llm != null,
	);

	if (personasWithOverride.length === 0) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "commands.config.remove.modeloverride.persona_none_title",
			descriptionKey:
				"commands.config.remove.modeloverride.persona_none_description",
			color: ColorCode.WARN,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	// 2. Build select options: label shows "PersonaName (model)"
	const personaOptions: SelectOption[] = personasWithOverride.map(
		(p, index) => ({
			value: index.toString(),
			label: safeSelectOptionText(
				`${p.tomori_nickname} (${p.persona_llm.llm_codename})`,
			),
		}),
	);

	// 3. Show modal — first interaction acknowledgment
	const modalResult = await promptWithPaginatedModal(interaction, locale, {
		modalCustomId: PERSONA_MODAL_CUSTOM_ID,
		modalTitleKey:
			"commands.config.remove.modeloverride.persona_modal_title",
		components: [
			{
				customId: OVERRIDE_SELECT_ID,
				labelKey:
					"commands.config.remove.modeloverride.persona_select_label",
				placeholder:
					"commands.config.remove.modeloverride.persona_select_placeholder",
				required: true,
				options: personaOptions,
			},
		],
	});

	if (modalResult.outcome !== "submit") return;

	// biome-ignore lint/style/noNonNullAssertion: "submit" outcome guarantees interaction and values exist
	const modalInteraction = modalResult.interaction!;
	// biome-ignore lint/style/noNonNullAssertion: "submit" outcome guarantees interaction and values exist
	const values = modalResult.values!;

	// 4. Defer the modal submit reply
	if (!modalInteraction.deferred && !modalInteraction.replied) {
		await modalInteraction.deferReply({ flags: MessageFlags.Ephemeral });
	}

	// 5. Resolve selected persona from index
	const selectedIndex = Number.parseInt(
		values[OVERRIDE_SELECT_ID] ?? "0",
		10,
	);
	const selectedPersona = personasWithOverride[selectedIndex];

	if (!selectedPersona?.tomori_id) {
		await replyInfoEmbed(modalInteraction, locale, {
			titleKey: "general.errors.unknown_error_title",
			descriptionKey: "general.errors.unknown_error_description",
			color: ColorCode.ERROR,
		});
		return;
	}

	// 6. Clear the override by writing null
	const cleared = await setPersonaLlmOverride(selectedPersona.tomori_id, null);

	if (!cleared) {
		const context: ErrorContext = {
			serverId: tomoriState.server_id,
			errorType: "DatabaseDeleteError",
			metadata: {
				operation: "setPersonaLlmOverride(null)",
				tomoriId: selectedPersona.tomori_id,
			},
		};
		await log.error(
			"Failed to clear persona LLM override",
			new Error("setPersonaLlmOverride(null) returned false"),
			context,
		);
		await replyInfoEmbed(modalInteraction, locale, {
			titleKey: "general.errors.update_failed_title",
			descriptionKey: "general.errors.update_failed_description",
			color: ColorCode.ERROR,
		});
		return;
	}

	// 7. Invalidate TomoriState cache so next persona load picks up the cleared override
	invalidateTomoriStateCache(interaction.guild?.id ?? interaction.user.id);

	// 8. Reply success
	await replyInfoEmbed(modalInteraction, locale, {
		titleKey: "commands.config.remove.modeloverride.persona_success_title",
		descriptionKey:
			"commands.config.remove.modeloverride.persona_success_description",
		descriptionVars: { persona: selectedPersona.tomori_nickname },
		color: ColorCode.SUCCESS,
	});

	log.success(
		`Persona LLM override for ${selectedPersona.tomori_nickname} (id: ${selectedPersona.tomori_id}) cleared on server ${interaction.guild?.id}`,
	);
}

// ─── Bulk Purge: All Channels ─────────────────────────────────────────────────

/**
 * Purges all channel model overrides for the server.
 * Defers immediately since no modal is needed for bulk operations.
 *
 * @param interaction - Slash command interaction
 * @param locale - User's preferred locale
 * @param tomoriState - Loaded TomoriState for this server
 */
async function handlePurgeAllChannels(
	interaction: ChatInputCommandInteraction,
	locale: string,
	tomoriState: TomoriState,
): Promise<void> {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	// 1. Check if there are any channel overrides to purge
	const overrides = await getAllChannelLlmOverridesForServer(
		tomoriState.server_id,
	);

	if (overrides.length === 0) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "commands.config.remove.modeloverride.channel_none_title",
			descriptionKey:
				"commands.config.remove.modeloverride.channel_none_description",
			color: ColorCode.WARN,
		});
		return;
	}

	// 2. Purge all channel overrides from DB
	const cleared = await clearAllChannelLlmOverridesForServer(
		tomoriState.server_id,
	);

	if (!cleared) {
		const context: ErrorContext = {
			serverId: tomoriState.server_id,
			errorType: "DatabaseDeleteError",
			metadata: { operation: "clearAllChannelLlmOverridesForServer" },
		};
		await log.error(
			"Failed to purge all channel LLM overrides",
			new Error("clearAllChannelLlmOverridesForServer returned false"),
			context,
		);
		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.update_failed_title",
			descriptionKey: "general.errors.update_failed_description",
			color: ColorCode.ERROR,
		});
		return;
	}

	// 3. Invalidate all channel LLM caches for this server
	invalidateAllChannelLlmCacheForServer(tomoriState.server_id);

	// 4. Reply success with count
	await replyInfoEmbed(interaction, locale, {
		titleKey:
			"commands.config.remove.modeloverride.purge_channels_success_title",
		descriptionKey:
			"commands.config.remove.modeloverride.purge_channels_success_description",
		descriptionVars: { count: overrides.length.toString() },
		color: ColorCode.SUCCESS,
	});

	log.success(
		`Purged all ${overrides.length} channel LLM override(s) from server ${interaction.guild?.id}`,
	);
}

// ─── Bulk Purge: All Personas ─────────────────────────────────────────────────

/**
 * Purges all persona model overrides for the server.
 * Defers immediately since no modal is needed for bulk operations.
 *
 * @param interaction - Slash command interaction
 * @param locale - User's preferred locale
 * @param tomoriState - Loaded TomoriState for this server
 */
async function handlePurgeAllPersonas(
	interaction: ChatInputCommandInteraction,
	locale: string,
	tomoriState: TomoriState,
): Promise<void> {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	// 1. Check if there are any persona overrides to purge
	const allPersonas = await getCachedAllPersonas(
		interaction.guild?.id ?? interaction.user.id,
	);
	const personasWithOverride = allPersonas.filter(
		(p) => p.persona_llm != null,
	);

	if (personasWithOverride.length === 0) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "commands.config.remove.modeloverride.persona_none_title",
			descriptionKey:
				"commands.config.remove.modeloverride.persona_none_description",
			color: ColorCode.WARN,
		});
		return;
	}

	// 2. Purge all persona overrides from DB
	const cleared = await clearAllPersonaLlmOverridesForServer(
		tomoriState.server_id,
	);

	if (!cleared) {
		const context: ErrorContext = {
			serverId: tomoriState.server_id,
			errorType: "DatabaseDeleteError",
			metadata: { operation: "clearAllPersonaLlmOverridesForServer" },
		};
		await log.error(
			"Failed to purge all persona LLM overrides",
			new Error("clearAllPersonaLlmOverridesForServer returned false"),
			context,
		);
		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.update_failed_title",
			descriptionKey: "general.errors.update_failed_description",
			color: ColorCode.ERROR,
		});
		return;
	}

	// 3. Invalidate TomoriState cache so personas reload without overrides
	invalidateTomoriStateCache(interaction.guild?.id ?? interaction.user.id);

	// 4. Reply success with count
	await replyInfoEmbed(interaction, locale, {
		titleKey:
			"commands.config.remove.modeloverride.purge_personas_success_title",
		descriptionKey:
			"commands.config.remove.modeloverride.purge_personas_success_description",
		descriptionVars: { count: personasWithOverride.length.toString() },
		color: ColorCode.SUCCESS,
	});

	log.success(
		`Purged all ${personasWithOverride.length} persona LLM override(s) from server ${interaction.guild?.id}`,
	);
}

// ─── Bulk Purge: Everything ───────────────────────────────────────────────────

/**
 * Purges all channel AND persona model overrides for the server.
 * Defers immediately since no modal is needed for bulk operations.
 *
 * @param interaction - Slash command interaction
 * @param locale - User's preferred locale
 * @param tomoriState - Loaded TomoriState for this server
 */
async function handlePurgeEverything(
	interaction: ChatInputCommandInteraction,
	locale: string,
	tomoriState: TomoriState,
): Promise<void> {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	// 1. Check how many overrides exist in each category
	const [channelOverrides, allPersonas] = await Promise.all([
		getAllChannelLlmOverridesForServer(tomoriState.server_id),
		getCachedAllPersonas(interaction.guild?.id ?? interaction.user.id),
	]);
	const personasWithOverride = allPersonas.filter(
		(p) => p.persona_llm != null,
	);

	const channelCount = channelOverrides.length;
	const personaCount = personasWithOverride.length;

	// 2. If nothing to purge, inform the user
	if (channelCount === 0 && personaCount === 0) {
		await replyInfoEmbed(interaction, locale, {
			titleKey:
				"commands.config.remove.modeloverride.purge_everything_none_title",
			descriptionKey:
				"commands.config.remove.modeloverride.purge_everything_none_description",
			color: ColorCode.WARN,
		});
		return;
	}

	// 3. Purge both categories — run in parallel since they target different tables
	const [channelCleared, personaCleared] = await Promise.all([
		channelCount > 0
			? clearAllChannelLlmOverridesForServer(tomoriState.server_id)
			: Promise.resolve(true),
		personaCount > 0
			? clearAllPersonaLlmOverridesForServer(tomoriState.server_id)
			: Promise.resolve(true),
	]);

	if (!channelCleared || !personaCleared) {
		const context: ErrorContext = {
			serverId: tomoriState.server_id,
			errorType: "DatabaseDeleteError",
			metadata: {
				operation: "purgeEverything",
				channelCleared,
				personaCleared,
			},
		};
		await log.error(
			"Failed to purge all model overrides",
			new Error(
				`Partial failure: channels=${channelCleared}, personas=${personaCleared}`,
			),
			context,
		);
		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.update_failed_title",
			descriptionKey: "general.errors.update_failed_description",
			color: ColorCode.ERROR,
		});
		return;
	}

	// 4. Invalidate both caches after successful DB writes
	if (channelCount > 0) {
		invalidateAllChannelLlmCacheForServer(tomoriState.server_id);
	}
	if (personaCount > 0) {
		invalidateTomoriStateCache(interaction.guild?.id ?? interaction.user.id);
	}

	// 5. Reply success with combined count
	const totalCount = channelCount + personaCount;
	await replyInfoEmbed(interaction, locale, {
		titleKey:
			"commands.config.remove.modeloverride.purge_everything_success_title",
		descriptionKey:
			"commands.config.remove.modeloverride.purge_everything_success_description",
		descriptionVars: {
			total: totalCount.toString(),
			channels: channelCount.toString(),
			personas: personaCount.toString(),
		},
		color: ColorCode.SUCCESS,
	});

	log.success(
		`Purged all model overrides (${channelCount} channel, ${personaCount} persona) from server ${interaction.guild?.id}`,
	);
}
