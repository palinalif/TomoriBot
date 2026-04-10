import { EmbedBuilder, type Message, type Webhook } from "discord.js";
import { stripBridgePrefix } from "@/utils/bridge";
import { ColorCode } from "@/utils/misc/logger";
import { localizer } from "@/utils/text/localizer";
import { sendWebhookMessageWithIdentity, type ResolvedWebhookIdentity } from "@/utils/discord/webhookManager";

export function getReplyContextAuthorName(message: Message): string {
  return message.member?.displayName ?? message.author.globalName ?? stripBridgePrefix(message.author.username);
}

export function buildReplyContextEmbed(targetMessage: Message, locale: string): EmbedBuilder {
  const authorIconUrl = targetMessage.author.displayAvatarURL({
    size: 64,
    extension: "png",
    forceStatic: true,
  });

  return new EmbedBuilder()
    .setColor(ColorCode.INFO)
    .setURL(targetMessage.url)
    .setAuthor({
      name: localizer(locale, "genai.message_interaction.reply_context_author", {
        user: getReplyContextAuthorName(targetMessage),
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
  },
): Promise<Message> {
  return await sendWebhookMessageWithIdentity(
    webhook,
    {
      embeds: [buildReplyContextEmbed(targetMessage, locale)],
      ...(options?.threadId ? { threadId: options.threadId } : {}),
    },
    identity,
    options?.threadId ?? webhook.channelId ?? webhook.id,
  );
}
