import { getKookRuntime } from "./runtime.js";
import { getKookChatType, normalizeKookInboundText } from "./normalize.js";
import type { KookMessageEvent, ResolvedKookAccount } from "./types.js";

export function buildKookMessageContext(params: {
  event: KookMessageEvent;
  account: ResolvedKookAccount;
}) {
  const runtime = getKookRuntime();
  const cfg = runtime.config.loadConfig();
  const chatType = getKookChatType(params.event);
  const senderName =
    params.event.extra?.author?.nickname ||
    params.event.extra?.author?.username ||
    params.event.author_id;

  const route = runtime.channel.routing.resolveAgentRoute({
    cfg,
    channel: "kook",
    accountId: params.account.accountId,
    peer: {
      kind: chatType,
      id: chatType === "direct" ? params.event.author_id : params.event.target_id,
    },
    guildId: typeof params.event.extra?.guild_id === "string" ? params.event.extra.guild_id : undefined,
  });

  const sessionKey =
    chatType === "direct"
      ? `agent:${route.agentId}:kook:direct:${params.event.author_id}`
      : `agent:${route.agentId}:kook:channel:${params.event.target_id}:user:${params.event.author_id}`;

  const storePath = runtime.channel.session.resolveStorePath(cfg.session?.store, {
    agentId: route.agentId,
  });
  const previousTimestamp = runtime.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey,
  });
  const normalizedText = normalizeKookInboundText(params.event, params.account.config.botUserId);

  const body = runtime.channel.reply.formatInboundEnvelope({
    channel: "kook",
    from: senderName,
    timestamp: params.event.msg_timestamp || Date.now(),
    body: normalizedText,
    chatType,
    sender: {
      id: params.event.author_id,
      name: senderName,
    },
    previousTimestamp,
    envelope: runtime.channel.reply.resolveEnvelopeFormatOptions(cfg),
  });

  const ctx = runtime.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: params.event.content,
    CommandBody: normalizedText,
    From: `kook:${params.event.author_id}`,
    To:
      chatType === "direct"
        ? `kook:user:${params.event.author_id}`
        : `kook:channel:${params.event.target_id}`,
    SessionKey: sessionKey,
    AccountId: route.accountId,
    ChatType: chatType,
    Provider: "kook",
    Surface: "kook",
    SenderId: params.event.author_id,
    SenderName: senderName,
    GroupId: chatType === "channel" ? params.event.extra?.guild_id : undefined,
    GroupChannel:
      chatType === "channel"
        ? params.event.extra?.channel_name ?? `channel:${params.event.target_id}`
        : undefined,
    MessageSid: params.event.msg_id,
    Timestamp: params.event.msg_timestamp || Date.now(),
    OriginatingChannel: "kook",
    OriginatingTo:
      chatType === "direct"
        ? `kook:user:${params.event.author_id}`
        : `kook:channel:${params.event.target_id}`,
    ChannelSource: "kook",
  });

  return {
    cfg,
    ctx,
    storePath,
    route: {
      ...route,
      sessionKey,
    },
    replyTarget:
      chatType === "direct" ? `user:${params.event.author_id}` : `channel:${params.event.target_id}`,
    replyQuote: params.event.msg_id,
  };
}

