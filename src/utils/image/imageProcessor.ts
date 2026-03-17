/**
 * Image processing utilities for TomoriBot
 * Handles image manipulation tasks like cropping, resizing, and format conversion
 */

import sharp from "sharp";
import { log } from "../misc/logger";

const NAI_REFERENCE_CANVASES = [
  { width: 1024, height: 1536 },
  { width: 1472, height: 1472 },
  { width: 1536, height: 1024 },
] as const;

function selectClosestNaiReferenceCanvas(
  width: number,
  height: number,
): { width: number; height: number } {
  const aspectRatio = width / height;

  return NAI_REFERENCE_CANVASES.reduce((bestCanvas, candidateCanvas) => {
    const bestDistance = Math.abs(
      Math.log(aspectRatio / (bestCanvas.width / bestCanvas.height)),
    );
    const candidateDistance = Math.abs(
      Math.log(aspectRatio / (candidateCanvas.width / candidateCanvas.height)),
    );

    return candidateDistance < bestDistance ? candidateCanvas : bestCanvas;
  });
}

/**
 * Center-crop an image to a 1:1 square aspect ratio
 * This is ideal for Discord avatar images which display best as squares
 *
 * @param buffer - Input image buffer (any format supported by Sharp)
 * @returns Promise<Buffer> - Output PNG buffer cropped to square
 *
 * @example
 * const squareImage = await centerCropToSquare(imageBuffer);
 * // Image is now 1:1 aspect ratio, centered from original
 */
export async function centerCropToSquare(buffer: Buffer): Promise<Buffer> {
  try {
    // 1. Get image metadata to determine current dimensions
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Unable to read image dimensions");
    }

    log.info(
      `Processing image: ${metadata.width}x${metadata.height} (${metadata.format})`,
    );

    // 2. Determine the size of the square (use the smaller dimension)
    const squareSize = Math.min(metadata.width, metadata.height);

    // 3. Calculate the extraction position to center the crop
    // For a 1920x1080 image, we want to extract a 1080x1080 square from the center
    const left = Math.floor((metadata.width - squareSize) / 2);
    const top = Math.floor((metadata.height - squareSize) / 2);

    log.info(
      `Cropping to ${squareSize}x${squareSize} square (offset: ${left}x${top})`,
    );

    // 4. Extract the square region and convert to PNG
    const croppedBuffer = await sharp(buffer)
      .extract({
        left,
        top,
        width: squareSize,
        height: squareSize,
      })
      .png() // Convert to PNG format for consistency
      .toBuffer();

    log.info(
      `Image successfully cropped to square (${croppedBuffer.length} bytes)`,
    );

    return croppedBuffer;
  } catch (error) {
    log.error("Failed to crop image to square:", error);
    throw new Error(
      `Image processing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Resize an image to a specific width while maintaining aspect ratio
 *
 * @param buffer - Input image buffer
 * @param targetWidth - Desired width in pixels
 * @returns Promise<Buffer> - Resized PNG buffer
 */
export async function resizeImage(
  buffer: Buffer,
  targetWidth: number,
): Promise<Buffer> {
  try {
    const resizedBuffer = await sharp(buffer)
      .resize({
        width: targetWidth,
        fit: "contain", // Maintain aspect ratio
      })
      .png()
      .toBuffer();

    log.info(`Image resized to ${targetWidth}px width`);
    return resizedBuffer;
  } catch (error) {
    log.error("Failed to resize image:", error);
    throw new Error(
      `Image resize failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Normalize a NovelAI character/director reference image onto one of the
 * accepted canvases using black padding.
 *
 * NovelAI's reference pipeline fits images into 1024x1536, 1472x1472, or
 * 1536x1024. This helper mirrors that preprocessing so API requests don't send
 * arbitrary image dimensions directly.
 *
 * @param buffer - Input image buffer
 * @returns Promise<Buffer> - PNG buffer normalized to a supported NAI canvas
 */
export async function normalizeNaiReferenceImage(
  buffer: Buffer,
): Promise<Buffer> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("Unable to read image dimensions");
    }

    const canvas = selectClosestNaiReferenceCanvas(
      metadata.width,
      metadata.height,
    );

    const normalizedBuffer = await sharp(buffer)
      .flatten({ background: { r: 0, g: 0, b: 0 } })
      .resize(canvas.width, canvas.height, {
        fit: "contain",
        position: "centre",
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      })
      .png()
      .toBuffer();

    log.info(
      `[NAI] Normalized reference image ${metadata.width}x${metadata.height} -> ${canvas.width}x${canvas.height} with black padding`,
    );

    return normalizedBuffer;
  } catch (error) {
    log.error("Failed to normalize NovelAI reference image:", error);
    throw new Error(
      `NovelAI reference normalization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Convert an image buffer to PNG format
 *
 * @param buffer - Input image buffer (any format)
 * @returns Promise<Buffer> - PNG buffer
 */
export async function convertToPNG(buffer: Buffer): Promise<Buffer> {
  try {
    const pngBuffer = await sharp(buffer).png().toBuffer();
    log.info("Image converted to PNG format");
    return pngBuffer;
  } catch (error) {
    log.error("Failed to convert image to PNG:", error);
    throw new Error(
      `Image conversion failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Get metadata from an image buffer
 *
 * @param buffer - Input image buffer
 * @returns Promise<sharp.Metadata> - Image metadata
 */
export async function getImageMetadata(
  buffer: Buffer,
): Promise<sharp.Metadata> {
  try {
    const metadata = await sharp(buffer).metadata();
    return metadata;
  } catch (error) {
    log.error("Failed to read image metadata:", error);
    throw new Error(
      `Image metadata read failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
