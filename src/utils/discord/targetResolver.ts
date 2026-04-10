import type { Guild, GuildMember, GuildTextBasedChannel } from "discord.js";
import { ContextItemTag, type ConversationUserReference, type StructuredContextItem } from "@/types/misc/context";
import type { ToolContext } from "@/types/tool/interfaces";
import { loadUserRowsByNormalizedNickname } from "@/utils/db/dbRead";
import { isBridgeUserId } from "@/utils/bridge";

export type ResolvedUserTarget = {
  status: "resolved";
  targetId: string;
  displayLabel: string;
  isBridgeUser: boolean;
  source: "legacy_id" | "conversation" | "guild_display_name" | "db_nickname" | "global_name" | "username";
};

export type AmbiguousUserTarget = {
  status: "ambiguous";
  input: string;
  candidates: Array<{
    label: string;
    targetId: string;
    isBridgeUser: boolean;
  }>;
};

export type NotFoundUserTarget = {
  status: "not_found";
  input: string;
};

export type UserTargetResolution = ResolvedUserTarget | AmbiguousUserTarget | NotFoundUserTarget;

export type ResolvedChannelTarget = {
  status: "resolved";
  channel: GuildTextBasedChannel;
  displayLabel: string;
  source: "legacy_id" | "channel_name" | "thread_name" | "normalized_name";
};

export type AmbiguousChannelTarget = {
  status: "ambiguous";
  input: string;
  candidates: Array<{
    label: string;
    channelName: string;
    channelId?: string;
  }>;
};

export type NotFoundChannelTarget = {
  status: "not_found";
  input: string;
};

export type ChannelTargetResolution = ResolvedChannelTarget | AmbiguousChannelTarget | NotFoundChannelTarget;

type GuildSearchStage = "guild_display_name" | "global_name" | "username";

function normalizeLookupValue(value: string, prefixToStrip?: "@" | "#"): string {
  let normalized = value.trim();
  if (prefixToStrip && normalized.startsWith(prefixToStrip)) {
    normalized = normalized.slice(1).trim();
  }
  return normalized.replace(/\s+/g, " ").trim().toLowerCase();
}

export function normalizeUserTargetInput(value: string): string {
  return normalizeLookupValue(value, "@");
}

export function normalizeChannelTargetInput(value: string): string {
  return normalizeLookupValue(value, "#");
}

function isDiscordSnowflake(value: string): boolean {
  return /^\d{17,20}$/.test(value.trim());
}

function isGuildTextTarget(channel: unknown): channel is GuildTextBasedChannel {
  if (!channel || typeof channel !== "object") {
    return false;
  }

  if (!("isTextBased" in channel) || !("isDMBased" in channel)) {
    return false;
  }

  return (
    typeof (channel as { isTextBased?: unknown }).isTextBased === "function" &&
    (channel as { isTextBased: () => boolean }).isTextBased() &&
    !(channel as { isDMBased: () => boolean }).isDMBased()
  );
}

function isThreadLike(channel: { isThread?: () => boolean }): boolean {
  return typeof channel.isThread === "function" && channel.isThread();
}

function formatDiscordUserLabel(member: GuildMember): string {
  const displayName = member.displayName?.trim() || member.user.globalName?.trim() || member.user.username.trim();
  const username = member.user.username.trim();
  return displayName.toLowerCase() === username.toLowerCase() ? displayName : `${displayName} (@${username})`;
}

function formatBridgeUserLabel(reference: ConversationUserReference): string {
  return reference.displayLabel.includes("(Matrix)") ? reference.displayLabel : `${reference.displayLabel} (Matrix)`;
}

function dedupeUserCandidates(
  candidates: Array<{
    label: string;
    targetId: string;
    isBridgeUser: boolean;
  }>,
): Array<{
  label: string;
  targetId: string;
  isBridgeUser: boolean;
}> {
  const seen = new Set<string>();
  const deduped: Array<{
    label: string;
    targetId: string;
    isBridgeUser: boolean;
  }> = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.targetId)) {
      continue;
    }
    seen.add(candidate.targetId);
    deduped.push(candidate);
  }

  return deduped;
}

function dedupeChannelCandidates(
  candidates: Array<{
    label: string;
    channelName: string;
    channel: GuildTextBasedChannel;
  }>,
): Array<{
  label: string;
  channelName: string;
  channel: GuildTextBasedChannel;
}> {
  const seen = new Set<string>();
  const deduped: Array<{
    label: string;
    channelName: string;
    channel: GuildTextBasedChannel;
  }> = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.channel.id)) {
      continue;
    }
    seen.add(candidate.channel.id);
    deduped.push(candidate);
  }

  return deduped;
}

function getConversationUserReferences(contextItems?: StructuredContextItem[]): ConversationUserReference[] {
  if (!contextItems) {
    return [];
  }

  const collected: ConversationUserReference[] = [];
  for (const item of contextItems) {
    if (item.metadataTag !== ContextItemTag.KNOWLEDGE_USERS_IN_CONVERSATION || !item.conversationUsers?.length) {
      continue;
    }
    collected.push(...item.conversationUsers);
  }

  return collected;
}

async function getContextGuild(context: ToolContext): Promise<Guild | null> {
  if (!context.guildId) {
    return null;
  }

  return (
    context.client.guilds.cache.get(context.guildId) ??
    (await context.client.guilds.fetch(context.guildId).catch(() => null))
  );
}

async function searchGuildMembers(guild: Guild, query: string): Promise<GuildMember[]> {
  if (!query.trim()) {
    return [];
  }

  const results = await guild.members
    .search({
      query,
      limit: 100,
    })
    .catch(() => null);

  return results ? Array.from(results.values()).filter((member) => !member.user.bot) : [];
}

function filterExactGuildMatches(
  members: GuildMember[],
  normalizedInput: string,
  stage: GuildSearchStage,
): GuildMember[] {
  return members.filter((member) => {
    const candidateValue =
      stage === "guild_display_name"
        ? member.displayName
        : stage === "global_name"
          ? member.user.globalName
          : member.user.username;

    return candidateValue ? normalizeUserTargetInput(candidateValue) === normalizedInput : false;
  });
}

function resolveConversationUserMatch(
  references: ConversationUserReference[],
  normalizedInput: string,
): UserTargetResolution | null {
  const matches = references.filter((reference) =>
    reference.aliases.some((alias) => normalizeUserTargetInput(alias) === normalizedInput),
  );

  if (matches.length === 0) {
    return null;
  }

  const dedupedMatches = dedupeUserCandidates(
    matches.map((match) => ({
      label: isBridgeUserId(match.targetId) ? formatBridgeUserLabel(match) : match.displayLabel,
      targetId: match.targetId,
      isBridgeUser: isBridgeUserId(match.targetId),
    })),
  );

  if (dedupedMatches.length === 1) {
    const match = dedupedMatches[0];
    return {
      status: "resolved",
      targetId: match.targetId,
      displayLabel: match.label,
      isBridgeUser: match.isBridgeUser,
      source: "conversation",
    };
  }

  return {
    status: "ambiguous",
    input: normalizedInput,
    candidates: dedupedMatches.slice(0, 3),
  };
}

function resolveGuildMemberStage(
  normalizedInput: string,
  matches: GuildMember[],
  stage: GuildSearchStage,
): UserTargetResolution | null {
  const exactMatches = filterExactGuildMatches(matches, normalizedInput, stage);
  if (exactMatches.length === 0) {
    return null;
  }

  const dedupedMatches = dedupeUserCandidates(
    exactMatches.map((member) => ({
      label: formatDiscordUserLabel(member),
      targetId: member.id,
      isBridgeUser: false,
    })),
  );

  if (dedupedMatches.length === 1) {
    const match = dedupedMatches[0];
    return {
      status: "resolved",
      targetId: match.targetId,
      displayLabel: match.label,
      isBridgeUser: false,
      source: stage,
    };
  }

  return {
    status: "ambiguous",
    input: normalizedInput,
    candidates: dedupedMatches.slice(0, 3),
  };
}

export async function resolveUserTarget(input: string, context: ToolContext): Promise<UserTargetResolution> {
  const rawInput = input.trim();
  const normalizedInput = normalizeUserTargetInput(input);
  if (!normalizedInput) {
    return {
      status: "not_found",
      input: rawInput,
    };
  }

  const conversationReferences = getConversationUserReferences(context.contextItems);

  if (isBridgeUserId(rawInput)) {
    const bridgeReference = conversationReferences.find((reference) => reference.targetId === rawInput);
    if (bridgeReference) {
      return {
        status: "resolved",
        targetId: bridgeReference.targetId,
        displayLabel: formatBridgeUserLabel(bridgeReference),
        isBridgeUser: true,
        source: "legacy_id",
      };
    }
  }

  if (isDiscordSnowflake(rawInput)) {
    const guild = await getContextGuild(context);
    if (guild) {
      const member = await guild.members.fetch(rawInput).catch(() => null);
      if (member && !member.user.bot) {
        return {
          status: "resolved",
          targetId: member.id,
          displayLabel: formatDiscordUserLabel(member),
          isBridgeUser: false,
          source: "legacy_id",
        };
      }
    }

    const selfConversationMatch = conversationReferences.find((reference) => reference.targetId === rawInput);
    if (selfConversationMatch) {
      return {
        status: "resolved",
        targetId: selfConversationMatch.targetId,
        displayLabel: selfConversationMatch.displayLabel,
        isBridgeUser: isBridgeUserId(selfConversationMatch.targetId),
        source: "legacy_id",
      };
    }

    return {
      status: "not_found",
      input: rawInput,
    };
  }

  const conversationMatch = resolveConversationUserMatch(conversationReferences, normalizedInput);
  if (conversationMatch) {
    return conversationMatch;
  }

  const guild = await getContextGuild(context);
  if (!guild) {
    return {
      status: "not_found",
      input: rawInput,
    };
  }

  const guildSearchMatches = await searchGuildMembers(guild, rawInput);

  const guildDisplayMatch = resolveGuildMemberStage(normalizedInput, guildSearchMatches, "guild_display_name");
  if (guildDisplayMatch) {
    return guildDisplayMatch;
  }

  const dbNicknameRows = await loadUserRowsByNormalizedNickname(normalizedInput);
  if (dbNicknameRows.length > 0) {
    const dbNicknameMembers = (
      await Promise.all(dbNicknameRows.map(async (row) => guild.members.fetch(row.user_disc_id).catch(() => null)))
    ).filter((member): member is GuildMember => member !== null && !member.user.bot);

    const dedupedMatches = dedupeUserCandidates(
      dbNicknameMembers.map((member) => ({
        label: formatDiscordUserLabel(member),
        targetId: member.id,
        isBridgeUser: false,
      })),
    );

    if (dedupedMatches.length === 1) {
      const match = dedupedMatches[0];
      return {
        status: "resolved",
        targetId: match.targetId,
        displayLabel: match.label,
        isBridgeUser: false,
        source: "db_nickname",
      };
    }

    if (dedupedMatches.length > 1) {
      return {
        status: "ambiguous",
        input: rawInput,
        candidates: dedupedMatches.slice(0, 3),
      };
    }
  }

  const globalNameMatch = resolveGuildMemberStage(normalizedInput, guildSearchMatches, "global_name");
  if (globalNameMatch) {
    return globalNameMatch;
  }

  const usernameMatch = resolveGuildMemberStage(normalizedInput, guildSearchMatches, "username");
  if (usernameMatch) {
    return usernameMatch;
  }

  return {
    status: "not_found",
    input: rawInput,
  };
}

function formatChannelCandidateLabel(channel: GuildTextBasedChannel): string {
  if (isThreadLike(channel)) {
    const parentName =
      "parent" in channel && channel.parent && "name" in channel.parent ? ` in #${channel.parent.name}` : "";
    return `${channel.name}${parentName}`;
  }

  return `#${channel.name}`;
}

export async function formatChannelReferenceLabel(channel: GuildTextBasedChannel): Promise<string> {
  const baseLabel = formatChannelCandidateLabel(channel);
  if (!isThreadLike(channel) || !("guild" in channel)) {
    return baseLabel;
  }

  const activeThreads = await getActiveThreadTargets(channel.guild);
  const duplicateCount = activeThreads.filter((thread) => formatChannelCandidateLabel(thread) === baseLabel).length;
  return duplicateCount > 1 ? `${baseLabel} (ID: ${channel.id})` : baseLabel;
}

function buildAmbiguousChannelCandidates(
  candidates: Array<{
    label: string;
    channelName: string;
    channel: GuildTextBasedChannel;
  }>,
): Array<{
  label: string;
  channelName: string;
  channelId?: string;
}> {
  const labelCounts = new Map<string, number>();
  for (const candidate of candidates) {
    labelCounts.set(candidate.label, (labelCounts.get(candidate.label) ?? 0) + 1);
  }

  return candidates.slice(0, 3).map((candidate) => {
    const shouldExposeChannelId = isThreadLike(candidate.channel) && (labelCounts.get(candidate.label) ?? 0) > 1;

    return {
      label: shouldExposeChannelId ? `${candidate.label} (ID: ${candidate.channel.id})` : candidate.label,
      channelName: candidate.channelName,
      channelId: shouldExposeChannelId ? candidate.channel.id : undefined,
    };
  });
}

async function getActiveThreadTargets(guild: Guild): Promise<GuildTextBasedChannel[]> {
  const activeThreads = await guild.channels.fetchActiveThreads().catch(() => null);
  if (!activeThreads) {
    return [];
  }

  return activeThreads.threads
    .filter((thread) => isGuildTextTarget(thread))
    .map((thread) => thread as GuildTextBasedChannel);
}

export async function resolveChannelTarget(input: string, context: ToolContext): Promise<ChannelTargetResolution> {
  const rawInput = input.trim();
  const normalizedInput = normalizeChannelTargetInput(input);
  if (!normalizedInput) {
    return {
      status: "not_found",
      input: rawInput,
    };
  }

  const guild = await getContextGuild(context);
  if (!guild) {
    return {
      status: "not_found",
      input: rawInput,
    };
  }

  if (isDiscordSnowflake(rawInput)) {
    const channel = await context.client.channels.fetch(rawInput).catch(() => null);
    if (channel && isGuildTextTarget(channel) && "guildId" in channel && channel.guildId === guild.id) {
      return {
        status: "resolved",
        channel,
        displayLabel: formatChannelCandidateLabel(channel),
        source: "legacy_id",
      };
    }
  }

  const textChannels = guild.channels.cache
    .filter((channel) => isGuildTextTarget(channel) && !isThreadLike(channel))
    .map((channel) => channel as GuildTextBasedChannel);

  const exactChannelMatches = dedupeChannelCandidates(
    textChannels
      .filter((channel) => normalizeChannelTargetInput(channel.name) === normalizedInput)
      .map((channel) => ({
        label: formatChannelCandidateLabel(channel),
        channelName: channel.name,
        channel,
      })),
  );

  if (exactChannelMatches.length === 1) {
    return {
      status: "resolved",
      channel: exactChannelMatches[0].channel,
      displayLabel: exactChannelMatches[0].label,
      source: "channel_name",
    };
  }

  if (exactChannelMatches.length > 1) {
    return {
      status: "ambiguous",
      input: rawInput,
      candidates: buildAmbiguousChannelCandidates(exactChannelMatches),
    };
  }

  const activeThreads = await getActiveThreadTargets(guild);
  const exactThreadMatches = dedupeChannelCandidates(
    activeThreads
      .filter((thread) => normalizeChannelTargetInput(thread.name) === normalizedInput)
      .map((thread) => ({
        label: formatChannelCandidateLabel(thread),
        channelName: thread.name,
        channel: thread,
      })),
  );

  if (exactThreadMatches.length === 1) {
    return {
      status: "resolved",
      channel: exactThreadMatches[0].channel,
      displayLabel: exactThreadMatches[0].label,
      source: "thread_name",
    };
  }

  if (exactThreadMatches.length > 1) {
    return {
      status: "ambiguous",
      input: rawInput,
      candidates: buildAmbiguousChannelCandidates(exactThreadMatches),
    };
  }

  const normalizedMatches = dedupeChannelCandidates(
    [...textChannels, ...activeThreads]
      .filter((channel) => normalizeChannelTargetInput(channel.name) === normalizedInput)
      .map((channel) => ({
        label: formatChannelCandidateLabel(channel),
        channelName: channel.name,
        channel,
      })),
  );

  if (normalizedMatches.length === 1) {
    return {
      status: "resolved",
      channel: normalizedMatches[0].channel,
      displayLabel: normalizedMatches[0].label,
      source: "normalized_name",
    };
  }

  if (normalizedMatches.length > 1) {
    return {
      status: "ambiguous",
      input: rawInput,
      candidates: buildAmbiguousChannelCandidates(normalizedMatches),
    };
  }

  return {
    status: "not_found",
    input: rawInput,
  };
}
