import { EmbedBuilder, type Message, type Webhook } from "discord.js";
import { stripBridgePrefix } from "@/utils/bridge";
import { ColorCode } from "@/utils/misc/logger";
import { localizer } from "@/utils/text/localizer";
import { sendWebhookMessageWithIdentity, type ResolvedWebhookIdentity } from "@/utils/discord/webhookManager";

export function getReplyContextAuthorName(message: Message): string {
  return message.member?.displayName ?? message.author.globalName ?? stripBridgePrefix(message.author.username);
}

export function buildReplyContextEmbed(targetMessage: Message, locale: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(ColorCode.INFO)
    .setDescription(
      localizer(locale, "genai.message_interaction.reply_context_description", {
        message_url: targetMessage.url,
      }),
    )
    .setFooter({
      text: localizer(locale, "genai.message_interaction.reply_context_footer", {
        user: getReplyContextAuthorName(targetMessage),
      }),
      iconURL: targetMessage.author.displayAvatarURL({
        size: 64,
        extension: "png",
        forceStatic: true,
      }),
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
  return await sendWebhookMessageWithIdentity(
    webhook,
    {
      content,
      embeds: [buildReplyContextEmbed(targetMessage, locale)],
      allowedMentions: {
        parse: ["users", "roles"],
        repliedUser: false,
      },
      ...(options?.threadId ? { threadId: options.threadId } : {}),
    },
    identity,
    options?.threadId ?? webhook.channelId ?? webhook.id,
  );
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
