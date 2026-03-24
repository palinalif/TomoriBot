import { EmbedBuilder, type Client } from "discord.js";
import type { ThoughtLogPayload } from "@/types/provider/interfaces";
import { getLlmDisplayName } from "@/utils/provider/modelDisplay";
import { ColorCode, log } from "@/utils/misc/logger";
import { localizer } from "@/utils/text/localizer";
import type { StreamContext } from "@/types/stream/interfaces";
import type { TomoriState } from "@/types/db/schema";

const EMBED_DESCRIPTION_LIMIT = 4096;
const EMBED_FIELD_LIMIT = 1024;
const ELLIPSIS = "...";

function normalizeThoughtLogText(value?: string): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function truncateForEmbed(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}

	if (maxLength <= ELLIPSIS.length) {
		return value.slice(0, maxLength);
	}

	return `${value.slice(0, maxLength - ELLIPSIS.length)}${ELLIPSIS}`;
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

	const replyLine = thoughtLog.firstReplyUrl
		? `\n[${localizer(locale, "genai.thought_log.reply_link_label")}](${thoughtLog.firstReplyUrl})`
		: "";
	const description = truncateForEmbed(
		localizer(locale, "genai.thought_log.description", {
			source_channel: sourceChannel.toString(),
			reply_line: replyLine,
		}),
		EMBED_DESCRIPTION_LIMIT,
	);

	const embed = new EmbedBuilder()
		.setColor(ColorCode.INFO)
		.setTitle(localizer(locale, "genai.thought_log.title"))
		.setDescription(description)
		.setTimestamp();

	const summary = normalizeThoughtLogText(thoughtLog.summary);
	if (summary) {
		embed.addFields({
			name: localizer(locale, "genai.thought_log.summary_field"),
			value: truncateForEmbed(summary, EMBED_FIELD_LIMIT),
		});
	}

	const raw = normalizeThoughtLogText(thoughtLog.raw);
	if (raw) {
		embed.addFields({
			name: localizer(locale, "genai.thought_log.raw_field"),
			value: truncateForEmbed(raw, EMBED_FIELD_LIMIT),
		});
	}

	embed.setFooter({
		text: localizer(locale, "genai.thought_log.footer", {
			provider: tomoriState.llm.llm_provider,
			model: getLlmDisplayName(
				tomoriState.llm,
				tomoriState.config.custom_model_name,
			),
		}),
	});

	try {
		await thoughtLogChannel.send({
			embeds: [embed],
			allowedMentions: { parse: [] },
		});
	} catch (error) {
		log.warn(
			`Failed to send thought log embed to channel ${thoughtLogChannelId}`,
			error instanceof Error ? error : new Error(String(error)),
		);
	}
}
