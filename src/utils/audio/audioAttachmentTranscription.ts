import type { Attachment, Message } from "discord.js";
import { getOptApiKey } from "@/utils/security/crypto";
import { safeDownload } from "@/utils/security/safeDownload";
import {
	DISCORD_MESSAGE_MAX_CHARS,
	ELEVENLABS_SERVICE_NAME,
	getElevenLabsSttConfig,
	normalizeTranscriptText,
} from "@/utils/audio/elevenLabsShared";
import { transcribeWithElevenLabs } from "@/utils/audio/elevenLabsStt";

const AUDIO_EXTENSION_REGEX =
	/\.(aac|flac|m4a|mp3|mp4|mpeg|mpga|oga|ogg|opus|wav|webm)$/i;

export type AudioAttachmentFailureReason =
	| "missing_api_key"
	| "download_failed"
	| "stt_failed"
	| "empty_transcript";

export interface AudioAttachmentTranscriptionResult {
	hasAudio: boolean;
	transcriptText: string | null;
	attachmentName: string | null;
	mimeType: string | null;
	failureReason?: AudioAttachmentFailureReason;
	failureDetails?: string;
}

function isAudioAttachment(attachment: Attachment): boolean {
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

export function buildTranscriptRelayContent(
	originalText: string,
	transcriptText: string,
): string {
	const normalizedOriginal = normalizeTranscriptText(
		originalText,
		DISCORD_MESSAGE_MAX_CHARS,
	);
	const normalizedTranscript = normalizeTranscriptText(
		transcriptText,
		DISCORD_MESSAGE_MAX_CHARS,
	);

	if (normalizedOriginal && normalizedTranscript) {
		return `${normalizedOriginal}\n${normalizedTranscript}`.slice(
			0,
			DISCORD_MESSAGE_MAX_CHARS,
		);
	}

	return (normalizedOriginal || normalizedTranscript).slice(
		0,
		DISCORD_MESSAGE_MAX_CHARS,
	);
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

	const config = getElevenLabsSttConfig();
	const apiKey = await getOptApiKey(serverId, ELEVENLABS_SERVICE_NAME);
	if (!apiKey) {
		return {
			hasAudio: true,
			transcriptText: null,
			attachmentName: attachment.name ?? null,
			mimeType: attachment.contentType ?? null,
			failureReason: "missing_api_key",
		};
	}

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

	const transcriptionResult = await transcribeWithElevenLabs({
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
