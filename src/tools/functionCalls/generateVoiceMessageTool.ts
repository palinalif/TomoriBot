import { AttachmentBuilder } from "discord.js";
import {
	BaseTool,
	type ToolContext,
	type ToolParameterSchema,
	type ToolResult,
} from "@/types/tool/interfaces";
import { synthesizeSpeechWithElevenLabs } from "@/utils/audio/elevenLabsTts";
import { ELEVENLABS_SERVICE_NAME } from "@/utils/audio/elevenLabsAccount";
import { setCachedVoiceTranscript } from "@/utils/audio/voiceTranscriptCache";
import { getOptApiKey } from "@/utils/security/crypto";
import { sendWebhookMessageWithIdentity } from "@/utils/discord/webhookManager";

export class GenerateVoiceMessageTool extends BaseTool {
	name = "generate_voice_message";
	description =
		"Generate a spoken Discord audio message using the active persona's configured ElevenLabs voice. Use this only when voice delivery materially improves the reply. You may include bracketed expression tags anywhere in the script to shape delivery — both emotional states (e.g. [happy], [sad], [tired], [nervous]) and actions (e.g. [whispers], [laughs], [sighs softly]) are supported. Use them when they naturally fit the character and tone. The tool sends the audio attachment directly to the channel with no text caption.";
	category = "discord" as const;

	parameters: ToolParameterSchema = {
		type: "object",
		properties: {
			title: {
				type: "string",
				description:
					"A short descriptive title for the voice message (e.g. \"greeting\", \"farewell\", \"apology\"). Used as the audio filename. Keep it lowercase with no spaces.",
			},
			script: {
				type: "string",
				description:
					"The exact spoken script for the voice message. Keep it concise and natural for speech. Bracketed expression tags (emotional states like [happy], [sad], [tired] or actions like [whispers], [laughs]) can be placed inline to shape the delivery.",
			},
		},
		required: ["title", "script"],
	};

	private resolveThreadId(context: ToolContext): string | undefined {
		return "isThread" in context.channel &&
			typeof context.channel.isThread === "function" &&
			context.channel.isThread()
			? context.channel.id
			: undefined;
	}

	private buildAttachmentName(title: string, extension: string): string {
		const baseName = title
			.trim()
			.replace(/[^A-Za-z0-9_-]+/g, "_")
			.replace(/^_+|_+$/g, "")
			.slice(0, 40);

		const safeBaseName = baseName.length > 0 ? baseName : "voice";
		return `${safeBaseName}.${extension}`;
	}

	async execute(
		args: Record<string, unknown>,
		context: ToolContext,
	): Promise<ToolResult> {
		const validation = this.validateParameters(args);
		if (!validation.isValid) {
			return {
				success: false,
				error: `Invalid parameters: ${validation.errors?.join(", ") || validation.missingParams?.join(", ") || "unknown validation error"}`,
			};
		}

		const title = typeof args.title === "string" ? args.title.trim() : "voice";
		const script = typeof args.script === "string" ? args.script.trim() : "";
		if (!script) {
			return {
				success: false,
				error: "The voice script was empty.",
			};
		}

		const voiceId = context.tomoriState.elevenlabs_voice_id?.trim();
		if (!voiceId) {
			return {
				success: false,
				error:
					"No ElevenLabs voice is configured for the active persona. A server manager can set one with /config voice elevenlabs.",
			};
		}

		const apiKey = await getOptApiKey(
			context.tomoriState.server_id,
			ELEVENLABS_SERVICE_NAME,
		);
		if (!apiKey) {
			return {
				success: false,
				error:
					"No ElevenLabs API key is available for this server. A server manager can set one with /optionalkey elevenlabs set.",
			};
		}

		const synthesisResult = await synthesizeSpeechWithElevenLabs({
			apiKey,
			voiceId,
			script,
		});
		if (!synthesisResult.success || !synthesisResult.audioBuffer) {
			return {
				success: false,
				error:
					synthesisResult.details ||
					"Failed to generate the ElevenLabs voice message.",
			};
		}

		const attachment = new AttachmentBuilder(synthesisResult.audioBuffer, {
			name: this.buildAttachmentName(title, synthesisResult.extension ?? "mp3"),
		});
		const threadId = this.resolveThreadId(context);
		const captionText = synthesisResult.cleanedCaptionText ?? "";

		let sentMessageId: string | undefined;

		// Send audio only — no text caption in chat.
		// The caption is still cached below so history context can show the
		// spoken words without re-running STT on the audio attachment.
		if (context.webhook && context.personaUsername) {
			const sentMessage = await sendWebhookMessageWithIdentity(
				context.webhook,
				{
					files: [attachment],
					allowedMentions: {
						parse: [],
						repliedUser: false,
					},
					...(threadId ? { threadId } : {}),
				},
				{
					username: context.personaUsername,
					avatarUrl: context.personaAvatarUrl,
					avatarDataUri: context.personaAvatarUrl?.startsWith("data:image/")
						? context.personaAvatarUrl
						: undefined,
				},
			);
			sentMessageId = sentMessage.id;
		} else {
			const sentMessage = await context.channel.send({
				files: [attachment],
			});
			sentMessageId = sentMessage.id;
		}

		// Cache caption text keyed by message ID so the history formatter can
		// inline the clean text in future context passes without re-running STT.
		if (sentMessageId && captionText) {
			setCachedVoiceTranscript(sentMessageId, captionText, "tts");
		}

		return {
			success: true,
			message: "Voice message generated and sent to Discord.",
			endTurn: true,
		};
	}
}
