import type { ChannelPlugin } from "openclaw/plugin-sdk";
import { probeKookAccount, sendKookText } from "./api.js";
import {
  applyKookAccountConfig,
  applyKookAccountName,
  buildKookChannelSchema,
  DEFAULT_ACCOUNT_ID,
  deleteKookAccount,
  listKookAccountIds,
  normalizeAccountId,
  resolveDefaultKookAccountId,
  resolveKookAccount,
  setKookAccountEnabled,
  validateKookSetupInput,
} from "./config.js";
import { monitorKookProvider } from "./gateway.js";
import { looksLikeKookTarget, normalizeKookMessagingTarget, normalizeKookOutboundTarget } from "./normalize.js";
import { getKookState } from "./runtime.js";
import type { KookProbeResult, ResolvedKookAccount } from "./types.js";

const meta = {
  id: "kook",
  label: "KOOK",
  selectionLabel: "KOOK (plugin)",
  detailLabel: "KOOK Bot",
  docsPath: "/channels/kook",
  docsLabel: "kook",
  blurb: "KOOK bot plugin with WebSocket event handling.",
  aliases: ["kaiheila", "开黑啦"] as string[],
  order: 62,
};

const channelSchema = buildKookChannelSchema();

export const kookPlugin: ChannelPlugin<ResolvedKookAccount, KookProbeResult> = {
  id: "kook",
  meta: {
    ...meta,
  },
  capabilities: {
    chatTypes: ["direct", "channel"],
    media: false,
    reply: true,
    blockStreaming: true,
    nativeCommands: false,
    reactions: false,
    threads: false,
  },
  reload: {
    configPrefixes: ["channels.kook"],
  },
  configSchema: {
    schema: channelSchema.schema,
    uiHints: channelSchema.uiHints,
  },
  config: {
    listAccountIds: (cfg) => listKookAccountIds(cfg),
    resolveAccount: (cfg, accountId) =>
      resolveKookAccount({
        cfg,
        accountId,
      }),
    defaultAccountId: (cfg) => resolveDefaultKookAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setKookAccountEnabled({
        cfg,
        accountId,
        enabled,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteKookAccount({
        cfg,
        accountId,
      }),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      tokenSource: account.tokenSource,
      allowUnmentionedGroups: account.config.chatmode === "onmessage",
    }),
    resolveDefaultTo: ({ cfg, accountId }) =>
      resolveKookAccount({
        cfg,
        accountId,
      }).config.defaultTo,
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyKookAccountName({
        cfg,
        accountId,
        name,
      }),
    applyAccountConfig: ({ cfg, accountId, input }) =>
      applyKookAccountConfig({
        cfg,
        accountId,
        input: {
          name: input.name,
          token: input.token ?? input.botToken,
          useEnv: input.useEnv,
        },
      }),
    validateInput: ({ accountId, input }) =>
      validateKookSetupInput({
        accountId,
        input: {
          token: input.token ?? input.botToken,
          useEnv: input.useEnv,
        },
      }),
  },
  mentions: {
    stripPatterns: () => [
      "\\(met\\)\\d+\\(met\\)",
      "\\(met\\)all\\(met\\)",
      "\\(met\\)here\\(met\\)",
      "\\(rol\\)\\d+\\(rol\\)",
    ],
  },
  messaging: {
    normalizeTarget: normalizeKookMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeKookTarget,
      hint: "<user:ID|channel:ID|chat:CODE>",
    },
  },
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 1800,
    resolveTarget: ({ to }) => {
      try {
        return {
          ok: true as const,
          to: normalizeKookOutboundTarget(to ?? ""),
        };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },
    sendText: async ({ cfg, to, text, accountId, replyToId }) => {
      const account = resolveKookAccount({
        cfg,
        accountId,
      });

      const result = await sendKookText({
        account,
        to,
        text,
        quote: replyToId ?? undefined,
      });

      return result;
    },
    sendMedia: async ({ cfg, to, text, mediaUrl, accountId, replyToId }) => {
      const account = resolveKookAccount({
        cfg,
        accountId,
      });
      const pieces = [text, mediaUrl].filter((entry) => typeof entry === "string" && entry.trim());
      const result = await sendKookText({
        account,
        to,
        text: pieces.join("\n\n"),
        quote: replyToId ?? undefined,
      });

      return result;
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      reconnectAttempts: 0,
      lastConnectedAt: null,
      lastDisconnect: null,
      lastEventAt: null,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    probeAccount: async ({ account, timeoutMs }) =>
      await probeKookAccount({
        account,
        timeoutMs,
      }),
    buildAccountSnapshot: ({ account, runtime, probe }) => {
      const fallbackRuntime = getKookState(account.accountId);
      const live = {
        ...fallbackRuntime,
        ...(runtime ?? {}),
      } as Record<string, unknown>;
      const liveBot = (live.bot as Record<string, unknown> | undefined) ?? probe?.self;

      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured: account.configured,
        running: Boolean(live.running),
        connected: Boolean(live.connected),
        reconnectAttempts:
          typeof live.reconnectAttempts === "number" ? live.reconnectAttempts : 0,
        lastConnectedAt:
          typeof live.lastConnectedAt === "number" ? live.lastConnectedAt : null,
        lastDisconnect:
          live.lastDisconnect && typeof live.lastDisconnect === "object"
            ? (live.lastDisconnect as { at: number; status?: number; error?: string })
            : null,
        lastEventAt: typeof live.lastEventAt === "number" ? live.lastEventAt : null,
        lastInboundAt: typeof live.lastInboundAt === "number" ? live.lastInboundAt : null,
        lastOutboundAt:
          typeof live.lastOutboundAt === "number" ? live.lastOutboundAt : null,
        lastStartAt: typeof live.lastStartAt === "number" ? live.lastStartAt : null,
        lastStopAt: typeof live.lastStopAt === "number" ? live.lastStopAt : null,
        lastError: typeof live.lastError === "string" ? live.lastError : null,
        tokenSource: account.tokenSource,
        bot: liveBot,
        probe,
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = resolveKookAccount({
        cfg: ctx.cfg,
        accountId: ctx.account.accountId,
      });
      ctx.log?.info?.(`[kook] starting account ${account.accountId}`);
      await monitorKookProvider({
        account,
        runtime: {
          config: {
            loadConfig: () => ctx.cfg,
          },
        },
        abortSignal: ctx.abortSignal,
        setStatus: (patch) =>
          ctx.setStatus({
            accountId: account.accountId,
            ...patch,
          }),
        log: ctx.log,
      });
    },
  },
};
