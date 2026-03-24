import { EmbedBuilder, type Client } from "discord.js";
import type { ThoughtLogPayload } from "@/types/provider/interfaces";
import { getLlmDisplayName } from "@/utils/provider/modelDisplay";
import { ColorCode, log } from "@/utils/misc/logger";
import { localizer } from "@/utils/text/localizer";
import type { StreamContext } from "@/types/stream/interfaces";
import type { TomoriState } from "@/types/db/schema";

const EMBED_DESCRIPTION_LIMIT = 4096;

function normalizeThoughtLogText(value?: string): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function takeEmbedChunk(
	value: string,
	maxLength: number,
): {
	chunk: string;
	remaining: string;
} {
	if (value.length <= maxLength) {
		return {
			chunk: value.trim(),
			remaining: "",
		};
	}

	let splitIndex = Math.max(
		value.lastIndexOf("\n", maxLength),
		value.lastIndexOf(" ", maxLength),
	);
	if (splitIndex <= 0) {
		splitIndex = maxLength;
	} else {
		splitIndex += 1;
	}

	return {
		chunk: value.slice(0, splitIndex).trim(),
		remaining: value.slice(splitIndex).trim(),
	};
}

function buildThoughtLogEmbeds(args: {
	locale: string;
	tomoriState: TomoriState;
	sourceChannel: StreamContext["channel"];
	thoughtLog: ThoughtLogPayload;
}): EmbedBuilder[] {
	const { locale, tomoriState, sourceChannel, thoughtLog } = args;
	const embeds: EmbedBuilder[] = [];
	const replyLine = thoughtLog.firstReplyUrl
		? `\n[${localizer(locale, "genai.thought_log.reply_link_label")}](${thoughtLog.firstReplyUrl})`
		: "";
	const description = localizer(locale, "genai.thought_log.description", {
		source_channel: sourceChannel.toString(),
		reply_line: replyLine,
	}).slice(0, EMBED_DESCRIPTION_LIMIT);
	const footerText = localizer(locale, "genai.thought_log.footer", {
		provider: tomoriState.llm.llm_provider,
		model: getLlmDisplayName(
			tomoriState.llm,
			tomoriState.config.custom_model_name,
		),
	});

	const sections = [
		{
			label: localizer(locale, "genai.thought_log.summary_field"),
			content: normalizeThoughtLogText(thoughtLog.summary),
		},
		{
			label: localizer(locale, "genai.thought_log.raw_field"),
			content: normalizeThoughtLogText(thoughtLog.raw),
		},
	].filter(
		(section): section is { label: string; content: string } =>
			typeof section.content === "string" && section.content.length > 0,
	);

	if (sections.length === 0) {
		embeds.push(
			new EmbedBuilder()
				.setColor(ColorCode.INFO)
				.setTitle(localizer(locale, "genai.thought_log.title"))
				.setDescription(description)
				.setTimestamp()
				.setFooter({ text: footerText }),
		);
		return embeds;
	}

	let metadataAttached = false;
	for (const section of sections) {
		let remaining = section.content;

		while (remaining.length > 0) {
			const sectionHeader = `**${section.label}**\n`;
			const prefix =
				!metadataAttached && embeds.length === 0
					? `${description}\n\n${sectionHeader}`
					: sectionHeader;
			const availableLength = Math.max(
				1,
				EMBED_DESCRIPTION_LIMIT - prefix.length,
			);
			const { chunk, remaining: nextRemaining } = takeEmbedChunk(
				remaining,
				availableLength,
			);

			embeds.push(
				new EmbedBuilder()
					.setColor(ColorCode.INFO)
					.setTitle(localizer(locale, "genai.thought_log.title"))
					.setDescription(`${prefix}${chunk}`)
					.setTimestamp()
					.setFooter({ text: footerText }),
			);

			remaining = nextRemaining;
			metadataAttached = true;
		}
	}

	return embeds;
}

function appendThoughtSection(
	existing?: string,
	incoming?: string,
): string | undefined {
	const normalizedExisting = normalizeThoughtLogText(existing);
	const normalizedIncoming = normalizeThoughtLogText(incoming);
	if (!normalizedIncoming) {
		return normalizedExisting;
	}
	if (!normalizedExisting || normalizedExisting === normalizedIncoming) {
		return normalizedIncoming;
	}
	if (normalizedExisting.includes(normalizedIncoming)) {
		return normalizedExisting;
	}
	if (normalizedIncoming.includes(normalizedExisting)) {
		return normalizedIncoming;
	}

	return `${normalizedExisting}\n\n${normalizedIncoming}`;
}

export function mergeThoughtLogPayload(
	base?: ThoughtLogPayload | null,
	next?: ThoughtLogPayload | null,
): ThoughtLogPayload | undefined {
	const summary = appendThoughtSection(base?.summary, next?.summary);
	const raw = appendThoughtSection(base?.raw, next?.raw);
	const firstReplyUrl = base?.firstReplyUrl || next?.firstReplyUrl;

	if (!summary && !raw && !firstReplyUrl) {
		return undefined;
	}

	return {
		summary,
		raw,
		firstReplyUrl,
	};
}

export function hasThoughtLogContent(payload?: ThoughtLogPayload | null): boolean {
	return Boolean(
		normalizeThoughtLogText(payload?.summary) ||
			normalizeThoughtLogText(payload?.raw),
	);
}

interface SendThoughtLogEmbedArgs {
	client: Client;
	locale: string;
	tomoriState: TomoriState;
	sourceChannel: StreamContext["channel"];
	thoughtLogChannelId: string;
	thoughtLog: ThoughtLogPayload;
}

export async function sendThoughtLogEmbed({
	client,
	locale,
	tomoriState,
	sourceChannel,
	thoughtLogChannelId,
	thoughtLog,
}: SendThoughtLogEmbedArgs): Promise<void> {
	if (!hasThoughtLogContent(thoughtLog)) {
		return;
	}

	const thoughtLogChannel = await client.channels
		.fetch(thoughtLogChannelId)
		.catch(() => null);

	if (
		!thoughtLogChannel ||
		!("send" in thoughtLogChannel) ||
		typeof thoughtLogChannel.send !== "function" ||
		("isDMBased" in thoughtLogChannel &&
			typeof thoughtLogChannel.isDMBased === "function" &&
			thoughtLogChannel.isDMBased())
	) {
		log.warn(
			`Thought log channel ${thoughtLogChannelId} is missing or unavailable. Skipping thought log post.`,
		);
		return;
	}

	const embeds = buildThoughtLogEmbeds({
		locale,
		tomoriState,
		sourceChannel,
		thoughtLog,
	});

	try {
		for (const embed of embeds) {
			await thoughtLogChannel.send({
				embeds: [embed],
				allowedMentions: { parse: [] },
			});
		}
		log.info(
			`Posted ${embeds.length} thought log embed(s) to channel ${thoughtLogChannelId}`,
		);
	} catch (error) {
		log.warn(
			`Failed to send thought log embed to channel ${thoughtLogChannelId}`,
			error instanceof Error ? error : new Error(String(error)),
		);
	}
}
