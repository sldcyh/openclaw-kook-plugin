export type KookChatMode = "oncall" | "onmessage" | "onchar";

export type KookOutboundFormat = "text" | "kmarkdown";

export type KookAccountConfig = {
  enabled?: boolean;
  name?: string;
  token?: string;
  botUserId?: string;
  defaultTo?: string;
  chatmode?: KookChatMode;
  requireMention?: boolean;
  oncharPrefixes?: string[];
  outboundFormat?: KookOutboundFormat;
  gatewayCompress?: 0 | 1;
};

export type KookConfig = KookAccountConfig & {
  defaultAccount?: string;
  accounts?: Record<string, KookAccountConfig>;
};

export type ResolvedKookAccountConfig = {
  defaultTo?: string;
  botUserId?: string;
  chatmode: KookChatMode;
  requireMention: boolean;
  oncharPrefixes: string[];
  outboundFormat: KookOutboundFormat;
  gatewayCompress: 0 | 1;
};

export type ResolvedKookAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
  token?: string;
  tokenSource?: "config" | "env";
  config: ResolvedKookAccountConfig;
};

export type KookSelf = {
  id: string;
  username?: string;
  nickname?: string;
  identify_num?: string;
  bot?: boolean;
  client_id?: string;
};

export type KookProbeResult = {
  ok: boolean;
  elapsedMs: number;
  self?: KookSelf;
  error?: string;
};

export type KookGatewayPacket<T = unknown> = {
  s: number;
  d: T;
  sn?: number;
};

export type KookHelloPayload = {
  code: number;
  session_id?: string;
};

export type KookMessageExtraAuthor = {
  id?: string;
  username?: string;
  nickname?: string;
  bot?: boolean;
};

export type KookMessageExtra = {
  type?: number;
  guild_id?: string;
  channel_name?: string;
  mention?: string[];
  mention_all?: boolean;
  mention_roles?: string[];
  mention_here?: boolean;
  author?: KookMessageExtraAuthor;
  [key: string]: unknown;
};

export type KookMessageEvent = {
  channel_type: string;
  type: number;
  target_id: string;
  author_id: string;
  content: string;
  msg_id: string;
  msg_timestamp: number;
  nonce?: string;
  extra?: KookMessageExtra;
};

export type KookOutboundTarget =
  | { kind: "channel"; channelId: string }
  | { kind: "user"; userId: string }
  | { kind: "chat"; chatCode: string };

export type KookRuntimeState = {
  accountId: string;
  running: boolean;
  connected: boolean;
  reconnectAttempts: number;
  lastConnectedAt: number | null;
  lastDisconnect: { at: number; status?: number; error?: string } | null;
  lastEventAt: number | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
  lastError: string | null;
  lastStartAt: number | null;
  lastStopAt: number | null;
  bot?: KookSelf;
};

