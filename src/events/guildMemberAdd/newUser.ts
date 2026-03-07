import {
	ChannelType,
	type Client,
	type GuildMember,
	type Message,
	type TextChannel,
} from "discord.js";
import type { StructuredContextItem } from "@/types/misc/context";
import type { EnhancedImageContent } from "@/types/tool/enhancedContextTypes";
import { ContextItemTag } from "@/types/misc/context";
import tomoriChat, {
	suppressNextSelfReply,
} from "@/events/messageCreate/tomoriChat";
import {
	getCachedAllPersonas,
	getCachedTomoriState,
} from "@/utils/cache/tomoriStateCache";
import { registerUser } from "@/utils/db/dbWrite";
import {
	buildForcedMentionsForUser,
	ensureDiscordUserMention,
} from "@/utils/discord/mentionHelper";
import { downloadImage } from "@/utils/image/avatarHelper";
import { log } from "@/utils/misc/logger";

async function buildWelcomeContextItem(params: {
	member: GuildMember;
	additionalPrompt: string;
	includeAvatarContext: boolean;
}): Promise<StructuredContextItem> {
	const { member, additionalPrompt, includeAvatarContext } = params;
	const displayName =
		member.displayName || member.user.globalName || member.user.username;
	const sentences = [
		`${displayName} just joined the server ${member.guild.name}, greet them by mentioning them by <@${member.id}> (Mention ID: ${member.id})!`,
	];
	const parts: StructuredContextItem["parts"] = [];

	if (includeAvatarContext) {
		const avatarUrl = member.displayAvatarURL({
			extension: "png",
			forceStatic: true,
			size: 1024,
		});

		try {
			const avatarBuffer = await downloadImage(avatarUrl);
			const base64Avatar = avatarBuffer.toString("base64");
			sentences.push(
				"What their avatar looks like has been attached as an image for your information.",
			);
			parts.push({
				type: "image",
				uri: `data:image/png;base64,${base64Avatar}`,
				mimeType: "image/png",
				inlineData: {
					mimeType: "image/png",
					data: base64Avatar,
				},
			} as EnhancedImageContent);
		} catch (error) {
			log.warn(
				`Failed to load avatar context for welcome message (${member.id}):`,
				error,
			);
		}
	}

	sentences.push(additionalPrompt);
	parts.unshift({
		type: "text",
		text: `[System: ${sentences.join(" ")}]`,
	});

	return {
		role: "user",
		metadataTag: ContextItemTag.DIALOGUE_HISTORY,
		parts,
	};
}

async function triggerWelcomeMessage(
	client: Client,
	member: GuildMember,
): Promise<void> {
	const tomoriState = await getCachedTomoriState(member.guild.id);
	if (!tomoriState) return;

	const welcomeChannelId = tomoriState.config.welcome_channel_disc_id;
	const additionalPrompt = tomoriState.config.welcome_prompt?.trim();
	if (!welcomeChannelId || !additionalPrompt) return;

	const rawChannel = await member.guild.channels
		.fetch(welcomeChannelId)
		.catch(() => null);
	if (!rawChannel || rawChannel.type !== ChannelType.GuildText) {
		log.warn(
			`Skipping welcome for ${member.user.tag}: configured welcome channel ${welcomeChannelId} is unavailable`,
		);
		return;
	}

	const welcomeChannel = rawChannel as TextChannel;
	const allPersonas = await getCachedAllPersonas(member.guild.id);
	const availablePersonas = allPersonas.length > 0 ? allPersonas : [tomoriState];
	const selectedWelcomePersonaId = tomoriState.config.welcome_persona_id;
	const chosenPersona =
		selectedWelcomePersonaId === null
			? availablePersonas[
					Math.floor(Math.random() * availablePersonas.length)
				]
			: (availablePersonas.find(
					(persona) => persona.tomori_id === selectedWelcomePersonaId,
				) ??
				availablePersonas.find((persona) => !persona.is_alter) ??
				availablePersonas[0]);

	if (!chosenPersona?.tomori_id) {
		log.warn(
			`Skipping welcome for ${member.user.tag}: no persona could be resolved`,
		);
		return;
	}

	let lastMessage: Message | undefined;
	try {
		const messages = await welcomeChannel.messages.fetch({ limit: 1 });
		lastMessage = messages.first();
	} catch (error) {
		log.warn(
			`Failed to fetch welcome anchor message from channel ${welcomeChannel.id}:`,
			error,
		);
	}

	if (!lastMessage) {
		try {
			lastMessage = await welcomeChannel.send({ content: "\u2800" });
			log.info(
				`Seeded placeholder message in welcome channel ${welcomeChannel.id}`,
			);
		} catch (error) {
			log.warn(
				`Failed to seed placeholder message in welcome channel ${welcomeChannel.id}:`,
				error,
			);
		}
	}

	if (!lastMessage) return;

	const welcomeContextItem = await buildWelcomeContextItem({
		member,
		additionalPrompt,
		includeAvatarContext: chosenPersona.llm.sees_images,
	});
	const forcedMentions = await buildForcedMentionsForUser(
		member.id,
		client,
		member.guild,
	);
	const welcomeStartTime = Date.now();

	suppressNextSelfReply(welcomeChannel.id);
	log.info(
		`Triggering welcome message for ${member.user.tag} in channel ${welcomeChannel.id} using persona ${chosenPersona.tomori_nickname}`,
	);

	await tomoriChat(
		client,
		lastMessage,
		false,
		true,
		false,
		undefined,
		undefined,
		false,
		0,
		false,
		undefined,
		undefined,
		chosenPersona.tomori_id,
		false,
		false,
		undefined,
		"system",
		`welcome:${member.guild.id}:${member.id}:${lastMessage.id}`,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		[welcomeContextItem],
		forcedMentions.length > 0 ? forcedMentions : undefined,
	);

	await ensureDiscordUserMention({
		client,
		channel: welcomeChannel,
		targetUserId: member.id,
		afterMessageId: lastMessage.id,
		triggerStartTime: welcomeStartTime,
		contextLabel: `welcome for member ${member.id} in server ${member.guild.id}`,
	});
}

/**
 * Handles registration of new users when they join a guild.
 * Creates user record if new, and logs the action.
 * @param client - The Discord client instance
 * @param member - The guild member who joined
 * @returns Promise<void>
 */
const handler = async (_client: Client, member: GuildMember): Promise<void> => {
	try {
		const userLanguage = member.guild.preferredLocale;
		log.info(
			`New user ${member.user.tag} joined server, registering with language: ${userLanguage}`,
		);

		const userData = await registerUser(
			member.id,
			member.user.username,
			userLanguage,
		);

		if (userData) {
			log.success(`User ${member.user.tag} registered successfully`);
		} else {
			log.error(`Failed to register user ${member.user.tag}`);
		}
	} catch (error) {
		log.error(`Error registering joined member ${member.user.tag}:`, error);
	}

	if (member.user.bot) return;

	try {
		await triggerWelcomeMessage(_client, member);
	} catch (error) {
		log.error(`Error sending welcome message for ${member.user.tag}:`, error);
	}
};

export default handler;
