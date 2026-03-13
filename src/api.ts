import { randomUUID } from "node:crypto";
import type {
  KookOutboundTarget,
  KookProbeResult,
  KookSelf,
  ResolvedKookAccount,
} from "./types.js";
import { parseKookOutboundTarget } from "./normalize.js";

const KOOK_API_BASE = "https://www.kookapp.cn/api/v3";

type KookApiEnvelope<T> = {
  code: number;
  message: string;
  data: T;
};

function requireToken(account: ResolvedKookAccount): string {
  if (!account.token?.trim()) {
    throw new Error(`KOOK account ${account.accountId} is missing a bot token.`);
  }

  return account.token.trim();
}

async function requestKookApi<T>(params: {
  account: ResolvedKookAccount;
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<T> {
  const token = requireToken(params.account);
  const url = new URL(`${KOOK_API_BASE}${params.path}`);

  for (const [key, value] of Object.entries(params.query ?? {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: params.method ?? "GET",
    headers: {
      Authorization: `Bot ${token}`,
      Accept: "application/json",
      ...(params.body ? { "Content-Type": "application/json" } : {}),
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
    signal: params.signal,
  });

  let json: KookApiEnvelope<T> | null = null;
  try {
    json = (await response.json()) as KookApiEnvelope<T>;
  } catch {
    throw new Error(`KOOK API ${params.path} returned non-JSON response (${response.status}).`);
  }

  if (!response.ok || !json || json.code !== 0) {
    throw new Error(
      `KOOK API ${params.path} failed: ${json?.message ?? response.statusText} (${json?.code ?? response.status})`,
    );
  }

  return json.data;
}

export async function getKookGatewayUrl(params: {
  account: ResolvedKookAccount;
  signal?: AbortSignal;
}): Promise<string> {
  const data = await requestKookApi<{ url: string }>({
    account: params.account,
    path: "/gateway/index",
    query: {
      compress: params.account.config.gatewayCompress,
    },
    signal: params.signal,
  });

  return data.url;
}

export async function getKookSelf(params: {
  account: ResolvedKookAccount;
  signal?: AbortSignal;
}): Promise<KookSelf> {
  return await requestKookApi<KookSelf>({
    account: params.account,
    path: "/user/me",
    signal: params.signal,
  });
}

function resolveMessageType(account: ResolvedKookAccount): 1 | 9 {
  return account.config.outboundFormat === "kmarkdown" ? 9 : 1;
}

async function createChannelMessage(params: {
  account: ResolvedKookAccount;
  target: Extract<KookOutboundTarget, { kind: "channel" }>;
  content: string;
  quote?: string;
  signal?: AbortSignal;
}): Promise<{ messageId: string }> {
  const data = await requestKookApi<{ msg_id?: string; id?: string }>({
    account: params.account,
    path: "/message/create",
    method: "POST",
    body: {
      type: resolveMessageType(params.account),
      target_id: params.target.channelId,
      content: params.content,
      quote: params.quote,
      nonce: randomUUID(),
    },
    signal: params.signal,
  });

  return {
    messageId: data.msg_id ?? data.id ?? "",
  };
}

async function createDirectMessage(params: {
  account: ResolvedKookAccount;
  target: Extract<KookOutboundTarget, { kind: "user" | "chat" }>;
  content: string;
  quote?: string;
  signal?: AbortSignal;
}): Promise<{ messageId: string }> {
  const data = await requestKookApi<{ msg_id?: string; id?: string }>({
    account: params.account,
    path: "/direct-message/create",
    method: "POST",
    body: {
      type: resolveMessageType(params.account),
      ...(params.target.kind === "user"
        ? { target_id: params.target.userId }
        : { chat_code: params.target.chatCode }),
      content: params.content,
      quote: params.quote,
      nonce: randomUUID(),
    },
    signal: params.signal,
  });

  return {
    messageId: data.msg_id ?? data.id ?? "",
  };
}

export async function sendKookText(params: {
  account: ResolvedKookAccount;
  to: string;
  text: string;
  quote?: string;
  signal?: AbortSignal;
}): Promise<{
  ok: true;
  channel: "kook";
  target: string;
  messageId: string;
}> {
  const target = parseKookOutboundTarget(params.to);
  const text = params.text.trim();

  if (!text) {
    throw new Error("KOOK sendText requires non-empty text.");
  }

  const result =
    target.kind === "channel"
      ? await createChannelMessage({
          account: params.account,
          target,
          content: text,
          quote: params.quote,
          signal: params.signal,
        })
      : await createDirectMessage({
          account: params.account,
          target,
          content: text,
          quote: params.quote,
          signal: params.signal,
        });

  return {
    ok: true,
    channel: "kook",
    target: params.to,
    messageId: result.messageId,
  };
}

export async function probeKookAccount(params: {
  account: ResolvedKookAccount;
  timeoutMs?: number;
}): Promise<KookProbeResult> {
  const startedAt = Date.now();

  try {
    const signal =
      typeof params.timeoutMs === "number" && params.timeoutMs > 0
        ? AbortSignal.timeout(params.timeoutMs)
        : undefined;

    const self = await getKookSelf({
      account: params.account,
      signal,
    });

    return {
      ok: true,
      elapsedMs: Date.now() - startedAt,
      self,
    };
  } catch (error) {
    return {
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

