import { ChannelType, type AnyThreadChannel, type BaseGuildTextChannel, type TextChannel } from "discord.js";

export type GuildMessageCommandChannel = TextChannel | BaseGuildTextChannel | AnyThreadChannel;

const SUPPORTED_GUILD_MESSAGE_CHANNEL_TYPES = new Set<number>([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
]);

export function isGuildMessageCommandChannel(channel: unknown): channel is GuildMessageCommandChannel {
  if (!channel || typeof channel !== "object" || !("type" in channel)) {
    return false;
  }

  const channelType = Number((channel as { type: number }).type);
  return SUPPORTED_GUILD_MESSAGE_CHANNEL_TYPES.has(channelType);
}

export function resolveGuildWebhookTargetChannel(
  channel: GuildMessageCommandChannel,
): TextChannel | BaseGuildTextChannel | null {
  if ("isThread" in channel && typeof channel.isThread === "function" && channel.isThread()) {
    return channel.parent as BaseGuildTextChannel | null;
  }

  return channel as TextChannel | BaseGuildTextChannel;
}

export function resolveGuildWebhookThreadId(channel: GuildMessageCommandChannel): string | undefined {
  return "isThread" in channel && typeof channel.isThread === "function" && channel.isThread() ? channel.id : undefined;
}
