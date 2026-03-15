/**
 * NovelAI Image Generation Tool
 * Generates images using NovelAI's diffusion models with imageboard-style tag prompts.
 * Supports self-portrait mode that prepends persona's character tags to the prompt.
 *
 * Inpainting mode (Phase 2):
 * When `message_id` + `edit_target` are provided, the tool enters inpaint mode:
 * 1. Extracts the image from the referenced Discord message
 * 2. Calls Gemini segmentation to identify the edit target region
 * 3. Generates a mask (white = redraw, black = preserve)
 * 4. Sends image + mask to NovelAI's infill endpoint with an inpainting model
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
import { decryptApiKey, getOptApiKey } from "../../utils/security/crypto";
import {
  checkImageQuota,
  incrementImageQuota,
} from "../../utils/quota/imageQuotaManager";
import { extractImagesFromMessage } from "../../utils/image/imageExtractor";
import { segmentImage } from "../../utils/image/segmentationService";

// Configurable generation parameters via environment variables
const NAI_STEPS = Number.parseInt(process.env.NAI_IMAGE_STEPS || "28", 10);
const NAI_SCALE = Number.parseFloat(process.env.NAI_IMAGE_SCALE || "5");
const NAI_SAMPLER = process.env.NAI_IMAGE_SAMPLER || "k_euler_ancestral";
const NAI_NOISE_SCHEDULE = process.env.NAI_IMAGE_NOISE_SCHEDULE || "karras";
const NAI_NEGATIVE_PROMPT =
  process.env.NAI_IMAGE_NEGATIVE_PROMPT ||
  "blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page";
// Disabled by default because the suggest-tags endpoint is currently unstable and
// can hurt generation reliability; enable again once the API is consistently healthy.
const NAI_IMAGE_ENABLE_TAG_RESOLUTION =
  (process.env.NAI_IMAGE_ENABLE_TAG_RESOLUTION || "false").toLowerCase() ===
  "true";
// Inpainting strength: denoising level for the masked region (0.0–1.0).
// 1.0 fully redraws the masked area from the prompt with no original pixel bleed-through.
// Lower values preserve more of the original structure but cause color blending artifacts
// when the edit changes colors (e.g. white hair → red hair at 0.7 produces grey).
const NAI_INPAINT_STRENGTH = Number.parseFloat(
  process.env.NAI_INPAINT_STRENGTH || "1.0",
);

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
    "Generate or edit an AI image using NovelAI's diffusion models. For generation: provide imageboard-style tags (e.g. '1girl, short hair, red eyes, sunset'). For editing/inpainting: also provide message_id (referencing a message with an image) and edit_target (what to change, e.g. 'the background'). The image will be sent directly to the Discord channel.";
  category = "utility" as const;
  requiresFeatureFlag = "image_gen";
  requiresFollowUp = true; // Allow model to generate a text response after image is sent, preventing orphaned self-reply

  parameters: ToolParameterSchema = {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description:
          "Imageboard-style tags for image generation, separated by commas (e.g. '1girl, short hair, red eyes, sunset, masterpiece'). Tags describe the desired image content, style, and quality. For inpainting, describe what should replace the masked region.",
      },
      orientation: {
        type: "string",
        description:
          "Image orientation/aspect ratio. 'portrait' (832x1216), 'landscape' (1216x832), or 'square' (1024x1024). Default: portrait. Ignored in inpaint mode (uses source image dimensions).",
        enum: ["portrait", "landscape", "square"],
      },
      is_self_portrait: {
        type: "boolean",
        description:
          "If true, automatically prepends the persona's configured character tags (from /nai charactertags) to the prompt for consistent self-portraits.",
      },
      message_id: {
        type: "string",
        description:
          "Optional: Discord message ID containing the image to edit. When provided with edit_target, enables inpainting mode. The first image found in the message (attachment, embed, sticker, or emoji) will be used as the source.",
      },
      edit_target: {
        type: "string",
        description:
          "Optional: Natural language description of the region to edit (e.g. 'background', 'hair', 'cat'). Required when message_id is provided. Gemini AI will segment this region to create an inpainting mask.",
      },
    },
    required: ["prompt"],
  };

  /**
   * NovelAI image generation is available for any provider that supports tools.
   * When the active provider is not 'novelai', the tool requires a NovelAI opt API key
   * (checked by the tool registry's post-filtering in getAvailableToolsWithMCP).
   * @param _provider - LLM provider name (accepted for all providers)
   * @returns Always true — actual availability is gated by opt key check in the registry
   */
  isAvailableFor(_provider: string): boolean {
    return true;
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
			SELECT codename, provider
			FROM image_diffusion_models
			WHERE diffusion_model_id = ${diffusionModelId}
		`.values();

    if (result.length === 0) {
      throw new Error(
        `Diffusion model not found in database: ${diffusionModelId}`,
      );
    }

    const codename = result[0][0] as string;
    const provider = result[0][1] as string;

    // If the configured model belongs to a different provider (e.g. OpenRouter image model),
    // fall back to the default NovelAI diffusion model rather than sending a non-NAI codename
    // to the NovelAI API (which would cause a 400 validation error).
    if (provider !== "novelai") {
      log.warn(
        `[NAI] Configured diffusion model "${codename}" (provider: ${provider}) is not a NovelAI model. Falling back to default NovelAI model.`,
      );

      const fallback = await sql`
				SELECT codename
				FROM image_diffusion_models
				WHERE provider = 'novelai' AND is_default = true AND is_deprecated = false
				LIMIT 1
			`.values();

      if (fallback.length === 0) {
        throw new Error(
          "No default NovelAI diffusion model found in database. Please seed the database.",
        );
      }

      return fallback[0][0] as string;
    }

    return codename;
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
   * Checks whether the given model codename is a v4+ model that requires the v4_prompt format.
   * V4 models use a structured caption object instead of a flat prompt string.
   * @param model - Diffusion model codename
   * @returns True if the model requires v4_prompt format
   */
  private isV4Model(model: string): boolean {
    // Match models like nai-diffusion-4-5-full, nai-diffusion-4-5-curated, or future nai-diffusion-4-*
    return /nai-diffusion-4/.test(model);
  }

  /**
   * Derive the inpainting model codename from the base model.
   * NovelAI inpainting models use a `-inpainting` suffix and are NOT stored
   * in the `image_diffusion_models` table — the codename is derived at runtime.
   * @param baseCodename - Base model codename (e.g. "nai-diffusion-4-5-curated")
   * @returns Inpainting model codename (e.g. "nai-diffusion-4-5-curated-inpainting")
   */
  private getInpaintingModelCodename(baseCodename: string): string {
    return `${baseCodename}-inpainting`;
  }

  /**
   * Resolve a Google API key for Gemini segmentation.
   *
   * Resolution order:
   * 1. Google opt key from `/config googleapi set` (stored as opt_api_keys service_name='google')
   * 2. Main config API key when the active provider is Google
   *
   * @param context - Tool execution context
   * @returns Decrypted Google API key, or null if unavailable
   */
  private async resolveGoogleApiKey(
    context: ToolContext,
  ): Promise<string | null> {
    // 1st priority: opt key for "google"
    const optKey = await getOptApiKey(context.tomoriState.server_id, "google");
    if (optKey) return optKey;

    // 2nd priority: main config key when provider is Google
    if (context.provider === "google") {
      const encryptedApiKey = context.tomoriState.config.api_key;
      const keyVersion = context.tomoriState.config.key_version || 1;

      if (encryptedApiKey) {
        return await decryptApiKey(encryptedApiKey, keyVersion);
      }
    }

    return null;
  }

  /**
   * Calls NovelAI's infill (inpainting) endpoint with a source image and mask.
   *
   * Flow:
   * 1. Build infill request payload with inpainting model, image, and mask
   * 2. Send POST request to NovelAI image generation endpoint
   * 3. Extract the resulting PNG from the ZIP response
   *
   * @param apiKey - Decrypted NovelAI API key
   * @param model - Inpainting model codename (with -inpainting suffix)
   * @param prompt - Tag prompt describing what to draw in the masked region
   * @param imageBase64 - Base64-encoded source image
   * @param maskBase64 - Base64-encoded mask (white = redraw, black = preserve)
   * @returns Buffer containing the inpainted PNG image data
   */
  private async generateInpaintImage(
    apiKey: string,
    model: string,
    prompt: string,
    imageBase64: string,
    maskBase64: string,
    width: number,
    height: number,
  ): Promise<Buffer> {
    const seed = Math.floor(Math.random() * 2147483647);

    // Build infill request payload
    // Inpainting uses action: "infill" and includes image + mask in parameters
    let requestPayload: Record<string, unknown>;

    if (this.isV4Model(model)) {
      requestPayload = {
        action: "infill",
        input: prompt,
        model,
        parameters: {
          prompt,
          seed,
          n_samples: 1,
          width,
          height,
          steps: NAI_STEPS,
          scale: NAI_SCALE,
          uncond_scale: 0.0,
          cfg_rescale: 0.0,
          sampler: NAI_SAMPLER,
          noise_schedule: NAI_NOISE_SCHEDULE,
          legacy_v3_extend: false,
          image: imageBase64,
          mask: maskBase64,
          add_original_image: true,
          strength: NAI_INPAINT_STRENGTH,
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
          cfg_sched_eligibility: "enable_for_post_summer_samplers",
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
      // V3 infill structure
      requestPayload = {
        action: "infill",
        input: prompt,
        model,
        parameters: {
          width,
          height,
          steps: NAI_STEPS,
          scale: NAI_SCALE,
          sampler: NAI_SAMPLER,
          noise_schedule: NAI_NOISE_SCHEDULE,
          n_samples: 1,
          seed,
          image: imageBase64,
          mask: maskBase64,
          add_original_image: true,
          strength: NAI_INPAINT_STRENGTH,
          negative_prompt: NAI_NEGATIVE_PROMPT,
        },
      };
    }

    log.info(`[NAI] Inpainting with model "${model}" (seed: ${seed})`);

    // Send infill request
    const response = await fetch(`${NAI_IMAGE_BASE_URL}/ai/generate-image`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const snippet = errorText.slice(0, 500);
      throw new Error(
        `NovelAI inpainting failed (${response.status} ${response.statusText}): ${snippet}`,
      );
    }

    // Extract PNG from ZIP response
    const zipBuffer = Buffer.from(await response.arrayBuffer());
    const zip = await JSZip.loadAsync(zipBuffer);

    const pngFileName = Object.keys(zip.files).find((name) =>
      name.toLowerCase().endsWith(".png"),
    );

    if (!pngFileName) {
      throw new Error(
        "NovelAI inpainting response ZIP did not contain a PNG file",
      );
    }

    const pngData = await zip.files[pngFileName].async("nodebuffer");
    return Buffer.from(pngData);
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
          cfg_sched_eligibility: "enable_for_post_summer_samplers",
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

    // 2. Send generation request
    const response = await fetch(`${NAI_IMAGE_BASE_URL}/ai/generate-image`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
    });

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
      throw new Error("NovelAI response ZIP did not contain a PNG file");
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
   * 5. Resolve tags via suggest-tags API (optional; disabled by default)
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
    const isSelfPortrait = args.is_self_portrait === true; // Default to false when not provided
    const messageId = args.message_id as string | undefined;
    const editTarget = args.edit_target as string | undefined;

    // Determine if this is an inpainting request
    const isInpaintMode = !!(messageId && editTarget);

    try {
      // 3. Get the diffusion model codename from database
      const diffusionModelId = context.tomoriState.config.diffusion_model_id;

      if (!diffusionModelId) {
        return {
          success: false,
          error:
            "No diffusion model configured for this server. Please run the setup command or configure an API key to enable image generation.",
        };
      }

      const baseModelCodename =
        await this.getDiffusionModelCodename(diffusionModelId);

      log.info(
        `Using NAI diffusion model: ${baseModelCodename} for ${isInpaintMode ? "inpainting" : "image generation"}`,
      );

      // Resolve NovelAI API key — prefer opt key (cross-provider), fall back to main config key (NovelAI provider)
      let apiKey: string | null = null;

      // 1st priority: opt_api_keys entry for "novelai" (set via /config novelaiapi set)
      apiKey = await getOptApiKey(context.tomoriState.server_id, "novelai");

      // 2nd priority: main config key when the active provider is NovelAI
      if (!apiKey) {
        const encryptedApiKey = context.tomoriState.config.api_key;
        const keyVersion = context.tomoriState.config.key_version || 1;

        if (encryptedApiKey) {
          apiKey = await decryptApiKey(encryptedApiKey, keyVersion);
        }
      }

      if (!apiKey) {
        return {
          success: false,
          error:
            "No NovelAI API key available. Set one with /config novelaiapi set, or switch to the NovelAI provider.",
        };
      }

      // 4. Build tag list — quality tags and character tags are trusted (no normalization needed)
      const qualityTags = [
        "8k",
        "absurdres",
        "masterpiece",
        "best quality",
        "good quality",
        "newest",
      ];

      // Parse model-provided tags (these need normalization)
      const modelTags = prompt
        .split(/[,\u3001]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      // Trusted tags: quality + persona character tags (skip normalization)
      // In inpaint mode, character tags are skipped — the character already exists
      // in the source image, and prepending identity tags would conflict with the
      // inpainting prompt that describes *what to change*, not who the character is.
      const trustedTags = [...qualityTags];

      if (isSelfPortrait && !isInpaintMode) {
        const naiTags = context.tomoriState.nai_tags || [];
        if (naiTags.length > 0) {
          trustedTags.push(...naiTags);
          log.info(
            `[NAI] Prepended ${naiTags.length} persona character tag(s) for self-portrait`,
          );
        }
      }

      // 5. Resolve only the model-provided tags via suggest-tags API when enabled
      const resolvedModelTags = NAI_IMAGE_ENABLE_TAG_RESOLUTION
        ? await this.normalizeTags(modelTags, baseModelCodename, apiKey)
        : modelTags;

      if (!NAI_IMAGE_ENABLE_TAG_RESOLUTION) {
        log.info(
          "[NAI] Tag resolution via suggest-tags is disabled; using raw model-provided tags",
        );
      }

      // Combine: trusted tags first (as-is), then resolved/raw model tags
      const normalizedTags = [...trustedTags, ...resolvedModelTags];

      const normalizedPrompt = normalizedTags.join(", ");
      log.info(
        `[NAI] Normalized prompt: "${normalizedPrompt.substring(0, 200)}${normalizedPrompt.length > 200 ? "..." : ""}"`,
      );

      let imageBuffer: Buffer;

      if (isInpaintMode) {
        // ── Inpainting flow ──────────────────────────────────────────
        // 6a. Extract source image from referenced Discord message
        log.info(
          `[NAI] Inpaint mode: extracting image from message ${messageId}, target="${editTarget}"`,
        );

        const extractedImages = await extractImagesFromMessage(
          messageId,
          context,
        );

        // Use the first image found as the inpainting source
        const sourceImage = extractedImages[0];

        // 6b. Resolve Google API key for Gemini segmentation
        const googleApiKey = await this.resolveGoogleApiKey(context);
        if (!googleApiKey) {
          return {
            success: false,
            error: localizer(
              context.locale,
              "tools.generate_image_nai.no_google_api_key",
            ),
          };
        }

        // 6c. Call Gemini segmentation to generate the inpainting mask
        log.info(
          `[NAI] Calling Gemini segmentation for target: "${editTarget}"`,
        );

        const segResult = await segmentImage(
          sourceImage.data,
          sourceImage.mimeType,
          editTarget,
          googleApiKey,
          this.isV4Model(baseModelCodename),
        );

        log.info(
          `[NAI] Segmentation complete: ${segResult.segmentCount} segment(s) found [${segResult.labels.join(", ")}]`,
        );

        // 6d. If debug mode is enabled, DM the invoking user the mask and bbox overlay
        if (
          (segResult.debugMaskBuffer || segResult.debugOverlayBuffer) &&
          context.userId
        ) {
          try {
            const debugUser = await context.client.users.fetch(context.userId);
            const debugFiles: AttachmentBuilder[] = [];
            const ts = Date.now();

            // 1. Bounding box overlay on original image (most useful for verifying detection)
            if (segResult.debugOverlayBuffer) {
              debugFiles.push(
                new AttachmentBuilder(segResult.debugOverlayBuffer, {
                  name: `inpaint_bbox_debug_${ts}.png`,
                }),
              );
            }

            // 2. Raw binary mask (white = redraw region)
            if (segResult.debugMaskBuffer) {
              debugFiles.push(
                new AttachmentBuilder(segResult.debugMaskBuffer, {
                  name: `inpaint_mask_debug_${ts}.png`,
                }),
              );
            }

            await debugUser.send({
              content: `**[NAI Inpaint Debug]** Segmentation for "${editTarget}" (${segResult.segmentCount} segment(s): ${segResult.labels.join(", ")})\nImage 1: Bounding box overlay | Image 2: Binary mask`,
              files: debugFiles,
            });
            log.info("[NAI] Sent debug segmentation images to user via DM");
          } catch (dmErr) {
            log.warn(
              "[NAI] Failed to send debug DM (user may have DMs disabled)",
              dmErr as Error,
            );
          }
        }

        // 6e. Generate inpainted image via NovelAI infill endpoint
        const inpaintModel = this.getInpaintingModelCodename(baseModelCodename);

        imageBuffer = await this.generateInpaintImage(
          apiKey,
          inpaintModel,
          normalizedPrompt,
          sourceImage.data,
          segResult.maskBase64,
          segResult.imageWidth,
          segResult.imageHeight,
        );

        log.success(`[NAI] Inpainting complete with model "${inpaintModel}"`);
      } else {
        // ── Standard generation flow ─────────────────────────────────
        // 6. Generate image normally
        imageBuffer = await this.generateImage(
          apiKey,
          baseModelCodename,
          normalizedPrompt,
          orientation,
        );
      }

      // 7. Send image to Discord
      const filePrefix = isInpaintMode ? "nai_inpainted" : "nai_generated";
      const attachment = new AttachmentBuilder(imageBuffer, {
        name: `${filePrefix}_${Date.now()}.png`,
      });

      const sentMessage = await this.sendGeneratedImage(context, attachment);

      log.success(
        `Successfully ${isInpaintMode ? "inpainted" : "generated"} and sent NAI image to Discord`,
      );

      // 8. Increment quota after successful generation
      await incrementImageQuota(context.tomoriState.server_id, userDiscId);

      // Build success message with remaining quota info
      let successMessage: string;

      if (isInpaintMode) {
        successMessage = `Good job! The inpainted image has been generated and sent directly to the Discord chat (message ID: ${sentMessage.id}). The user can already see it, so do NOT generate another image unless asked. The edit targeted "${editTarget}" and applied tags: "${normalizedPrompt.substring(0, 100)}${normalizedPrompt.length > 100 ? "..." : ""}".`;
      } else {
        successMessage = `Good job! The image has been generated and sent directly to the Discord chat (message ID: ${sentMessage.id}). The user can already see it, so do NOT generate another image unless asked. The image was created using tags: "${normalizedPrompt.substring(0, 100)}${normalizedPrompt.length > 100 ? "..." : ""}".`;
      }

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

      log.error(
        `NAI ${isInpaintMode ? "inpainting" : "image generation"} failed:`,
        error as Error,
      );

      // Check for auth/billing errors
      if (
        errorMessage.includes("401") ||
        errorMessage.includes("403") ||
        errorMessage.includes("Unauthorized") ||
        errorMessage.includes("payment")
      ) {
        return {
          success: false,
          error:
            "NovelAI API authentication failed. Please check your API key and subscription status.",
        };
      }

      // Check for rate limiting
      if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
        return {
          success: false,
          error:
            "NovelAI API rate limit reached. Please try again in a moment.",
        };
      }

      // Segmentation-specific errors
      if (
        errorMessage.includes("segmentation") ||
        errorMessage.includes("segment")
      ) {
        return {
          success: false,
          error: `Segmentation failed: ${errorMessage}`,
        };
      }

      // Generic error fallback
      return {
        success: false,
        error: `Failed to ${isInpaintMode ? "inpaint" : "generate"} NAI image: ${errorMessage}`,
      };
    }
  }
}
