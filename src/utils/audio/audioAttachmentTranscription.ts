import type { Attachment, Message } from "discord.js";
import { getOptApiKey } from "@/utils/security/crypto";
import { safeDownload } from "@/utils/security/safeDownload";
import { ELEVENLABS_SERVICE_NAME, getElevenLabsSttConfig } from "@/utils/audio/elevenLabsShared";
import { transcribeViaElevenLabsAdapter } from "@/providers/custom/styles/transcriptionElevenLabsAdapter";
import { transcribeViaOpenAIAdapter } from "@/providers/custom/styles/transcriptionOpenAIAdapter";
import { resolveActiveTranscriptionEndpoint } from "@/utils/provider/speechEndpointResolver";

const AUDIO_EXTENSION_REGEX = /\.(aac|flac|m4a|mp3|mp4|mpeg|mpga|oga|ogg|opus|wav|webm)$/i;

export type AudioAttachmentFailureReason = "missing_api_key" | "download_failed" | "stt_failed" | "empty_transcript";

export interface AudioAttachmentTranscriptionResult {
  hasAudio: boolean;
  transcriptText: string | null;
  attachmentName: string | null;
  mimeType: string | null;
  failureReason?: AudioAttachmentFailureReason;
  failureDetails?: string;
}

/** Returns true if the attachment is an audio file by MIME type or extension. */
export function isAudioAttachment(attachment: Attachment): boolean {
  const mimeType = attachment.contentType?.toLowerCase() ?? "";
  if (mimeType.startsWith("audio/")) {
    return true;
  }

  return AUDIO_EXTENSION_REGEX.test(attachment.name ?? "");
}

function getFirstAudioAttachment(message: Message): Attachment | null {
  for (const attachment of message.attachments.values()) {
    if (isAudioAttachment(attachment)) {
      return attachment;
    }
  }

  return null;
}

export async function transcribeMessageAudioAttachment(
  message: Message,
  serverId: number,
): Promise<AudioAttachmentTranscriptionResult> {
  const attachment = getFirstAudioAttachment(message);
  if (!attachment) {
    return {
      hasAudio: false,
      transcriptText: null,
      attachmentName: null,
      mimeType: null,
    };
  }

  // Resolution order (Phase 4.1):
  // 1. Custom transcription endpoint via custom_endpoints table.
  // 2. Legacy ElevenLabs key from opt_api_keys (transition fallback until Phase 4.3 cleanup).
  // 3. Skip transcription silently if neither is available.
  const transcriptionEndpoint = await resolveActiveTranscriptionEndpoint(serverId);
  const legacyElevenLabsApiKey = await getOptApiKey(serverId, ELEVENLABS_SERVICE_NAME);
  const apiKey = transcriptionEndpoint?.apiKey ?? legacyElevenLabsApiKey ?? "";
  const endpointApiStyle = transcriptionEndpoint?.endpoint.api_style ?? "elevenlabs-transcription";
  const requiresApiKey =
    endpointApiStyle === "elevenlabs-transcription" || transcriptionEndpoint?.endpoint.requires_auth;

  if (requiresApiKey && !apiKey) {
    return {
      hasAudio: true,
      transcriptText: null,
      attachmentName: attachment.name ?? null,
      mimeType: attachment.contentType ?? null,
      failureReason: "missing_api_key",
    };
  }

  const config = getElevenLabsSttConfig();
  const downloadResult = await safeDownload(attachment.url, {
    maxSizeMB: config.maxSizeMb,
    timeoutMs: config.timeoutMs,
    knownSize: attachment.size,
  });
  if (!downloadResult.success || !downloadResult.buffer) {
    return {
      hasAudio: true,
      transcriptText: null,
      attachmentName: attachment.name ?? null,
      mimeType: attachment.contentType ?? null,
      failureReason: "download_failed",
      failureDetails: downloadResult.details,
    };
  }

  // Route to the appropriate adapter based on api_style of the active endpoint.
  // openai-compatible-transcription covers local WhisperX, whisper.cpp, etc.
  const transcriptionResult =
    endpointApiStyle === "openai-compatible-transcription" && transcriptionEndpoint
      ? await transcribeViaOpenAIAdapter({
          endpoint: transcriptionEndpoint.endpoint,
          apiKey,
          audioBuffer: downloadResult.buffer,
          filename: attachment.name ?? "audio",
          mimeType: attachment.contentType ?? undefined,
        })
      : await transcribeViaElevenLabsAdapter({
          apiKey,
          audioBuffer: downloadResult.buffer,
          filename: attachment.name ?? "audio",
          mimeType: attachment.contentType ?? undefined,
        });
  if (!transcriptionResult.success) {
    return {
      hasAudio: true,
      transcriptText: null,
      attachmentName: attachment.name ?? null,
      mimeType: attachment.contentType ?? null,
      failureReason: "stt_failed",
      failureDetails: transcriptionResult.details,
    };
  }

  if (!transcriptionResult.transcriptText) {
    return {
      hasAudio: true,
      transcriptText: null,
      attachmentName: attachment.name ?? null,
      mimeType: attachment.contentType ?? null,
      failureReason: "empty_transcript",
    };
  }

  return {
    hasAudio: true,
    transcriptText: transcriptionResult.transcriptText,
    attachmentName: attachment.name ?? null,
    mimeType: attachment.contentType ?? null,
  };
}
