import type { KookMessageEvent, KookOutboundTarget, ResolvedKookAccount } from "./types.js";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseKookOutboundTarget(raw: string): KookOutboundTarget {
  const value = raw.trim();

  if (value.startsWith("user:")) {
    const userId = value.slice("user:".length).trim();
    if (!userId) {
      throw new Error("KOOK target `user:` requires a user id.");
    }
    return { kind: "user", userId };
  }

  if (value.startsWith("chat:")) {
    const chatCode = value.slice("chat:".length).trim();
    if (!chatCode) {
      throw new Error("KOOK target `chat:` requires a chat code.");
    }
    return { kind: "chat", chatCode };
  }

  if (value.startsWith("channel:")) {
    const channelId = value.slice("channel:".length).trim();
    if (!channelId) {
      throw new Error("KOOK target `channel:` requires a channel id.");
    }
    return { kind: "channel", channelId };
  }

  throw new Error("KOOK target must use `user:`, `chat:`, or `channel:`.");
}

export function looksLikeKookTarget(value: string): boolean {
  return /^(user|chat|channel):/i.test(value.trim());
}

export function normalizeKookMessagingTarget(value: string): string {
  return value.trim();
}

export function normalizeKookOutboundTarget(value: string): string {
  return normalizeKookMessagingTarget(value);
}

export function getKookChatType(event: KookMessageEvent): "direct" | "channel" {
  return event.channel_type === "PERSON" ? "direct" : "channel";
}

export function isSupportedKookInboundMessage(event: KookMessageEvent): boolean {
  return [1, 2, 3, 4, 8, 9, 10].includes(event.type);
}

export function isSelfKookMessage(
  event: KookMessageEvent,
  selfUserId: string | undefined,
): boolean {
  if (!selfUserId) {
    return false;
  }

  return event.author_id === selfUserId;
}

export function hasBotMention(
  event: KookMessageEvent,
  selfUserId: string | undefined,
): boolean {
  if (!selfUserId) {
    return false;
  }

  if (event.extra?.mention?.includes(selfUserId)) {
    return true;
  }

  return readText(event.content).includes(`(met)${selfUserId}(met)`);
}

export function normalizeKookInboundText(
  event: KookMessageEvent,
  selfUserId: string | undefined,
): string {
  const raw = readText(event.content);

  let text = raw;
  if (selfUserId) {
    const selfMention = new RegExp(`\\(met\\)${escapeRegex(selfUserId)}\\(met\\)`, "g");
    text = text.replace(selfMention, "").trim();
  }

  switch (event.type) {
    case 1:
    case 9:
      return text || raw.trim();
    case 2:
      return `[Image] ${raw}`.trim();
    case 3:
      return `[Video] ${raw}`.trim();
    case 4:
      return `[File] ${raw}`.trim();
    case 8:
      return `[Audio] ${raw}`.trim();
    case 10:
      return `[Card]\n${raw}`.trim();
    default:
      return raw.trim();
  }
}

export function shouldHandleKookEvent(params: {
  event: KookMessageEvent;
  account: ResolvedKookAccount;
  selfUserId?: string;
}): boolean {
  const { event, account, selfUserId } = params;

  if (!isSupportedKookInboundMessage(event)) {
    return false;
  }

  if (event.type === 255) {
    return false;
  }

  if (event.extra?.author?.bot === true || isSelfKookMessage(event, selfUserId)) {
    return false;
  }

  if (getKookChatType(event) === "direct") {
    return true;
  }

  const normalized = normalizeKookInboundText(event, selfUserId).trim();
  const mentioned = hasBotMention(event, selfUserId);

  if (account.config.chatmode === "onmessage") {
    return true;
  }

  if (mentioned) {
    return true;
  }

  if (account.config.chatmode === "onchar") {
    return account.config.oncharPrefixes.some((prefix) => normalized.startsWith(prefix));
  }

  if (account.config.requireMention) {
    return false;
  }

  return false;
}

export function buildKookReplyText(payload: {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
}): string {
  const parts: string[] = [];

  if (typeof payload.text === "string" && payload.text.trim()) {
    parts.push(payload.text.trim());
  }

  if (typeof payload.mediaUrl === "string" && payload.mediaUrl.trim()) {
    parts.push(payload.mediaUrl.trim());
  }

  if (Array.isArray(payload.mediaUrls)) {
    for (const item of payload.mediaUrls) {
      if (typeof item === "string" && item.trim()) {
        parts.push(item.trim());
      }
    }
  }

  return parts.join("\n\n").trim();
}

