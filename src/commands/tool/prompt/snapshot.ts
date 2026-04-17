import type { ChatInputCommandInteraction, Client, SlashCommandSubcommandBuilder } from "discord.js";
import { AttachmentBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { localizer } from "@/utils/text/localizer";
import { log, ColorCode } from "@/utils/misc/logger";
import { replyInfoEmbed, promptWithPaginatedModal, safeSelectOptionText } from "@/utils/discord/interactionHelper";
import { getCachedTomoriState, getCachedAllPersonas } from "@/utils/cache/tomoriStateCache";
import { buildContext } from "@/utils/text/contextBuilder";
import { getCachedActivePreset } from "@/utils/cache/stPresetCache";
import { getCachedPrivacyLevel } from "@/utils/cache/userCache";
import { normalizeProviderName } from "@/utils/provider/providerInfoRegistry";
import { normalizeMessageFetchLimit } from "@/utils/discord/messageFetchLimit";
import { PrivacyLevel, type UserRow, type TomoriState } from "@/types/db/schema";
import type { StructuredContextItem } from "@/types/misc/context";
import { GoogleStreamAdapter } from "@/providers/google/googleStreamAdapter";
import { OpenrouterStreamAdapter } from "@/providers/openrouter/openrouterStreamAdapter";
import { AnthropicStreamAdapter } from "@/providers/anthropic/anthropicStreamAdapter";

// ─── Constants ────────────────────────────────────────────────────────────────

const PERSONA_SELECT_ID = "prompt_snapshot_persona_select";

// Matches YouTube links in message content — same pattern as /tool estimate cost
const YOUTUBE_URL_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i,
  /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/i,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i,
];

// ─── Subcommand registration ──────────────────────────────────────────────────

export const configureSubcommand = (subcommand: SlashCommandSubcommandBuilder) =>
  subcommand
    .setName("snapshot")
    .setDescription(localizer("en-US", "commands.tool.prompt.snapshot.description"))
    .addStringOption((option) =>
      option
        .setName("format")
        .setDescription(localizer("en-US", "commands.tool.prompt.snapshot.format_description"))
        .addChoices(
          { name: localizer("en-US", "commands.tool.prompt.snapshot.text_option"), value: "text" },
          { name: localizer("en-US", "commands.tool.prompt.snapshot.json_option"), value: "json" },
        ),
    );

// ─── Execute ──────────────────────────────────────────────────────────────────

/**
 * Dumps the compiled LLM prompt for a chosen persona + current channel to a file,
 * then sends it to the invoking user via DM (or as an ephemeral attachment if DMs are closed).
 *
 * @param client - Discord client instance
 * @param interaction - Command interaction (must be in a guild channel)
 * @param _userData - User row (unused, required by command loader signature)
 * @param locale - Resolved locale for the interaction
 */
export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction,
  _userData: UserRow,
  locale: string,
): Promise<void> {
  // Unique modal ID per invocation prevents stale awaitModalSubmit collisions
  const MODAL_CUSTOM_ID = `tool_promptsnapshot_modal_${interaction.id}`;

  // 1. Require a guild channel — DM context cannot fetch server state
  if (!interaction.guild || !interaction.channel) {
    await replyInfoEmbed(interaction, locale, {
      titleKey: "commands.tool.prompt.snapshot.guild_only_title",
      descriptionKey: "commands.tool.prompt.snapshot.guild_only_description",
      color: ColorCode.ERROR,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    // 2. Load server state for permission check
    const tomoriState = await getCachedTomoriState(interaction.guild.id);
    if (!tomoriState) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.tomori_not_setup_title",
        descriptionKey: "general.errors.tomori_not_setup_description",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // 3. Permission gate — ManageGuild always bypasses; prompt_snapshot_enabled extends to non-admins
    const hasManageGuild = interaction.memberPermissions?.has("ManageGuild") ?? false;
    const snapshotEnabled = tomoriState.config.prompt_snapshot_enabled ?? false;
    if (!hasManageGuild && !snapshotEnabled) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.tool.prompt.snapshot.no_permission_title",
        descriptionKey: "commands.tool.prompt.snapshot.no_permission_description",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // 4. Read optional format choice (defaults to "text")
    const format = interaction.options.getString("format") ?? "text";

    // 5. Load all server personas for the select modal
    const personas = await getCachedAllPersonas(interaction.guild.id);
    if (personas.length === 0) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "commands.tool.prompt.snapshot.no_personas_title",
        descriptionKey: "commands.tool.prompt.snapshot.no_personas_description",
        color: ColorCode.WARN,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // 6. Build persona select options — index-based values avoid Discord's 100-char value limit
    const personaOptions = personas.map((persona, index) => ({
      label: safeSelectOptionText(persona.tomori_nickname),
      value: index.toString(),
      description: persona.is_alter ? "Alter Persona" : "Main Persona",
    }));

    // 7. Show persona select modal — this is the first interaction acknowledgment;
    //    do NOT deferReply before this call
    const modalResult = await promptWithPaginatedModal(interaction, locale, {
      modalCustomId: MODAL_CUSTOM_ID,
      modalTitleKey: "commands.tool.prompt.snapshot.modal_title",
      components: [
        {
          customId: PERSONA_SELECT_ID,
          labelKey: "commands.tool.prompt.snapshot.persona_select_label",
          descriptionKey: "commands.tool.prompt.snapshot.persona_select_description",
          placeholder: "commands.tool.prompt.snapshot.persona_select_placeholder",
          required: true,
          options: personaOptions,
        },
      ],
    });

    if (modalResult.outcome !== "submit" || !modalResult.interaction) return;
    const modalInteraction = modalResult.interaction;

    // 8. Defer modal submission before async work to prevent interaction timeout
    if (!modalInteraction.deferred && !modalInteraction.replied) {
      await modalInteraction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    // 9. Resolve the selected persona from the index value
    const selectedIndexStr = modalResult.values?.[PERSONA_SELECT_ID];
    const selectedIndex = selectedIndexStr !== undefined ? Number.parseInt(selectedIndexStr, 10) : 0;
    const selectedPersona: TomoriState | undefined = personas[selectedIndex];

    if (!selectedPersona) {
      await modalInteraction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(localizer(locale, "commands.tool.prompt.snapshot.build_failed_title"))
            .setDescription(localizer(locale, "commands.tool.prompt.snapshot.build_failed_description"))
            .setColor(ColorCode.ERROR),
        ],
      });
      return;
    }

    // 10. Fetch channel message history — same pattern as /tool estimate cost
    const textChannel = interaction.channel;
    if (!("messages" in textChannel)) {
      await modalInteraction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(localizer(locale, "commands.tool.prompt.snapshot.build_failed_title"))
            .setDescription(localizer(locale, "commands.tool.prompt.snapshot.build_failed_description"))
            .setColor(ColorCode.ERROR),
        ],
      });
      return;
    }

    const messageFetchLimit = normalizeMessageFetchLimit(selectedPersona.config.message_fetch_limit);
    const fetchedMessages = await textChannel.messages.fetch({ limit: messageFetchLimit });
    const messagesArray = Array.from(fetchedMessages.values()).reverse();

    // 11. Build persona nickname index for webhook attribution
    const personaByNickname = new Map<string, TomoriState>();
    for (const p of personas) {
      if (!p.tomori_nickname) continue;
      const key = p.tomori_nickname.toLowerCase();
      if (!personaByNickname.has(key)) personaByNickname.set(key, p);
    }
    const mainPersona = personas.find((p) => !p.is_alter) ?? tomoriState;

    // 12. Convert Discord messages to simplified context format
    type SimpleMsg = {
      id: string;
      authorId: string;
      authorName: string;
      authorType: "user" | "persona";
      personaName?: string | null;
      content: string | null;
      mediaSourceMessageIds?: string[];
      imageAttachments: Array<{
        url: string;
        proxyUrl: string;
        mimeType: string | null;
        filename: string;
        isEmoji?: boolean;
      }>;
      videoAttachments: Array<{
        url: string;
        proxyUrl: string;
        mimeType: string | null;
        filename: string;
        isYouTubeLink: boolean;
      }>;
    };

    const simplifiedMessages: SimpleMsg[] = [];
    const userListSet = new Set<string>();

    for (const message of messagesArray) {
      // Skip fully-private users (same gate as real context building)
      if (!message.webhookId) {
        const privacyLevel = await getCachedPrivacyLevel(message.author.id);
        if (privacyLevel === PrivacyLevel.FULL) continue;
      }

      let effectiveAuthorId = message.author.id;
      let authorName = `<@${message.author.id}>`;
      let authorType: "user" | "persona" = "user";
      let personaName: string | null = null;

      if (message.author.id === client.user?.id) {
        authorName = mainPersona.tomori_nickname ?? tomoriState.tomori_nickname ?? message.author.username;
        authorType = "persona";
        personaName = authorName;
      } else if (message.webhookId) {
        const webhookName = message.author.username?.trim();
        const matchedPersona = webhookName ? personaByNickname.get(webhookName.toLowerCase()) : undefined;
        if (matchedPersona) {
          authorName = matchedPersona.tomori_nickname;
          authorType = "persona";
          personaName = matchedPersona.tomori_nickname;
          effectiveAuthorId = `persona:${matchedPersona.tomori_id ?? matchedPersona.tomori_nickname}`;
        } else if (webhookName) {
          authorName = webhookName;
        }
      }

      const imageAttachments: SimpleMsg["imageAttachments"] = [];
      const videoAttachments: SimpleMsg["videoAttachments"] = [];
      let hasLocalMedia = false;

      for (const att of message.attachments.values()) {
        if (att.contentType?.startsWith("image/")) {
          imageAttachments.push({
            url: att.url,
            proxyUrl: att.proxyURL,
            mimeType: att.contentType,
            filename: att.name,
          });
          hasLocalMedia = true;
        } else if (att.contentType?.startsWith("video/")) {
          videoAttachments.push({
            url: att.url,
            proxyUrl: att.proxyURL,
            mimeType: att.contentType,
            filename: att.name,
            isYouTubeLink: false,
          });
          hasLocalMedia = true;
        }
      }

      for (const sticker of message.stickers.values()) {
        const stickerUrl = `https://cdn.discordapp.com/stickers/${sticker.id}.png`;
        imageAttachments.push({
          url: stickerUrl,
          proxyUrl: stickerUrl,
          mimeType: "image/png",
          filename: `${sticker.name}.png`,
        });
        hasLocalMedia = true;
      }

      if (message.content) {
        for (const pattern of YOUTUBE_URL_PATTERNS) {
          const match = message.content.match(pattern);
          if (!match) continue;
          videoAttachments.push({
            url: match[0],
            proxyUrl: match[0],
            mimeType: "video/youtube",
            filename: `youtube_video_${match[1]}.mp4`,
            isYouTubeLink: true,
          });
          hasLocalMedia = true;
          break;
        }
      }

      const messageContent = message.content?.trim() ? message.content : null;
      const mediaSourceMessageIds = hasLocalMedia ? [message.id] : undefined;

      // Merge consecutive messages from the same author (same as real context building)
      const prevMsg = simplifiedMessages[simplifiedMessages.length - 1];
      if (prevMsg && prevMsg.authorId === effectiveAuthorId && prevMsg.content && messageContent) {
        prevMsg.content += `\n${messageContent}`;
        if (imageAttachments.length > 0) prevMsg.imageAttachments.push(...imageAttachments);
        if (videoAttachments.length > 0) prevMsg.videoAttachments.push(...videoAttachments);
        if (mediaSourceMessageIds?.length) {
          prevMsg.mediaSourceMessageIds = [
            ...new Set([...(prevMsg.mediaSourceMessageIds ?? []), ...mediaSourceMessageIds]),
          ];
        }
      } else if (messageContent || imageAttachments.length > 0 || videoAttachments.length > 0) {
        simplifiedMessages.push({
          id: message.id,
          authorId: effectiveAuthorId,
          authorName,
          authorType,
          personaName,
          content: messageContent,
          mediaSourceMessageIds,
          imageAttachments,
          videoAttachments,
        });
      }

      userListSet.add(effectiveAuthorId);
    }

    if (client.user?.id) userListSet.add(client.user.id);

    const isDMChannel = !interaction.guildId;
    const channelName =
      "name" in textChannel && typeof textChannel.name === "string" ? textChannel.name : "unknown-channel";
    const channelDesc = "topic" in textChannel ? (textChannel.topic as string | null) : null;

    // 13. Assemble context using the selected persona — buildContext handles preset routing internally
    const contextBuild = await buildContext({
      guildId: interaction.guild.id,
      serverName: interaction.guild.name,
      serverDescription: interaction.guild.description || null,
      simplifiedMessageHistory: simplifiedMessages,
      userList: Array.from(userListSet),
      matrixUsers: new Map<string, string>(),
      syntheticUsers: new Map<string, { displayName: string; type: "persona" | "webhook" }>(),
      channelDesc,
      channelName,
      channelId: interaction.channelId,
      client,
      triggererName: interaction.user.displayName || interaction.user.globalName || interaction.user.username,
      tomoriNickname: selectedPersona.tomori_nickname ?? process.env.DEFAULT_BOTNAME ?? "Tomori",
      tomoriAttributes: selectedPersona.attribute_list,
      tomoriConfig: selectedPersona.config,
      personaPrompt: selectedPersona.persona_prompt ?? null,
      personaLineageId: selectedPersona.persona_lineage_id,
      isDMChannel,
      seesImages: selectedPersona.llm.sees_images,
      seesVideos: selectedPersona.llm.sees_videos,
    });

    const contextItems = contextBuild.contextItems;

    // 14. Retrieve the active preset name for the snapshot header
    const presetData = await getCachedActivePreset(selectedPersona.server_id);
    const presetName = presetData?.preset.preset_name ?? null;

    // 15. Resolve effective model (persona override takes priority over server LLM)
    const activeLlm = selectedPersona.persona_llm ?? selectedPersona.llm;
    const providerName = normalizeProviderName(activeLlm.llm_provider);
    const modelName = activeLlm.llm_codename;
    const timestamp = new Date().toISOString();

    // 16. Build snapshot file content
    let fileContent: string;
    let fileName: string;

    if (format === "json") {
      const snapshotData = await buildJsonSnapshot(
        contextItems,
        selectedPersona,
        providerName,
        modelName,
        interaction.guild.id,
        channelName,
        presetName,
        timestamp,
      );
      fileContent = JSON.stringify(snapshotData, null, 2);
      fileName = `prompt-snapshot-${interaction.channelId}-${selectedPersona.persona_lineage_id}-${Date.now()}.json`;
    } else {
      fileContent = buildTextSnapshot(
        contextItems,
        selectedPersona,
        providerName,
        modelName,
        interaction.guild.id,
        channelName,
        presetName,
        timestamp,
      );
      fileName = `prompt-snapshot-${interaction.channelId}-${selectedPersona.persona_lineage_id}-${Date.now()}.txt`;
    }

    // 17. Create the attachment buffer
    const attachment = new AttachmentBuilder(Buffer.from(fileContent, "utf-8"), { name: fileName });
    const formatLabel = format === "json" ? "JSON" : "Text";

    // 18. DM the file; fall back to ephemeral attachment if DMs are closed
    try {
      await interaction.user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(localizer(locale, "commands.tool.prompt.snapshot.dm_title"))
            .setDescription(
              localizer(locale, "commands.tool.prompt.snapshot.dm_description", {
                persona_name: selectedPersona.tomori_nickname,
                format: formatLabel,
              }),
            )
            .setColor(ColorCode.INFO),
        ],
        files: [attachment],
      });

      await modalInteraction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(localizer(locale, "commands.tool.prompt.snapshot.success_title"))
            .setDescription(localizer(locale, "commands.tool.prompt.snapshot.success_description"))
            .setColor(ColorCode.SUCCESS),
        ],
      });
    } catch (dmError) {
      log.warn(`Failed to DM prompt snapshot to user ${interaction.user.id}:`, dmError as Error);
      await modalInteraction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle(localizer(locale, "commands.tool.prompt.snapshot.dm_failed_title"))
            .setDescription(localizer(locale, "commands.tool.prompt.snapshot.dm_failed_description"))
            .setColor(ColorCode.WARN),
        ],
        files: [attachment],
      });
    }
  } catch (error) {
    log.error("Error executing /tool prompt snapshot:", error as Error, {
      errorType: "CommandExecutionError",
      metadata: { commandName: "tool prompt snapshot", guildId: interaction.guild?.id },
    });

    if (!interaction.replied && !interaction.deferred) {
      await replyInfoEmbed(interaction, locale, {
        titleKey: "general.errors.unknown_error_title",
        descriptionKey: "general.errors.unknown_error_description",
        color: ColorCode.ERROR,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

// ─── Text formatter ───────────────────────────────────────────────────────────

/**
 * Serializes `contextItems` (already rearranged by preset routing, if applicable) into
 * a human-readable flat-text format that mirrors the order produced by `buildContext`.
 */
function buildTextSnapshot(
  contextItems: StructuredContextItem[],
  persona: TomoriState,
  providerName: string,
  modelName: string,
  guildId: string,
  channelName: string,
  presetName: string | null,
  timestamp: string,
): string {
  const lines: string[] = [];

  lines.push("=== REQUEST SNAPSHOT ===");
  lines.push(`Server: ${guildId}  Channel: #${channelName}  Persona: ${persona.tomori_nickname}`);
  lines.push(`Provider: ${providerName}  Model: ${modelName}`);
  lines.push(`Preset: ${presetName ?? "(native)"}`);
  lines.push(`Captured: ${timestamp}`);
  lines.push("");

  for (const item of contextItems) {
    const tag = item.metadataTag ?? "untagged";
    lines.push(`--- [${tag}] ${item.role} ---`);

    for (const part of item.parts) {
      if (part.type === "text") {
        lines.push(part.text);
      } else if (part.type === "image") {
        // Estimate byte size from data URI length (base64 overhead ~1.33×)
        const byteEstimate = part.uri.startsWith("data:")
          ? Math.round(((part.uri.length - part.uri.indexOf(",") - 1) * 3) / 4)
          : 0;
        const sizeLabel = byteEstimate > 0 ? `~${byteEstimate} bytes` : "URL";
        lines.push(`[IMAGE: ${part.mimeType}, ${sizeLabel}, hidden]`);
      } else if (part.type === "video") {
        const ytSuffix = part.isYouTubeLink ? ", YouTube" : "";
        lines.push(`[VIDEO: ${part.mimeType}${ytSuffix}, hidden]`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

// ─── JSON formatter ───────────────────────────────────────────────────────────

/**
 * Produces a provider-specific JSON snapshot that matches the format emitted by
 * each adapter's `logSanitizedRequest` to terminal. Base64 image data is redacted
 * to keep file sizes manageable, matching the terminal log sanitization.
 *
 * Supported providers with full fidelity:
 *   - google / vertex   → GoogleStreamAdapter.buildTokenCountPayload
 *   - openrouter-family → OpenrouterStreamAdapter.buildProbeMessages
 *   - anthropic         → AnthropicStreamAdapter.buildProbeMessages
 *
 * All other providers fall back to a raw contextItems representation.
 */
async function buildJsonSnapshot(
  contextItems: StructuredContextItem[],
  persona: TomoriState,
  providerName: string,
  modelName: string,
  guildId: string,
  channelName: string,
  presetName: string | null,
  timestamp: string,
): Promise<Record<string, unknown>> {
  const activeLlm = persona.persona_llm ?? persona.llm;
  const seesImages = activeLlm.sees_images;
  const seesVideos = activeLlm.sees_videos;

  const metadata = {
    server_id: guildId,
    channel: `#${channelName}`,
    persona: persona.tomori_nickname,
    provider: providerName,
    model: modelName,
    preset: presetName ?? "(native)",
    captured: timestamp,
  };

  let requestData: Record<string, unknown>;

  if (providerName === "google" || providerName === "vertex") {
    // 1. Assemble context into Google Content[] format
    const adapter = new GoogleStreamAdapter();
    const payload = await adapter.buildTokenCountPayload(contextItems, modelName);

    // 2. Sanitize — replace inlineData.data (base64) with placeholder (mirrors logSanitizedRequest)
    const sanitizedContents = payload.contents.map((content) => ({
      ...content,
      // biome-ignore lint/suspicious/noExplicitAny: Google Part type lacks index signature; cast needed for sanitization
      parts: ((content.parts ?? []) as Array<any>).map((part: Record<string, unknown>) => {
        if ("inlineData" in part && part.inlineData) {
          const inlineData = part.inlineData as Record<string, unknown>;
          return { inlineData: { mimeType: inlineData.mimeType, data: "[BASE64_HIDDEN]" } };
        }
        return part;
      }),
    }));

    requestData = {
      model: modelName,
      systemInstruction: payload.systemInstruction,
      contents: sanitizedContents,
    };
  } else if (
    providerName === "openrouter" ||
    providerName === "deepseek" ||
    providerName === "zai" ||
    providerName === "zaicoding" ||
    providerName === "nvidia"
  ) {
    // 1. Assemble context into OpenAI-compatible messages format
    const adapter = new OpenrouterStreamAdapter();
    const messages = await adapter.buildProbeMessages(contextItems, seesImages, seesVideos);

    // 2. Sanitize — replace data-URI image_url values (mirrors logSanitizedRequest)
    const sanitized = messages.map((msg: Record<string, unknown>) => {
      if (!Array.isArray(msg.content)) return msg;
      return {
        ...msg,
        content: (msg.content as Array<Record<string, unknown>>).map((part) => {
          if (part.type === "image_url") {
            const imageUrl = (part as { image_url?: { url?: string } }).image_url;
            if (imageUrl?.url?.startsWith("data:")) {
              return { type: "image_url", image_url: { ...imageUrl, url: "[BASE64_HIDDEN]" } };
            }
          }
          return part;
        }),
      };
    });

    requestData = { model: modelName, messages: sanitized };
  } else if (providerName === "anthropic") {
    // 1. Assemble context into Anthropic system + messages format
    const adapter = new AnthropicStreamAdapter();
    const { system, messages } = await adapter.buildProbeMessages(contextItems, seesImages);

    // 2. Sanitize — replace base64 image source.data (mirrors logSanitizedRequest)
    const sanitizedMessages = messages.map((msg: Record<string, unknown>) => {
      const content = msg.content;
      if (typeof content === "string") return msg;
      const sanitizedContent = (content as Array<Record<string, unknown>>).map((block) => {
        if (
          block.type === "image" &&
          block.source &&
          typeof (block.source as Record<string, unknown>).data === "string"
        ) {
          return { ...block, source: { ...(block.source as Record<string, unknown>), data: "[BASE64_HIDDEN]" } };
        }
        return block;
      });
      return { ...msg, content: sanitizedContent };
    });

    requestData = { model: modelName, system, messages: sanitizedMessages };
  } else {
    // Fallback for providers without a public assembly method (novelai, custom, etc.)
    requestData = {
      _note: `Full JSON assembly not supported for provider "${providerName}". Raw context items shown instead.`,
      context_items: contextItems.map((item) => ({
        role: item.role,
        tag: item.metadataTag ?? null,
        parts: item.parts.map((part) => {
          if (part.type === "text") return { type: "text", text: part.text };
          return { type: part.type, mimeType: part.mimeType, uri: "[MEDIA_HIDDEN]" };
        }),
      })),
    };
  }

  return { metadata, request: requestData };
}
