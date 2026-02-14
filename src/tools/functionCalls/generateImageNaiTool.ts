/**
 * NovelAI Image Generation Tool
 * Generates images using NovelAI's diffusion models with imageboard-style tag prompts.
 * Supports self-portrait mode that prepends persona's character tags to the prompt.
 */

import { AttachmentBuilder } from "discord.js";
import JSZip from "jszip";
import { log } from "../../utils/misc/logger";
import { localizer } from "../../utils/text/localizer";
import {
	BaseTool,
	type ToolContext,
	type ToolResult,
	type ToolParameterSchema,
} from "../../types/tool/interfaces";
import { sql } from "../../utils/db/client";
import { decryptApiKey } from "../../utils/security/crypto";
import {
	checkImageQuota,
	incrementImageQuota,
} from "../../utils/quota/imageQuotaManager";

// Configurable generation parameters via environment variables
const NAI_STEPS = Number.parseInt(process.env.NAI_IMAGE_STEPS || "23", 10);
const NAI_SCALE = Number.parseFloat(process.env.NAI_IMAGE_SCALE || "5");
const NAI_SAMPLER = process.env.NAI_IMAGE_SAMPLER || "k_euler_ancestral";
const NAI_NOISE_SCHEDULE =
	process.env.NAI_IMAGE_NOISE_SCHEDULE || "karras";
const NAI_NEGATIVE_PROMPT =
	process.env.NAI_IMAGE_NEGATIVE_PROMPT ||
	"blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page";

/** Base URL for NovelAI's image generation API */
const NAI_IMAGE_BASE_URL = "https://image.novelai.net";

/** Orientation presets mapping to width/height pairs */
const ORIENTATION_PRESETS: Record<string, { width: number; height: number }> = {
	portrait: { width: 832, height: 1216 },
	landscape: { width: 1216, height: 832 },
	square: { width: 1024, height: 1024 },
};

/** Pattern to detect Japanese characters for language selection in tag suggestion */
const JAPANESE_CHAR_PATTERN = /[\u3000-\u9FFF\uF900-\uFAFF]/;

/**
 * Response shape from NovelAI's suggest-tags endpoint
 */
interface SuggestTagsResponse {
	tags: Array<{
		tag: string;
		confidence: number;
		count: number;
	}>;
}

/**
 * Tool for generating images using NovelAI's diffusion models.
 * Uses imageboard-style tag prompts instead of natural language descriptions.
 */
export class GenerateImageNaiTool extends BaseTool {
	name = "generate_image_nai";
	description =
		"Generate an AI image using NovelAI's diffusion models. Provide imageboard-style tags (e.g. '1girl, short hair, red eyes, sunset'). If is_self_portrait is true, the persona's character tags are automatically prepended. The image will be sent directly to the Discord channel.";
	category = "utility" as const;
	requiresFeatureFlag = "image_gen";

	parameters: ToolParameterSchema = {
		type: "object",
		properties: {
			prompt: {
				type: "string",
				description:
					"Imageboard-style tags for image generation, separated by commas (e.g. '1girl, short hair, red eyes, sunset, masterpiece'). Tags describe the desired image content, style, and quality.",
			},
			orientation: {
				type: "string",
				description:
					"Image orientation/aspect ratio. 'portrait' (832x1216), 'landscape' (1216x832), or 'square' (1024x1024). Default: portrait.",
				enum: ["portrait", "landscape", "square"],
			},
			is_self_portrait: {
				type: "boolean",
				description:
					"If true, automatically prepends the persona's configured character tags (from /nai charactertags) to the prompt for consistent self-portraits.",
			},
		},
		required: ["prompt"],
	};

	/**
	 * NovelAI image generation is only available when the provider is novelai
	 * @param provider - LLM provider name
	 * @returns True only for 'novelai' provider
	 */
	isAvailableFor(provider: string): boolean {
		return provider === "novelai";
	}

	/**
	 * Check if image generation is enabled in Tomori config
	 * @param context - Tool execution context
	 * @returns True if image generation feature flag is enabled
	 */
	protected isEnabled(context: ToolContext): boolean {
		return context.tomoriState.config.imagegen_enabled;
	}

	/**
	 * Retrieves the diffusion model codename from the database by its ID
	 * @param diffusionModelId - Database ID of the diffusion model
	 * @returns The model codename string (e.g., "nai-diffusion-4.5-full")
	 */
	private async getDiffusionModelCodename(
		diffusionModelId: number,
	): Promise<string> {
		const result = await sql`
			SELECT codename
			FROM image_diffusion_models
			WHERE diffusion_model_id = ${diffusionModelId}
		`.values();

		if (result.length === 0) {
			throw new Error(
				`Diffusion model not found in database: ${diffusionModelId}`,
			);
		}

		return result[0][0] as string;
	}

	/**
	 * Sends a generated image to the Discord channel via webhook (for persona avatar) or direct message.
	 * Prefers webhook for consistent persona appearance, falls back to bot message.
	 * @param context - Tool execution context with channel and webhook info
	 * @param attachment - The image attachment to send
	 * @returns The sent Discord message
	 */
	private async sendGeneratedImage(
		context: ToolContext,
		attachment: AttachmentBuilder,
	): Promise<import("discord.js").Message> {
		const threadId =
			"isThread" in context.channel &&
			typeof context.channel.isThread === "function" &&
			context.channel.isThread()
				? context.channel.id
				: undefined;

		if (context.webhook && context.personaUsername) {
			try {
				return await context.webhook.send({
					files: [attachment],
					username: context.personaUsername,
					avatarURL: context.personaAvatarUrl,
					...(threadId ? { threadId } : {}),
				});
			} catch (error) {
				log.warn(
					"Failed to send NAI generated image via webhook, falling back to bot message",
					error as Error,
				);
			}
		}

		return await context.channel.send({ files: [attachment] });
	}

	/**
	 * Calls NovelAI's suggest-tags API to normalize a single tag.
	 * Automatically detects Japanese characters for language selection.
	 * @param tag - The raw tag to normalize
	 * @param model - The diffusion model codename
	 * @param apiKey - Decrypted NovelAI API key
	 * @returns The best-matching normalized tag, or the original if suggestion fails
	 */
	private async suggestTag(
		tag: string,
		model: string,
		apiKey: string,
	): Promise<string> {
		try {
			// Detect language based on character content
			const lang = JAPANESE_CHAR_PATTERN.test(tag) ? "jp" : "en";

			const response = await fetch(
				`${NAI_IMAGE_BASE_URL}/ai/generate-image/suggest-tags`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						model,
						prompt: tag,
						lang,
					}),
				},
			);

			if (!response.ok) {
				log.warn(
					`NAI suggest-tags failed for "${tag}": ${response.status} ${response.statusText}`,
				);
				return tag;
			}

			const data = (await response.json()) as SuggestTagsResponse;

			// Pick the suggestion with highest confidence, or keep original
			if (data.tags && data.tags.length > 0) {
				const bestMatch = data.tags.reduce((best, current) =>
					current.confidence > best.confidence ? current : best,
				);
				return bestMatch.tag;
			}

			return tag;
		} catch (error) {
			log.warn(
				`NAI suggest-tags error for "${tag}": ${(error as Error).message}`,
			);
			return tag;
		}
	}

	/**
	 * Normalizes all tags in the prompt by calling the suggest-tags API in parallel.
	 * Each tag is independently resolved; failures fall back to the original tag.
	 * @param tags - Array of raw tags to normalize
	 * @param model - The diffusion model codename
	 * @param apiKey - Decrypted NovelAI API key
	 * @returns Array of normalized tags in the same order
	 */
	private async normalizeTags(
		tags: string[],
		model: string,
		apiKey: string,
	): Promise<string[]> {
		const results = await Promise.allSettled(
			tags.map((tag) => this.suggestTag(tag, model, apiKey)),
		);

		return results.map((result, index) =>
			result.status === "fulfilled" ? result.value : tags[index],
		);
	}

	/**
	 * Calls NovelAI's generate-image API and extracts the PNG from the ZIP response.
	 *
	 * Flow:
	 * 1. Build request payload with model, prompt, and generation parameters
	 * 2. Send POST request to NovelAI image generation endpoint
	 * 3. Receive ZIP response containing the generated PNG
	 * 4. Extract the first PNG file from the ZIP archive
	 *
	 * @param apiKey - Decrypted NovelAI API key
	 * @param model - Diffusion model codename
	 * @param prompt - Normalized tag prompt string (comma-separated)
	 * @param orientation - Image orientation key (portrait/landscape/square)
	 * @returns Buffer containing the generated PNG image data
	 */
	/**
	 * Checks whether the given model codename is a v4+ model that requires the v4_prompt format.
	 * V4 models use a structured caption object instead of a flat prompt string.
	 * @param model - Diffusion model codename
	 * @returns True if the model requires v4_prompt format
	 */
	private isV4Model(model: string): boolean {
		// Match models like nai-diffusion-4-5-full, nai-diffusion-4-5-curated, or future nai-diffusion-4-*
		return /nai-diffusion-4/.test(model);
	}

	private async generateImage(
		apiKey: string,
		model: string,
		prompt: string,
		orientation: string,
	): Promise<Buffer> {
		const dimensions =
			ORIENTATION_PRESETS[orientation] || ORIENTATION_PRESETS.portrait;
		const seed = Math.floor(Math.random() * 2147483647);

		// 1. Build request payload — v4 models require a different parameter structure than v3
		let requestPayload: Record<string, unknown>;

		if (this.isV4Model(model)) {
			// V4+ models: prompt goes in input, parameters.prompt, AND v4_prompt.caption.base_caption
			// Negative prompt goes in both parameters.uc AND v4_negative_prompt.caption.base_caption
			// Structure reverse-engineered from NovelAI website network requests
			requestPayload = {
				action: "generate",
				input: prompt,
				model,
				parameters: {
					prompt,
					seed,
					n_samples: 1,
					steps: NAI_STEPS,
					height: dimensions.height,
					width: dimensions.width,
					scale: NAI_SCALE,
					uncond_scale: 0.0,
					cfg_rescale: 0.0,
					sampler: NAI_SAMPLER,
					noise_schedule: NAI_NOISE_SCHEDULE,
					legacy_v3_extend: false,
					reference_information_extracted_multiple: [],
					reference_strength_multiple: [],
					v4_prompt: {
						caption: {
							base_caption: prompt,
							char_captions: [],
						},
						use_coords: false,
						use_order: true,
						legacy_uc: false,
					},
					v4_negative_prompt: {
						caption: {
							base_caption: NAI_NEGATIVE_PROMPT,
							char_captions: [],
						},
						use_coords: false,
						use_order: false,
						legacy_uc: false,
					},
					controlnet_strength: 1.0,
					controlnet_model: null,
					dynamic_thresholding: false,
					dynamic_thresholding_percentile: 0.999,
					dynamic_thresholding_mimic_scale: 10.0,
					sm: false,
					sm_dyn: false,
					skip_cfg_above_sigma: null,
					skip_cfg_below_sigma: 0.0,
					lora_unet_weights: null,
					lora_clip_weights: null,
					deliberate_euler_ancestral_bug: false,
					prefer_brownian: true,
					cfg_sched_eligibility:
						"enable_for_post_summer_samplers",
					explike_fine_detail: false,
					minimize_sigma_inf: false,
					uncond_per_vibe: true,
					wonky_vibe_correlation: true,
					version: 1,
					uc: NAI_NEGATIVE_PROMPT,
					request_type: "PromptGenerateRequest",
				},
			};
		} else {
			// V3 models: simpler flat structure with negative_prompt
			requestPayload = {
				action: "generate",
				input: prompt,
				model,
				parameters: {
					width: dimensions.width,
					height: dimensions.height,
					steps: NAI_STEPS,
					scale: NAI_SCALE,
					sampler: NAI_SAMPLER,
					noise_schedule: NAI_NOISE_SCHEDULE,
					n_samples: 1,
					seed,
					negative_prompt: NAI_NEGATIVE_PROMPT,
				},
			};
		}

		log.info(
			`[NAI] Generating image with model "${model}" (${dimensions.width}x${dimensions.height}, seed: ${seed})`,
		);

		// Debug: log full request payload to compare against working examples
		log.info(
			`[NAI] Full request payload:\n${JSON.stringify(requestPayload, null, 2)}`,
		);

		// 2. Send generation request
		const response = await fetch(
			`${NAI_IMAGE_BASE_URL}/ai/generate-image`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(requestPayload),
			},
		);

		if (!response.ok) {
			const errorText = await response.text().catch(() => "");
			const snippet = errorText.slice(0, 500);
			throw new Error(
				`NovelAI image generation failed (${response.status} ${response.statusText}): ${snippet}`,
			);
		}

		// 3. Extract PNG from ZIP response
		const zipBuffer = Buffer.from(await response.arrayBuffer());
		const zip = await JSZip.loadAsync(zipBuffer);

		// 4. Find the first PNG file in the archive
		const pngFileName = Object.keys(zip.files).find((name) =>
			name.toLowerCase().endsWith(".png"),
		);

		if (!pngFileName) {
			throw new Error(
				"NovelAI response ZIP did not contain a PNG file",
			);
		}

		const pngData = await zip.files[pngFileName].async("nodebuffer");
		return Buffer.from(pngData);
	}

	/**
	 * Execute NovelAI image generation.
	 *
	 * Flow:
	 * 1. Validate parameters and feature flag
	 * 2. Check image quota
	 * 3. Get diffusion model and decrypt API key
	 * 4. Prepend persona character tags if self-portrait mode
	 * 5. Normalize tags via suggest-tags API
	 * 6. Generate image via NAI API
	 * 7. Send image to Discord channel
	 * 8. Increment quota and return success
	 *
	 * @param args - Tool arguments (prompt, orientation, is_self_portrait)
	 * @param context - Tool execution context
	 * @returns Tool result with success/error status
	 */
	async execute(
		args: Record<string, unknown>,
		context: ToolContext,
	): Promise<ToolResult> {
		// 1. Validate parameters
		const validation = this.validateParameters(args);
		if (!validation.isValid) {
			return {
				success: false,
				error: `Invalid parameters: ${validation.errors?.join(", ") || `Missing required parameters: ${validation.missingParams?.join(", ")}`}`,
			};
		}

		// Check if tool is enabled
		if (!this.isEnabled(context)) {
			return {
				success: false,
				error: "Image generation is disabled for this server",
				message: "Image generation is not enabled for this server.",
			};
		}

		// 2. Check image generation quota
		const userDiscId = context.userId || context.message?.author.id || "";
		if (!userDiscId) {
			return {
				success: false,
				error: "Unable to identify user for quota checking",
			};
		}

		const quotaCheck = await checkImageQuota(
			context.tomoriState.server_id,
			userDiscId,
		);

		if (!quotaCheck.allowed) {
			// Build user-friendly error message based on quota type
			let errorMessage = "";
			let resetInfo = "";

			if (quotaCheck.resetTime) {
				const now = new Date();
				const resetTime = quotaCheck.resetTime;
				const hoursUntilReset = Math.ceil(
					(resetTime.getTime() - now.getTime()) / (1000 * 60 * 60),
				);

				if (hoursUntilReset < 24) {
					resetInfo = localizer(
						context.locale,
						"tools.generate_image.quota_resets_in_hours",
						{ hours: hoursUntilReset.toString() },
					);
				} else {
					const daysUntilReset = Math.ceil(hoursUntilReset / 24);
					resetInfo = localizer(
						context.locale,
						"tools.generate_image.quota_resets_in_days",
						{ days: daysUntilReset.toString() },
					);
				}
			}

			if (quotaCheck.reason === "user_quota_exceeded") {
				errorMessage = localizer(
					context.locale,
					"tools.generate_image.user_quota_exceeded",
					{ reset_info: resetInfo },
				);
			} else if (quotaCheck.reason === "serverwide_quota_exceeded") {
				errorMessage = localizer(
					context.locale,
					"tools.generate_image.serverwide_quota_exceeded",
					{ reset_info: resetInfo },
				);
			} else {
				errorMessage = localizer(
					context.locale,
					"tools.generate_image.quota_exceeded_generic",
				);
			}

			return {
				success: false,
				error: "Image generation quota exceeded",
				message: errorMessage,
			};
		}

		// Extract arguments
		const prompt = args.prompt as string;
		const orientation = (args.orientation as string) || "portrait";
		const isSelfPortrait = args.is_self_portrait !== false; // Default to true when not provided

		try {
			// 3. Get the diffusion model codename from database
			const diffusionModelId = context.tomoriState.config.diffusion_model_id;

			if (!diffusionModelId) {
				return {
					success: false,
					error: "No diffusion model configured for this server. Please run the setup command or configure an API key to enable image generation.",
				};
			}

			const modelCodename =
				await this.getDiffusionModelCodename(diffusionModelId);

			log.info(
				`Using NAI diffusion model: ${modelCodename} for image generation`,
			);

			// Decrypt API key (same key used for text and image generation)
			const encryptedApiKey = context.tomoriState.config.api_key;
			const keyVersion = context.tomoriState.config.key_version || 1;

			if (!encryptedApiKey) {
				return {
					success: false,
					error: "No API key configured for this server",
				};
			}

			const apiKey = await decryptApiKey(encryptedApiKey, keyVersion);

			if (!apiKey) {
				return {
					success: false,
					error: "Failed to decrypt API key",
				};
			}

			// 4. Build tag list — prepend persona character tags for self-portraits
			let tags = prompt
				.split(/[,\u3001]/)
				.map((t) => t.trim())
				.filter((t) => t.length > 0);

			if (isSelfPortrait) {
				const naiTags = context.tomoriState.nai_tags || [];
				if (naiTags.length > 0) {
					// Prepend character tags before the user's prompt tags
					tags = [...naiTags, ...tags];
					log.info(
						`[NAI] Prepended ${naiTags.length} persona character tag(s) for self-portrait`,
					);
				}
			}

			// 5. Normalize tags via suggest-tags API (parallel processing)
			const normalizedTags = await this.normalizeTags(
				tags,
				modelCodename,
				apiKey,
			);

			const normalizedPrompt = normalizedTags.join(", ");
			log.info(
				`[NAI] Normalized prompt: "${normalizedPrompt.substring(0, 200)}${normalizedPrompt.length > 200 ? "..." : ""}"`,
			);

			// 6. Generate image
			const imageBuffer = await this.generateImage(
				apiKey,
				modelCodename,
				normalizedPrompt,
				orientation,
			);

			// 7. Send image to Discord
			const attachment = new AttachmentBuilder(imageBuffer, {
				name: `nai_generated_${Date.now()}.png`,
			});

			const sentMessage = await this.sendGeneratedImage(
				context,
				attachment,
			);

			log.success(
				"Successfully generated and sent NAI image to Discord",
			);

			// 8. Increment quota after successful generation
			await incrementImageQuota(
				context.tomoriState.server_id,
				userDiscId,
			);

			// Build success message with remaining quota info
			let successMessage = `Successfully generated and sent NovelAI image to Discord (message ID: ${sentMessage.id}). The image was created using tags: "${normalizedPrompt.substring(0, 100)}${normalizedPrompt.length > 100 ? "..." : ""}".`;

			if (quotaCheck.userRemaining !== undefined) {
				const remainingText = localizer(
					context.locale,
					"tools.generate_image.quota_remaining",
					{ remaining: quotaCheck.userRemaining.toString() },
				);
				successMessage += ` ${remainingText}`;
			}

			return {
				success: true,
				message: successMessage,
				// imageMetadata intentionally omitted — Discord CDN URLs are protected
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			log.error("NAI image generation failed:", error as Error);

			// Check for auth/billing errors
			if (
				errorMessage.includes("401") ||
				errorMessage.includes("403") ||
				errorMessage.includes("Unauthorized") ||
				errorMessage.includes("payment")
			) {
				return {
					success: false,
					error: "NovelAI API authentication failed. Please check your API key and subscription status.",
				};
			}

			// Check for rate limiting
			if (
				errorMessage.includes("429") ||
				errorMessage.includes("rate limit")
			) {
				return {
					success: false,
					error: "NovelAI API rate limit reached. Please try again in a moment.",
				};
			}

			// Generic error fallback
			return {
				success: false,
				error: `Failed to generate NAI image: ${errorMessage}`,
			};
		}
	}
}
