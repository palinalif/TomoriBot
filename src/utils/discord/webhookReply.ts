import { EmbedBuilder, type Message, type Webhook } from "discord.js";
import { stripBridgePrefix } from "@/utils/bridge";
import { localizer } from "@/utils/text/localizer";
import { sendWebhookMessageWithIdentity, type ResolvedWebhookIdentity } from "@/utils/discord/webhookManager";

export function getReplyContextAuthorName(message: Message, botUserId?: string, botName?: string): string {
  // When the target message is from the bot's own Discord account, use the configured
  // persona nickname instead of the raw Discord global name (e.g. "Tomori()").
  if (botUserId && botName && message.author.id === botUserId) return botName;
  return message.member?.displayName ?? message.author.globalName ?? stripBridgePrefix(message.author.username);
}

export function buildReplyContextEmbed(
  targetMessage: Message,
  locale: string,
  botUserId?: string,
  botName?: string,
): EmbedBuilder {
  const authorIconUrl =
    targetMessage.member?.displayAvatarURL({
      size: 64,
      extension: "png",
      forceStatic: true,
    }) ??
    targetMessage.author.displayAvatarURL({
      size: 64,
      extension: "png",
      forceStatic: true,
    });

  return new EmbedBuilder().setURL(targetMessage.url).setAuthor({
    name: localizer(locale, "genai.message_interaction.reply_context_author", {
      user: getReplyContextAuthorName(targetMessage, botUserId, botName),
    }),
    url: targetMessage.url,
    iconURL: authorIconUrl,
  });
}

export async function sendWebhookReplyWithContext(
  webhook: Webhook,
  targetMessage: Message,
  locale: string,
  content: string,
  identity: ResolvedWebhookIdentity,
  options?: {
    threadId?: string;
  },
): Promise<Message> {
  const replyNoticeMessage = await sendWebhookReplyNotice(webhook, targetMessage, locale, identity, options);

  try {
    return await sendWebhookMessageWithIdentity(
      webhook,
      {
        content,
        allowedMentions: {
          parse: ["users", "roles"],
          repliedUser: false,
        },
        ...(options?.threadId ? { threadId: options.threadId } : {}),
      },
      identity,
      options?.threadId ?? webhook.channelId ?? webhook.id,
    );
  } catch (error) {
    await webhook.deleteMessage(replyNoticeMessage.id, options?.threadId).catch(() => undefined);
    throw error;
  }
}

export async function sendWebhookReplyNotice(
  webhook: Webhook,
  targetMessage: Message,
  locale: string,
  identity: ResolvedWebhookIdentity,
  options?: {
    threadId?: string;
    botUserId?: string;
    botName?: string;
  },
): Promise<Message> {
  return await sendWebhookMessageWithIdentity(
    webhook,
    {
      embeds: [buildReplyContextEmbed(targetMessage, locale, options?.botUserId, options?.botName)],
      ...(options?.threadId ? { threadId: options.threadId } : {}),
    },
    identity,
    options?.threadId ?? webhook.channelId ?? webhook.id,
  );
}
