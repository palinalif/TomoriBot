/**
 * Gemini Image Segmentation Service
 *
 * Uses Google Gemini's native image segmentation capability to generate
 * pixel-precise masks from natural language descriptions. These masks
 * are used by the NovelAI inpainting pipeline to selectively redraw
 * regions of an existing image.
 *
 * Pipeline:
 * 1. Send image + text target description to Gemini
 * 2. Gemini returns JSON with bounding boxes (normalized 0–1000) and cropped PNG masks
 * 3. Each mask is resized to its bounding box pixel dimensions
 * 4. All masks are composited onto a full-canvas black image (white = redraw area)
 * 5. Final mask is binarized at threshold 127 for clean edges
 */

import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";
import { log } from "../misc/logger";

/** Whether to enable debug mode — when true, returns the raw mask buffer for inspection */
const NAI_INPAINT_DEBUG =
	(process.env.NAI_INPAINT_DEBUG || "false").toLowerCase() === "true";

/** Gemini model used for image segmentation (configurable for future model upgrades) */
const NAI_SEGMENTATION_MODEL =
	process.env.NAI_SEGMENTATION_MODEL || "gemini-2.5-flash";

/**
 * A single segmentation result from Gemini.
 * Coordinates are normalized to 0–1000 range.
 */
interface GeminiSegment {
	/** Bounding box as [y0, x0, y1, x1], normalized 0–1000 */
	box_2d: [number, number, number, number];
	/** Base64-encoded PNG mask cropped to the bounding box (white = target region) */
	mask: string;
	/** Human-readable label for the detected region */
	label: string;
}

/**
 * Result of the full segmentation + mask processing pipeline.
 */
export interface SegmentationResult {
	/** Final full-canvas mask as base64 PNG (white = areas to redraw, black = preserve) */
	maskBase64: string;
	/** Number of segments detected and merged */
	segmentCount: number;
	/** Labels from all detected segments */
	labels: string[];
	/** Raw mask buffer (only populated when NAI_INPAINT_DEBUG is true) */
	debugMaskBuffer?: Buffer;
}

/**
 * Call Gemini's image segmentation API to identify and mask regions matching
 * a natural language description.
 *
 * @param imageBase64 - Base64-encoded source image (PNG or JPEG)
 * @param imageMimeType - MIME type of the source image
 * @param editTarget - Natural language description of what to segment (e.g. "the cat", "the flowers")
 * @param apiKey - Decrypted Google API key
 * @returns Array of segmentation results from Gemini
 */
async function callGeminiSegmentation(
	imageBase64: string,
	imageMimeType: string,
	editTarget: string,
	apiKey: string,
): Promise<GeminiSegment[]> {
	const genAI = new GoogleGenAI({ apiKey });

	// Use configurable Gemini model for segmentation (default: gemini-2.5-flash)
	const response = await genAI.models.generateContent({
		model: NAI_SEGMENTATION_MODEL,
		contents: [
			{
				role: "user",
				parts: [
					{
						inlineData: {
							mimeType: imageMimeType,
							data: imageBase64,
						},
					},
					{
						text: `Give the segmentation masks for "${editTarget}" in this image. Output a JSON array where each element has: "box_2d" (bounding box as [y0, x0, y1, x1] normalized 0-1000), "mask" (base64 PNG of the mask cropped to the bounding box, white=target, black=background), and "label" (short description). Return ONLY the JSON array, no markdown fences.`,
					},
				],
			},
		],
		config: {
			temperature: 0.1,
			// Request structured output for reliable parsing
			responseMimeType: "application/json",
		},
	});

	const rawText = response.text?.trim() || "";

	if (!rawText) {
		throw new Error("Gemini segmentation returned empty response");
	}

	// Strip potential markdown fences that Gemini sometimes wraps around JSON output
	const responseText = rawText
		.replace(/^```(?:json)?\n?/, "")
		.replace(/\n?```$/, "")
		.trim();

	// Parse the JSON array response
	let segments: GeminiSegment[];
	try {
		const parsed = JSON.parse(responseText);
		segments = Array.isArray(parsed) ? parsed : [parsed];
	} catch (parseErr) {
		log.error(
			`Failed to parse Gemini segmentation response: ${responseText.substring(0, 200)}`,
		);
		throw new Error(
			`Failed to parse segmentation response: ${(parseErr as Error).message}`,
		);
	}

	// Validate each segment has required fields
	const validSegments = segments.filter((seg) => {
		if (
			!seg.box_2d ||
			!Array.isArray(seg.box_2d) ||
			seg.box_2d.length !== 4
		) {
			log.warn(
				`Skipping segment with invalid box_2d: ${JSON.stringify(seg.box_2d)}`,
			);
			return false;
		}
		if (!seg.mask) {
			log.warn(`Skipping segment with missing mask (label: ${seg.label})`);
			return false;
		}
		return true;
	});

	if (validSegments.length === 0) {
		throw new Error(
			`Gemini found no valid segments for "${editTarget}". The model may not have detected the target in the image.`,
		);
	}

	log.info(
		`Gemini segmentation found ${validSegments.length} segment(s) for "${editTarget}": ${validSegments.map((s) => s.label).join(", ")}`,
	);

	return validSegments;
}

/**
 * Process Gemini segmentation results into a single full-canvas inpainting mask.
 *
 * For each segment:
 * 1. Decode the base64 mask PNG
 * 2. Resize to bounding box pixel dimensions (derived from normalized 0–1000 coords)
 * 3. Composite onto a full-canvas black image at the correct position
 *
 * When multiple segments exist, all masks are merged via "lighten" compositing
 * (logical OR), so white pixels from any segment become white in the final mask.
 * Finally, the merged mask is binarized at threshold 127 for clean black/white edges.
 *
 * @param segments - Array of Gemini segmentation results
 * @param originalWidth - Width of the source image in pixels
 * @param originalHeight - Height of the source image in pixels
 * @returns Full-canvas PNG mask buffer (white = redraw, black = preserve)
 */
async function processSegmentationMasks(
	segments: GeminiSegment[],
	originalWidth: number,
	originalHeight: number,
): Promise<Buffer> {
	// Start with a full-canvas black image (all pixels preserved by default)
	const compositeMask = sharp({
		create: {
			width: originalWidth,
			height: originalHeight,
			channels: 4,
			background: { r: 0, g: 0, b: 0, alpha: 255 },
		},
	}).png();

	// Process each segment and collect composite operations
	const compositeOps: sharp.OverlayOptions[] = [];

	for (const segment of segments) {
		try {
			// 1. Convert normalized 0–1000 coordinates to pixel coordinates
			const [y0Norm, x0Norm, y1Norm, x1Norm] = segment.box_2d;
			const x0 = Math.round((x0Norm / 1000) * originalWidth);
			const y0 = Math.round((y0Norm / 1000) * originalHeight);
			const x1 = Math.round((x1Norm / 1000) * originalWidth);
			const y1 = Math.round((y1Norm / 1000) * originalHeight);

			// Calculate bounding box pixel dimensions
			const bboxWidth = Math.max(x1 - x0, 1);
			const bboxHeight = Math.max(y1 - y0, 1);

			log.info(
				`Processing segment "${segment.label}": bbox [${x0},${y0}]-[${x1},${y1}] (${bboxWidth}x${bboxHeight}px)`,
			);

			// 2. Decode the base64 mask — strip data URI prefix if present
			const maskData = segment.mask.replace(
				/^data:image\/[^;]+;base64,/,
				"",
			);
			const maskBuffer = Buffer.from(maskData, "base64");

			// 3. Resize the cropped mask to match bounding box pixel dimensions
			const resizedMask = await sharp(maskBuffer)
				.resize(bboxWidth, bboxHeight, { fit: "fill" })
				.png()
				.toBuffer();

			// 4. Add to composite operations — position at bounding box origin
			compositeOps.push({
				input: resizedMask,
				left: x0,
				top: y0,
				blend: "lighten" as const, // Merge overlapping masks: white wins
			});
		} catch (segErr) {
			log.warn(
				`Failed to process segment "${segment.label}": ${(segErr as Error).message}`,
			);
		}
	}

	if (compositeOps.length === 0) {
		throw new Error("All segmentation masks failed to process");
	}

	// 5. Composite all mask segments onto the black canvas
	const mergedMask = await compositeMask
		.composite(compositeOps)
		.toBuffer();

	// 6. Binarize at threshold 127 — ensures clean black/white edges
	// Pixels > 127 become pure white (255), pixels <= 127 become pure black (0)
	const binarizedMask = await sharp(mergedMask)
		.greyscale()
		.threshold(127)
		.png()
		.toBuffer();

	log.info(
		`Segmentation mask complete: ${originalWidth}x${originalHeight}px, ${compositeOps.length} segment(s) merged`,
	);

	return binarizedMask;
}

/**
 * High-level segmentation pipeline: calls Gemini to segment the target region,
 * then processes and merges all resulting masks into a single inpainting mask.
 *
 * @param imageBase64 - Base64-encoded source image
 * @param imageMimeType - MIME type of the source image (e.g. "image/png")
 * @param editTarget - Natural language description of the region to edit
 * @param apiKey - Decrypted Google API key for Gemini
 * @returns SegmentationResult with the final mask and metadata
 */
export async function segmentImage(
	imageBase64: string,
	imageMimeType: string,
	editTarget: string,
	apiKey: string,
): Promise<SegmentationResult> {
	// 1. Get image dimensions from the source image
	const imageBuffer = Buffer.from(imageBase64, "base64");
	const metadata = await sharp(imageBuffer).metadata();

	if (!metadata.width || !metadata.height) {
		throw new Error("Unable to read source image dimensions for segmentation");
	}

	log.info(
		`Starting segmentation for "${editTarget}" on ${metadata.width}x${metadata.height} image`,
	);

	// 2. Call Gemini segmentation API
	const segments = await callGeminiSegmentation(
		imageBase64,
		imageMimeType,
		editTarget,
		apiKey,
	);

	// 3. Process and merge all masks
	const maskBuffer = await processSegmentationMasks(
		segments,
		metadata.width,
		metadata.height,
	);

	const maskBase64 = maskBuffer.toString("base64");

	return {
		maskBase64,
		segmentCount: segments.length,
		labels: segments.map((s) => s.label),
		...(NAI_INPAINT_DEBUG ? { debugMaskBuffer: maskBuffer } : {}),
	};
}
