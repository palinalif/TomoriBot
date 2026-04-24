import { transcribeWithElevenLabs } from "@/utils/audio/elevenLabsStt";
import type { ElevenLabsSttResult } from "@/utils/audio/elevenLabsStt";

export interface ElevenLabsTranscriptionAdapterRequest {
  apiKey: string;
  audioBuffer: Buffer;
  filename: string;
  mimeType?: string | null;
}

/**
 * Thin adapter wrapping `transcribeWithElevenLabs` for use via the
 * custom endpoint pathway (capability = "transcription", api_style = "elevenlabs-transcription").
 */
export async function transcribeViaElevenLabsAdapter(
  request: ElevenLabsTranscriptionAdapterRequest,
): Promise<ElevenLabsSttResult> {
  return transcribeWithElevenLabs({
    apiKey: request.apiKey,
    audioBuffer: request.audioBuffer,
    filename: request.filename,
    mimeType: request.mimeType,
  });
}
