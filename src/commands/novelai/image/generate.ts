import {
	AttachmentBuilder,
	EmbedBuilder,
	MessageFlags,
	type Attachment,
	type ChatInputCommandInteraction,
	type Client,
	type SlashCommandSubcommandBuilder,
} from "discord.js";
import {
	getCachedTomoriState,
} from "@/utils/cache/tomoriStateCache";
import { decryptApiKey, getOptApiKey } from "@/utils/security/crypto";
import { ColorCode, log } from "@/utils/misc/logger";
import { localizer } from "@/utils/text/localizer";
import { replyInfoEmbed } from "@/utils/discord/interactionHelper";
import type { TomoriState, UserRow } from "@/types/db/schema";
import {
	checkImageQuota,
	incrementImageQuota,
} from "@/utils/quota/imageQuotaManager";
import {
	resolveNaiImageParams,
} from "@/utils/image/naiImageParams";
import { resolveNaiDiffusionModel } from "@/utils/image/naiDiffusionModels";
import { normalizeNaiReferenceImage } from "@/utils/image/imageProcessor";
import {
	NAI_CHAR_REF_INFO_EXTRACTED,
	NAI_CHAR_REF_STRENGTH,
	NAI_DEFAULT_NEGATIVE_PROMPT,
	generateNovelAiImage,
	isNaiV4Model,
	type NaiGenerationCharacterPayload,
} from "@/utils/image/naiImageGeneration";

const OPTION_PROMPT = "prompt";
const OPTION_ORIENTATION = "orientation";
const OPTION_NEGATIVE_TAGS = "negative_tags";
const OPTION_CHARACTER_REFERENCE = "character_reference";

function splitTags(rawTags: string): string[] {
	return rawTags
		.split(/[,\u3001]/)
		.map((tag) => tag.trim())
		.filter((tag) => tag.length > 0);
}

async function resolveNovelAiApiKey(
	tomoriState: TomoriState,
): Promise<string | null> {
	const optKey = await getOptApiKey(tomoriState.server_id, "novelai");
	if (optKey) {
		return optKey;
	}

	const encryptedApiKey = tomoriState.config.api_key;
	const keyVersion = tomoriState.config.key_version || 1;
	if (!encryptedApiKey) {
		return null;
	}

	return await decryptApiKey(encryptedApiKey, keyVersion);
}

async function prepareCharacterReferencePayload(
	attachment: Attachment,
): Promise<NaiGenerationCharacterPayload> {
	if (!attachment.contentType?.startsWith("image/")) {
		throw new Error("Invalid character reference image type");
	}

	const response = await fetch(attachment.url);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch character reference image: ${response.status} ${response.statusText}`,
		);
	}

	const sourceBuffer = Buffer.from(await response.arrayBuffer());
	const normalizedBuffer = await normalizeNaiReferenceImage(sourceBuffer);

	return {
		useCoords: false,
		referenceImages: [normalizedBuffer.toString("base64")],
		referenceStrengths: [NAI_CHAR_REF_STRENGTH],
		referenceInfoExtracted: [NAI_CHAR_REF_INFO_EXTRACTED],
	};
}

export const configureSubcommand = (
	subcommand: SlashCommandSubcommandBuilder,
) =>
	subcommand
		.setName("generate")
		.setDescription(
			localizer("en-US", "commands.novelai.image.generate.description"),
		)
		.addStringOption((option) =>
			option
				.setName(OPTION_PROMPT)
				.setDescription(
					localizer(
						"en-US",
						"commands.novelai.image.generate.prompt_description",
					),
				)
				.setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName(OPTION_ORIENTATION)
				.setDescription(
					localizer(
						"en-US",
						"commands.novelai.image.generate.orientation_description",
					),
				)
				.addChoices(
					{
						name: localizer(
							"en-US",
							"commands.novelai.image.generate.orientation_choice_portrait",
						),
						value: "portrait",
					},
					{
						name: localizer(
							"en-US",
							"commands.novelai.image.generate.orientation_choice_landscape",
						),
						value: "landscape",
					},
					{
						name: localizer(
							"en-US",
							"commands.novelai.image.generate.orientation_choice_square",
						),
						value: "square",
					},
				)
				.setRequired(false),
		)
		.addStringOption((option) =>
			option
				.setName(OPTION_NEGATIVE_TAGS)
				.setDescription(
					localizer(
						"en-US",
						"commands.novelai.image.generate.negative_tags_description",
					),
				)
				.setRequired(false),
		)
		.addAttachmentOption((option) =>
			option
				.setName(OPTION_CHARACTER_REFERENCE)
				.setDescription(
					localizer(
						"en-US",
						"commands.novelai.image.generate.character_reference_description",
					),
				)
				.setRequired(false),
		);

export async function execute(
	_client: Client,
	interaction: ChatInputCommandInteraction,
	_userData: UserRow,
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

	const serverId = interaction.guild?.id ?? interaction.user.id;
	const prompt = interaction.options.getString(OPTION_PROMPT, true).trim();
	const orientation =
		interaction.options.getString(OPTION_ORIENTATION) ?? "portrait";
	const negativeTagsInput =
		interaction.options.getString(OPTION_NEGATIVE_TAGS)?.trim() ?? "";
	const characterReference = interaction.options.getAttachment(
		OPTION_CHARACTER_REFERENCE,
	);

	try {
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

		if (!tomoriState.config.imagegen_enabled) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.generate.image.disabled_title",
				descriptionKey: "commands.generate.image.disabled_description",
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
			const errorTitleKey = "commands.generate.image.quota_exceeded_title";
			let errorDescriptionKey =
				"commands.generate.image.quota_exceeded_description";
			const descriptionVars: Record<string, string> = {};

			if (quotaCheck.resetTime) {
				const now = new Date();
				const hoursUntilReset = Math.ceil(
					(quotaCheck.resetTime.getTime() - now.getTime()) /
						(1000 * 60 * 60),
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

			await replyInfoEmbed(interaction, locale, {
				titleKey: errorTitleKey,
				descriptionKey: errorDescriptionKey,
				descriptionVars,
				footerKey: "commands.generate.image.quota_exceeded_footer",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const resolvedModel = await resolveNaiDiffusionModel(tomoriState.config);
		if (characterReference && !isNaiV4Model(resolvedModel.codename)) {
			await replyInfoEmbed(interaction, locale, {
				titleKey:
					"commands.novelai.image.generate.character_reference_requires_v4_title",
				descriptionKey:
					"commands.novelai.image.generate.character_reference_requires_v4_description",
				descriptionVars: {
					model: resolvedModel.codename,
				},
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const apiKey = await resolveNovelAiApiKey(tomoriState);
		if (!apiKey) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.novelai.image.generate.no_api_key_title",
				descriptionKey:
					"commands.novelai.image.generate.no_api_key_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const negativePromptParts =
			(tomoriState.config.nai_negative_tags?.length ?? 0) > 0
				? [...(tomoriState.config.nai_negative_tags ?? [])]
				: [NAI_DEFAULT_NEGATIVE_PROMPT];
		const userNegativeTags = splitTags(negativeTagsInput);
		negativePromptParts.push(...userNegativeTags);
		const effectiveNegativePrompt = negativePromptParts.join(", ");

		let characterPayload: NaiGenerationCharacterPayload | undefined;
		if (characterReference) {
			try {
				characterPayload =
					await prepareCharacterReferencePayload(characterReference);
			} catch (error) {
				await replyInfoEmbed(interaction, locale, {
					titleKey:
						"commands.novelai.image.generate.invalid_reference_title",
					descriptionKey:
						"commands.novelai.image.generate.invalid_reference_description",
					color: ColorCode.ERROR,
					flags: MessageFlags.Ephemeral,
				});
				log.warn(
					"[NAI] Invalid character reference attachment for slash command",
					error as Error,
				);
				return;
			}
		}

		const effectiveImageParams = resolveNaiImageParams(tomoriState.config);
		const startTime = performance.now();

		log.info(
			`[NAI] Slash command generation with model "${resolvedModel.codename}" (orientation: ${orientation}, hasRef: ${characterPayload?.referenceImages?.length ?? 0})`,
		);

		const imageBuffer = await generateNovelAiImage({
			apiKey,
			model: resolvedModel.codename,
			prompt,
			negativePrompt: effectiveNegativePrompt,
			orientation,
			imageParams: effectiveImageParams,
			characterPayload,
		});

		const generationTimeSeconds = (
			(performance.now() - startTime) /
			1000
		).toFixed(1);
		await incrementImageQuota(tomoriState.server_id, interaction.user.id);

		const filename = `nai_generated_${Date.now()}.png`;
		const attachment = new AttachmentBuilder(imageBuffer, {
			name: filename,
		});

		const successEmbed = new EmbedBuilder()
			.setTitle(
				localizer(locale, "commands.novelai.image.generate.success_title"),
			)
			.setColor(ColorCode.SUCCESS)
			.setImage(`attachment://${filename}`)
			.addFields([
				{
					name: localizer(
						locale,
						"commands.novelai.image.generate.field_prompt",
					),
					value: prompt.substring(0, 1024),
					inline: false,
				},
				{
					name: localizer(
						locale,
						"commands.novelai.image.generate.field_model",
					),
					value: resolvedModel.codename,
					inline: true,
				},
				{
					name: localizer(
						locale,
						"commands.novelai.image.generate.field_generation_time",
					),
					value: `${generationTimeSeconds}s`,
					inline: true,
				},
				{
					name: localizer(
						locale,
						"commands.novelai.image.generate.field_orientation",
					),
					value: orientation,
					inline: true,
				},
			]);

		if (negativeTagsInput) {
			successEmbed.addFields([
				{
					name: localizer(
						locale,
						"commands.novelai.image.generate.field_negative_tags",
					),
					value: negativeTagsInput.substring(0, 1024),
					inline: false,
				},
			]);
		}

		if (characterReference?.url) {
			successEmbed.setThumbnail(characterReference.url);
		}

		await interaction.followUp({
			embeds: [successEmbed],
			files: [attachment],
		});

		await replyInfoEmbed(interaction, locale, {
			titleKey:
				"commands.novelai.image.generate.success_notice_title",
			descriptionKey:
				"commands.novelai.image.generate.success_notice_description",
			color: ColorCode.SUCCESS,
			flags: MessageFlags.Ephemeral,
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		await log.error("Error in /novelai image generate command", error, {
			errorType: "CommandExecutionError",
			metadata: {
				command: "novelai image generate",
				guildId: interaction.guild?.id ?? null,
				userDiscId: interaction.user.id,
				orientation,
				hasCharacterReference: !!characterReference,
			},
		});

		if (
			errorMessage.includes("401") ||
			errorMessage.includes("403") ||
			errorMessage.includes("Unauthorized") ||
			errorMessage.includes("payment")
		) {
			await replyInfoEmbed(interaction, locale, {
				titleKey: "commands.novelai.image.generate.auth_error_title",
				descriptionKey:
					"commands.novelai.image.generate.auth_error_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
			await replyInfoEmbed(interaction, locale, {
				titleKey:
					"commands.novelai.image.generate.rate_limit_error_title",
				descriptionKey:
					"commands.novelai.image.generate.rate_limit_error_description",
				color: ColorCode.ERROR,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await replyInfoEmbed(interaction, locale, {
			titleKey: "commands.novelai.image.generate.error_title",
			descriptionKey: "commands.novelai.image.generate.error_description",
			descriptionVars: {
				error: errorMessage,
			},
			color: ColorCode.ERROR,
			flags: MessageFlags.Ephemeral,
		});
	}
}
