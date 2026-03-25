import {
	MessageFlags,
	MessageType,
	PermissionFlagsBits,
	TextInputStyle,
	type ChatInputCommandInteraction,
	type Client,
	type Message,
	type SlashCommandSubcommandBuilder,
} from "discord.js";
import { z } from "zod";
import {
	checkMessageTriggerCooldownWithWhitelist,
	setMessageTriggerCooldownWithWhitelist,
} from "@/utils/db/cooldownManager";
import { sql } from "@/utils/db/client";
import { sendCooldownDM } from "@/utils/discord/cooldownDM";
import {
	promptWithRawModal,
	replyInfoEmbed,
} from "@/utils/discord/interactionHelper";
import {
	loadSmartestModel,
	loadTomoriState,
} from "@/utils/db/dbRead";
import { getCooldownTypeFooterKey } from "@/utils/db/messageCooldown";
import { checkImageQuota } from "@/utils/quota/imageQuotaManager";
import { decryptApiKey } from "@/utils/security/crypto";
import { CooldownType, llmSchema, type LlmRow, type UserRow } from "@/types/db/schema";
import { localizer } from "@/utils/text/localizer";
import { log, ColorCode } from "@/utils/misc/logger";
import {
	providerSupportsFeature,
	resolveProviderFeatureImplementation,
} from "@/utils/provider/providerInfoRegistry";
import { resolveStructuredOutputCapability } from "@/utils/provider/providerCapabilityResolver";
import { getEffectiveLlmModelName } from "@/utils/provider/modelDisplay";
import { executeTool } from "@/tools/toolRegistry";
import { stripBridgePrefix } from "@/utils/bridge";
import type { ToolContext } from "@/types/tool/interfaces";

const MODAL_CUSTOM_ID = "bot_generate_image_modal";
const PROMPT_INPUT_ID = "bot_generate_image_prompt";
const SETTING_INPUT_ID = "bot_generate_image_setting";

const BOT_GENERATE_IMAGE_HISTORY_LIMIT = parseIntegerEnv(
	"BOT_GENERATE_IMAGE_HISTORY_LIMIT",
	24,
	5,
	100,
);
const BOT_GENERATE_IMAGE_CONTEXT_CHAR_LIMIT = parseIntegerEnv(
	"BOT_GENERATE_IMAGE_CONTEXT_CHAR_LIMIT",
	7000,
	1500,
	50000,
);
const BOT_GENERATE_IMAGE_REFERENCE_CANDIDATE_LIMIT = parseIntegerEnv(
	"BOT_GENERATE_IMAGE_REFERENCE_CANDIDATE_LIMIT",
	6,
	1,
	20,
);
const BOT_GENERATE_IMAGE_MAX_OUTPUT_TOKENS = parseIntegerEnv(
	"BOT_GENERATE_IMAGE_MAX_OUTPUT_TOKENS",
	1200,
	200,
	8192,
);

const SKIPPED_MESSAGE_TYPES = new Set([
	MessageType.UserJoin,
	MessageType.GuildBoost,
	MessageType.GuildBoostTier1,
	MessageType.GuildBoostTier2,
	MessageType.GuildBoostTier3,
	MessageType.ChannelPinnedMessage,
	MessageType.RecipientAdd,
	MessageType.RecipientRemove,
	MessageType.Call,
	MessageType.ChannelNameChange,
	MessageType.ChannelIconChange,
	MessageType.ThreadCreated,
	MessageType.ThreadStarterMessage,
	MessageType.GuildInviteReminder,
	MessageType.AutoModerationAction,
]);

type SceneSettingId = "storybeat" | "character" | "snapshot" | "vertical";

interface SceneSettingPreset {
	aspectRatio: string;
	plannerLabel: string;
	plannerInstruction: string;
}

const SCENE_SETTING_PRESETS: Record<SceneSettingId, SceneSettingPreset> = {
	storybeat: {
		aspectRatio: "16:9",
		plannerLabel: "Story Beat",
		plannerInstruction:
			"Use a wider cinematic composition that captures the immediate scene, action, and surroundings.",
	},
	character: {
		aspectRatio: "3:4",
		plannerLabel: "Character Focus",
		plannerInstruction:
			"Prioritize the main character or speaker, with closer framing and readable expression/body language.",
	},
	snapshot: {
		aspectRatio: "1:1",
		plannerLabel: "Square Snapshot",
		plannerInstruction:
			"Create a balanced square composition that still shows the current moment clearly.",
	},
	vertical: {
		aspectRatio: "9:16",
		plannerLabel: "Phone Wallpaper",
		plannerInstruction:
			"Use tall vertical framing with strong silhouette, depth, and room for a wallpaper-style composition.",
	},
};

const SceneImagePlanSchema = z.object({
	scene_summary: z.string().min(5).max(160),
	prompt: z.string().min(30).max(1600),
	reference_message_id: z.string().regex(/^\d{17,19}$/).or(z.literal("")),
});

type SceneImagePlan = z.infer<typeof SceneImagePlanSchema>;

interface VisualReferenceCandidate {
	messageId: string;
	description: string;
}

interface FormattedSceneEntry {
	text: string;
	referenceCandidate?: VisualReferenceCandidate;
}

interface SceneHistoryContext {
	contextText: string;
	messageCount: number;
	referenceCandidates: VisualReferenceCandidate[];
}

type ImageQuotaCheckResult = Awaited<ReturnType<typeof checkImageQuota>>;

export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("image")
		.setDescription(localizer("en-US", "commands.bot.generate.image.description"));

function parseIntegerEnv(
	name: string,
	fallback: number,
	min: number,
	max: number,
): number {
	const parsed = Number.parseInt(process.env[name] ?? "", 10);
	if (Number.isNaN(parsed)) {
		return fallback;
	}

	return Math.min(Math.max(parsed, min), max);
}

function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}

	return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function getSettingOptions(locale: string) {
	return [
		{
			label: localizer(
				locale,
				"commands.bot.generate.image.modal.setting_storybeat_label",
			),
			value: "storybeat",
			description: localizer(
				locale,
				"commands.bot.generate.image.modal.setting_storybeat_description",
			),
		},
		{
			label: localizer(
				locale,
				"commands.bot.generate.image.modal.setting_character_label",
			),
			value: "character",
			description: localizer(
				locale,
				"commands.bot.generate.image.modal.setting_character_description",
			),
		},
		{
			label: localizer(
				locale,
				"commands.bot.generate.image.modal.setting_snapshot_label",
			),
			value: "snapshot",
			description: localizer(
				locale,
				"commands.bot.generate.image.modal.setting_snapshot_description",
			),
		},
		{
			label: localizer(
				locale,
				"commands.bot.generate.image.modal.setting_vertical_label",
			),
			value: "vertical",
			description: localizer(
				locale,
				"commands.bot.generate.image.modal.setting_vertical_description",
			),
		},
	];
}

function isImageAttachment(messageAttachment: {
	contentType?: string | null;
	name?: string | null;
}): boolean {
	if (messageAttachment.contentType?.startsWith("image/")) {
		return true;
	}

	return /\.(png|jpe?g|webp|gif|bmp)$/i.test(messageAttachment.name ?? "");
}

function extractCustomEmojiNames(content: string): string[] {
	const names: string[] = [];
	const seenNames = new Set<string>();
	const emojiPattern = /<(?:a?):([^:]+):\d{17,20}>/g;
	let match: RegExpExecArray | null;

	// biome-ignore lint/suspicious/noAssignInExpressions: Regex iteration
	while ((match = emojiPattern.exec(content)) !== null) {
		const emojiName = match[1];
		if (!seenNames.has(emojiName)) {
			seenNames.add(emojiName);
			names.push(emojiName);
		}
	}

	return names;
}

function formatSceneEntry(message: Message): FormattedSceneEntry | null {
	if (SKIPPED_MESSAGE_TYPES.has(message.type)) {
		return null;
	}

	const textSegments: string[] = [];
	const visualSegments: string[] = [];
	const cleanContent = message.cleanContent.trim();

	if (cleanContent) {
		textSegments.push(`text="${truncateText(cleanContent.replace(/\s+/g, " "), 500)}"`);
	}

	const imageAttachmentNames = [...message.attachments.values()]
		.filter((attachment) => isImageAttachment(attachment))
		.map((attachment) => attachment.name ?? "image");
	if (imageAttachmentNames.length > 0) {
		visualSegments.push(
			`image attachments: ${truncateText(imageAttachmentNames.join(", "), 180)}`,
		);
	}

	const embedVisualCount = message.embeds.filter(
		(embed) => embed.image?.url || embed.thumbnail?.url,
	).length;
	if (embedVisualCount > 0) {
		visualSegments.push(
			embedVisualCount === 1
				? "embedded image preview"
				: `${embedVisualCount} embedded image previews`,
		);
	}

	if (message.stickers.size > 0) {
		const stickerNames = [...message.stickers.values()].map(
			(sticker) => sticker.name,
		);
		visualSegments.push(
			`stickers: ${truncateText(stickerNames.join(", "), 180)}`,
		);
	}

	const emojiNames = extractCustomEmojiNames(message.content);
	if (emojiNames.length > 0) {
		visualSegments.push(
			`custom emojis: ${truncateText(emojiNames.join(", "), 180)}`,
		);
	}

	if (textSegments.length === 0 && visualSegments.length === 0) {
		return null;
	}

	const authorName = stripBridgePrefix(
		message.member?.displayName ?? message.author.username ?? "Unknown",
	);

	const lineParts = [
		`[${message.createdAt.toISOString()}]`,
		`id=${message.id}`,
		`${authorName}:`,
		...textSegments,
	];

	if (visualSegments.length > 0) {
		lineParts.push(`visuals=[${visualSegments.join("; ")}]`);
	}

	return {
		text: lineParts.join(" "),
		referenceCandidate:
			visualSegments.length > 0
				? {
						messageId: message.id,
						description: truncateText(
							`${authorName}: ${visualSegments.join("; ")}`,
							220,
						),
					}
				: undefined,
	};
}

function buildSceneHistoryContext(messages: Message[]): SceneHistoryContext {
	const formattedEntries = messages
		.map((message) => formatSceneEntry(message))
		.filter((entry): entry is FormattedSceneEntry => Boolean(entry));

	if (formattedEntries.length === 0) {
		return {
			contextText: "",
			messageCount: 0,
			referenceCandidates: [],
		};
	}

	const selectedNewestFirst: FormattedSceneEntry[] = [];
	let totalLength = 0;

	for (let index = formattedEntries.length - 1; index >= 0; index--) {
		const entry = formattedEntries[index];
		const entryLength = entry.text.length + 1;
		if (
			selectedNewestFirst.length > 0 &&
			totalLength + entryLength > BOT_GENERATE_IMAGE_CONTEXT_CHAR_LIMIT
		) {
			break;
		}

		selectedNewestFirst.push(entry);
		totalLength += entryLength;
	}

	const selectedEntries = selectedNewestFirst.reverse();
	const referenceCandidates = [...selectedEntries]
		.reverse()
		.flatMap((entry) =>
			entry.referenceCandidate ? [entry.referenceCandidate] : [],
		)
		.slice(0, BOT_GENERATE_IMAGE_REFERENCE_CANDIDATE_LIMIT);

	return {
		contextText: selectedEntries.map((entry) => entry.text).join("\n"),
		messageCount: selectedEntries.length,
		referenceCandidates,
	};
}

async function replyQuotaExceeded(
	replyTarget:
		| ChatInputCommandInteraction
		| import("discord.js").ModalSubmitInteraction,
	locale: string,
	quotaCheck: ImageQuotaCheckResult,
): Promise<void> {
	const errorTitleKey = "commands.generate.image.quota_exceeded_title";
	let errorDescriptionKey =
		"commands.generate.image.quota_exceeded_description";
	const descriptionVars: Record<string, string> = {};

	if (quotaCheck.resetTime) {
		const now = new Date();
		const hoursUntilReset = Math.ceil(
			(quotaCheck.resetTime.getTime() - now.getTime()) / (1000 * 60 * 60),
		);

		if (hoursUntilReset < 24) {
			descriptionVars.reset_info = localizer(
				locale,
				"commands.generate.image.quota_resets_in_hours",
				{ hours: hoursUntilReset.toString() },
			);
		} else {
			descriptionVars.reset_info = localizer(
				locale,
				"commands.generate.image.quota_resets_in_days",
				{ days: Math.ceil(hoursUntilReset / 24).toString() },
			);
		}
	}

	if (quotaCheck.reason === "user_quota_exceeded") {
		errorDescriptionKey =
			"commands.generate.image.user_quota_exceeded_description";
	} else if (quotaCheck.reason === "serverwide_quota_exceeded") {
		errorDescriptionKey =
			"commands.generate.image.serverwide_quota_exceeded_description";
	}

	await replyInfoEmbed(replyTarget, locale, {
		titleKey: errorTitleKey,
		descriptionKey: errorDescriptionKey,
		descriptionVars,
		footerKey: "commands.generate.image.quota_exceeded_footer",
		color: ColorCode.ERROR,
		flags: MessageFlags.Ephemeral,
	});
}

async function resolveScenePlannerModel(tomoriState: {
	llm: LlmRow;
	config: { custom_model_name?: string | null };
}): Promise<string | null> {
	if (tomoriState.llm.supports_structoutput) {
		return getEffectiveLlmModelName(
			tomoriState.llm,
			tomoriState.config.custom_model_name,
		);
	}

	const provider = tomoriState.llm.llm_provider.toLowerCase();
	const smartestModel = await loadSmartestModel(provider);
	if (smartestModel?.supports_structoutput) {
		return smartestModel.llm_codename;
	}

	const rows = await sql`
		SELECT *
		FROM llms
		WHERE llm_provider = ${provider}
			AND supports_structoutput = true
			AND is_deprecated = false
		ORDER BY is_smartest DESC, is_default DESC, llm_id ASC
		LIMIT 1
	`;

	if (rows.length === 0) {
		return null;
	}

	const parsedRow = llmSchema.safeParse(rows[0]);
	if (!parsedRow.success) {
		log.error(
			"Failed to validate fallback structured-output planner model",
			parsedRow.error,
			{
				errorType: "BotGenerateImagePlannerModelValidationError",
				metadata: { provider },
			},
		);
		return null;
	}

	return parsedRow.data.llm_codename;
}

async function generateScenePlan(params: {
	apiKey: string;
	plannerModel: string;
	provider: string;
	endpointUrl?: string;
	extraDirection?: string;
	setting: SceneSettingPreset;
	allowReferenceImages: boolean;
	sceneHistory: SceneHistoryContext;
}): Promise<
	| { success: true; plan: SceneImagePlan }
	| { success: false; error: string }
> {
	const capability = await resolveStructuredOutputCapability(params.provider);
	if (!capability) {
		return {
			success: false,
			error: "Structured output is unavailable for the current provider.",
		};
	}

	const referenceInstructions = params.allowReferenceImages
		? params.sceneHistory.referenceCandidates.length > 0
			? `You may choose one reference_message_id from the candidate list if it materially helps preserve character appearance, props, or scene continuity. If none help, return an empty string.`
			: `No useful reference candidates were found. reference_message_id must be an empty string.`
		: `The active image provider is text-to-image only. reference_message_id must be an empty string.`;

	const referenceCandidateLines =
		params.allowReferenceImages && params.sceneHistory.referenceCandidates.length > 0
			? params.sceneHistory.referenceCandidates
					.map(
						(candidate) =>
							`- ${candidate.messageId}: ${candidate.description}`,
					)
					.join("\n")
			: "- none";

	const systemPrompt = [
		"You are a hidden scene-to-image planning subagent for a Discord chatbot.",
		"Turn the recent channel context into one polished image-generation prompt for the immediate ongoing scene.",
		"Stay grounded in the latest messages and prefer the present moment over broad backstory or generic cover art.",
		"Make the prompt visually specific, self-contained, and ready for an image model.",
		"Do not mention Discord, chat logs, message IDs, or the fact that this came from a conversation.",
		"Blend any extra user direction naturally instead of appending it verbatim.",
		referenceInstructions,
		"Return JSON only.",
	].join("\n");

	const userPrompt = [
		`Framing preset: ${params.setting.plannerLabel}`,
		`Aspect ratio: ${params.setting.aspectRatio}`,
		`Preset instruction: ${params.setting.plannerInstruction}`,
		`Extra user direction: ${params.extraDirection?.trim() || "(none)"}`,
		"",
		"Reference candidates:",
		referenceCandidateLines,
		"",
		"Recent channel context:",
		params.sceneHistory.contextText,
	].join("\n");

	const result = await capability.callStructuredJSON(
		{
			apiKey: params.apiKey,
			model: params.plannerModel,
			endpointUrl: params.endpointUrl,
			systemPrompt,
			userPrompt,
			temperature: 0.7,
			maxOutputTokens: BOT_GENERATE_IMAGE_MAX_OUTPUT_TOKENS,
			schemaName: "bot_scene_image_plan",
		},
		{
			type: "object",
			properties: {
				scene_summary: {
					type: "string",
					minLength: 5,
					maxLength: 160,
					description: "One short sentence naming the scene being illustrated.",
				},
				prompt: {
					type: "string",
					minLength: 30,
					maxLength: 1600,
					description:
						"A polished image-generation prompt for the current scene.",
				},
				reference_message_id: {
					type: "string",
					description:
						"A single reference message ID from the candidate list, or an empty string if no reference should be used.",
				},
			},
			required: ["scene_summary", "prompt", "reference_message_id"],
		},
		SceneImagePlanSchema,
	);

	if (!result.success) {
		return {
			success: false,
			error: result.error,
		};
	}

	const allowedReferenceIds = new Set(
		params.sceneHistory.referenceCandidates.map((candidate) => candidate.messageId),
	);

	const referenceMessageId =
		params.allowReferenceImages &&
		result.data.reference_message_id &&
		allowedReferenceIds.has(result.data.reference_message_id)
			? result.data.reference_message_id
			: "";

	return {
		success: true,
		plan: {
			...result.data,
			reference_message_id: referenceMessageId,
		},
	};
}

export async function execute(
	client: Client,
	interaction: ChatInputCommandInteraction,
	_userData: UserRow,
	locale: string,
): Promise<void> {
	if (!interaction.guild || !interaction.channel || !("messages" in interaction.channel)) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.guild_only_title",
			descriptionKey: "general.errors.guild_only_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const botMember = interaction.guild.members.me;
	if (!botMember) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.unknown_error_title",
			descriptionKey: "general.errors.unknown_error_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const guildChannel =
		interaction.guild.channels.cache.get(interaction.channel.id) ??
		interaction.channel;
	if (!("permissionsFor" in guildChannel)) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.unknown_error_title",
			descriptionKey: "general.errors.unknown_error_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const permissions = guildChannel.permissionsFor(botMember);
	const requiresThreadSendPermission =
		"isThread" in guildChannel &&
		typeof guildChannel.isThread === "function" &&
		guildChannel.isThread();
	const canSendMessages = requiresThreadSendPermission
		? permissions?.has(PermissionFlagsBits.SendMessagesInThreads)
		: permissions?.has(PermissionFlagsBits.SendMessages);

	if (
		!permissions?.has(PermissionFlagsBits.ViewChannel) ||
		!permissions?.has(PermissionFlagsBits.ReadMessageHistory) ||
		!permissions?.has(PermissionFlagsBits.AttachFiles) ||
		!canSendMessages
	) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "commands.bot.generate.image.missing_permissions_title",
			descriptionKey:
				"commands.bot.generate.image.missing_permissions_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const tomoriState = await loadTomoriState(interaction.guild.id);
	if (!tomoriState) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "general.errors.unknown_error_title",
			descriptionKey: "general.errors.unknown_error_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const cooldownType = tomoriState.config.cooldown_type ?? CooldownType.OFF;
	const cooldownLength = tomoriState.config.cooldown_length ?? 5;
	const cooldownResult = await checkMessageTriggerCooldownWithWhitelist(
		interaction.guild.id,
		interaction.user.id,
		interaction.channel.id,
		cooldownType,
		interaction.member as import("discord.js").GuildMember | null,
	);

	if (cooldownResult.isOnCooldown) {
		if (cooldownResult.blockedByWhitelist) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "general.message_cooldown_title",
				descriptionKey: "commands.bot.generate.image.channel_not_whitelisted",
				color: ColorCode.WARN,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const footerKey = getCooldownTypeFooterKey(cooldownResult.cooldownType);
		await sendCooldownDM(
			interaction.user,
			locale,
			"general.message_cooldown_title",
			"commands.bot.generate.image.cooldown_active",
			{
				seconds: cooldownResult.remainingSeconds.toString(),
				botName: tomoriState.tomori_nickname,
			},
			footerKey,
			interaction,
			MessageFlags.Ephemeral,
		);
		return;
	}

	if (!tomoriState.config.imagegen_enabled) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "commands.generate.image.disabled_title",
			descriptionKey: "commands.generate.image.disabled_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const provider = tomoriState.llm.llm_provider.toLowerCase();
	if (!providerSupportsFeature(provider, "nativeImageGeneration")) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "commands.generate.image.wrong_provider_title",
			descriptionKey: "commands.generate.image.wrong_provider_description",
			descriptionVars: {
				current_provider: tomoriState.llm.llm_provider,
			},
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const structuredOutputCapability = await resolveStructuredOutputCapability(
		provider,
	);
	if (!structuredOutputCapability) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "commands.bot.generate.image.planner_unavailable_title",
			descriptionKey:
				"commands.bot.generate.image.planner_unavailable_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (!tomoriState.config.api_key) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "commands.generate.image.no_api_key_title",
			descriptionKey: "commands.generate.image.no_api_key_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (!tomoriState.config.diffusion_model_id) {
		await replyInfoEmbed(interaction, locale, {
			titleKey: "commands.generate.image.no_diffusion_model_title",
			descriptionKey: "commands.generate.image.no_diffusion_model_description",
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const quotaCheck = await checkImageQuota(
		tomoriState.server_id,
		interaction.user.id,
	);
	if (!quotaCheck.allowed) {
		await replyQuotaExceeded(interaction, locale, quotaCheck);
		return;
	}

	const modalResult = await promptWithRawModal(
		interaction,
		locale,
		{
			modalCustomId: MODAL_CUSTOM_ID,
			modalTitleKey: "commands.bot.generate.image.modal.title",
			components: [
				{
					customId: PROMPT_INPUT_ID,
					labelKey: "commands.bot.generate.image.modal.prompt_label",
					descriptionKey:
						"commands.bot.generate.image.modal.prompt_description",
					placeholder: localizer(
						locale,
						"commands.bot.generate.image.modal.prompt_placeholder",
					),
					required: false,
					style: TextInputStyle.Paragraph,
					maxLength: 1000,
				},
				{
					kind: "radioGroup" as const,
					customId: SETTING_INPUT_ID,
					labelKey: "commands.bot.generate.image.modal.setting_label",
					descriptionKey:
						"commands.bot.generate.image.modal.setting_description",
					required: true,
					options: getSettingOptions(locale),
				},
			],
		},
		MessageFlags.Ephemeral,
	);

	if (modalResult.outcome !== "submit" || !modalResult.interaction) {
		return;
	}

	const modalSubmitInteraction = modalResult.interaction;

	try {
		const apiKey = await decryptApiKey(
			tomoriState.config.api_key,
			tomoriState.config.key_version || 1,
		);
		if (!apiKey) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "commands.generate.image.api_key_decrypt_failed_title",
				descriptionKey:
					"commands.generate.image.api_key_decrypt_failed_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		const plannerModel = await resolveScenePlannerModel(tomoriState);
		if (!plannerModel) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "commands.bot.generate.image.planner_unavailable_title",
				descriptionKey:
					"commands.bot.generate.image.planner_unavailable_description",
				color: ColorCode.ERROR,
			});
			return;
		}

		const recentMessages = await interaction.channel.messages.fetch({
			limit: BOT_GENERATE_IMAGE_HISTORY_LIMIT,
		});
		const sceneHistory = buildSceneHistoryContext(
			[...recentMessages.values()].reverse(),
		);

		if (sceneHistory.messageCount === 0) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "commands.bot.generate.image.no_messages_title",
				descriptionKey: "commands.bot.generate.image.no_messages_description",
				color: ColorCode.WARN,
			});
			return;
		}

		const selectedSetting =
			(modalResult.values?.[SETTING_INPUT_ID] as SceneSettingId | undefined) ??
			"storybeat";
		const settingPreset =
			SCENE_SETTING_PRESETS[selectedSetting] ??
			SCENE_SETTING_PRESETS.storybeat;
		const imageGenerationImplementation = resolveProviderFeatureImplementation(
			provider,
			"nativeImageGeneration",
		);
		const allowReferenceImages =
			imageGenerationImplementation !== "zai" &&
			imageGenerationImplementation !== "nvidia";
		const extraDirection = modalResult.values?.[PROMPT_INPUT_ID]?.trim();

		log.info(
			`[/bot generate image] Planning scene image for channel ${interaction.channel.id} using ${plannerModel} (${sceneHistory.messageCount} messages, ${sceneHistory.referenceCandidates.length} visual candidates)`,
		);

		const planResult = await generateScenePlan({
			apiKey,
			plannerModel,
			provider,
			endpointUrl: tomoriState.config.custom_endpoint_url ?? undefined,
			extraDirection,
			setting: settingPreset,
			allowReferenceImages,
			sceneHistory,
		});

		if (!planResult.success) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "commands.bot.generate.image.planner_failed_title",
				descriptionKey: "commands.bot.generate.image.planner_failed_description",
				descriptionVars: { error: planResult.error },
				color: ColorCode.ERROR,
			});
			return;
		}

		const imageToolArgs: Record<string, unknown> = {
			prompt: planResult.plan.prompt,
			aspect_ratio: settingPreset.aspectRatio,
		};
		if (planResult.plan.reference_message_id) {
			imageToolArgs.message_id = planResult.plan.reference_message_id;
		}

		const toolContext: ToolContext = {
			channel: interaction.channel as ToolContext["channel"],
			client,
			userId: interaction.user.id,
			guildId: interaction.guild.id,
			tomoriState,
			locale,
			provider,
			suppressProgressNotices: true,
		};

		const toolResult = await executeTool(
			"generate_image",
			imageToolArgs,
			toolContext,
		);

		if (!toolResult.success) {
			await replyInfoEmbed(modalSubmitInteraction, locale, {
				titleKey: "commands.generate.image.error_generation_failed_title",
				descriptionKey:
					"commands.generate.image.error_generation_failed_description",
				descriptionVars: {
					error: toolResult.error ?? "Unknown image generation error",
				},
				color: ColorCode.ERROR,
			});
			return;
		}

		log.success(
			`[/bot generate image] Posted scene image for channel ${interaction.channel.id}: ${planResult.plan.scene_summary}`,
		);

		await replyInfoEmbed(modalSubmitInteraction, locale, {
			titleKey: "commands.bot.generate.image.success_title",
			descriptionKey: "commands.bot.generate.image.success_description",
			color: ColorCode.SUCCESS,
		});

		await setMessageTriggerCooldownWithWhitelist(
			interaction.guild.id,
			interaction.user.id,
			interaction.channel.id,
			cooldownType,
			cooldownLength,
			interaction.member as import("discord.js").GuildMember | null,
		);
	} catch (error) {
		log.error("Error in /bot generate image", error as Error, {
			errorType: "BotGenerateImageCommandError",
			metadata: {
				userId: interaction.user.id,
				guildId: interaction.guild.id,
				channelId: interaction.channel.id,
			},
		});

		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		await replyInfoEmbed(modalSubmitInteraction, locale, {
			titleKey: "commands.generate.image.error_generation_failed_title",
			descriptionKey:
				"commands.generate.image.error_generation_failed_description",
			descriptionVars: { error: errorMessage },
			color: ColorCode.ERROR,
		});
	}
}
