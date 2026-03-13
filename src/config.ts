import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type {
  KookAccountConfig,
  KookChatMode,
  KookConfig,
  KookOutboundFormat,
  ResolvedKookAccount,
} from "./types.js";

export const DEFAULT_ACCOUNT_ID = "default";

const DEFAULT_CHATMODE: KookChatMode = "oncall";
const DEFAULT_OUTBOUND_FORMAT: KookOutboundFormat = "text";

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeChatmode(value: unknown): KookChatMode {
  return value === "onmessage" || value === "onchar" ? value : DEFAULT_CHATMODE;
}

function normalizeOutboundFormat(value: unknown): KookOutboundFormat {
  return value === "kmarkdown" ? value : DEFAULT_OUTBOUND_FORMAT;
}

function normalizeGatewayCompress(value: unknown): 0 | 1 {
  return value === 1 ? 1 : 0;
}

function getKookConfig(cfg: OpenClawConfig): KookConfig {
  return ((cfg.channels as Record<string, unknown> | undefined)?.kook ?? {}) as KookConfig;
}

export function normalizeAccountId(accountId?: string | null): string {
  return readString(accountId) ?? DEFAULT_ACCOUNT_ID;
}

export function listKookAccountIds(cfg: OpenClawConfig): string[] {
  const kook = getKookConfig(cfg);
  const ids = new Set<string>();

  if (
    kook.enabled !== undefined ||
    readString(kook.token) ||
    readString(kook.defaultTo) ||
    readString(kook.botUserId) ||
    kook.chatmode !== undefined
  ) {
    ids.add(DEFAULT_ACCOUNT_ID);
  }

  for (const key of Object.keys(kook.accounts ?? {})) {
    ids.add(key);
  }

  if (ids.size === 0) {
    ids.add(DEFAULT_ACCOUNT_ID);
  }

  return [...ids];
}

export function resolveDefaultKookAccountId(cfg: OpenClawConfig): string {
  const configured = readString(getKookConfig(cfg).defaultAccount);
  return configured ?? DEFAULT_ACCOUNT_ID;
}

export function resolveKookAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedKookAccount {
  const accountId = normalizeAccountId(params.accountId);
  const kook = getKookConfig(params.cfg);
  const named =
    accountId === DEFAULT_ACCOUNT_ID
      ? undefined
      : ((kook.accounts ?? {})[accountId] as KookAccountConfig | undefined);

  const token =
    readString(named?.token) ??
    (accountId === DEFAULT_ACCOUNT_ID ? readString(kook.token) : undefined) ??
    (accountId === DEFAULT_ACCOUNT_ID ? readString(process.env.KOOK_BOT_TOKEN) : undefined);

  const tokenSource =
    readString(named?.token) || (accountId === DEFAULT_ACCOUNT_ID && readString(kook.token))
      ? "config"
      : token
        ? "env"
        : undefined;

  return {
    accountId,
    enabled:
      typeof named?.enabled === "boolean"
        ? named.enabled
        : accountId === DEFAULT_ACCOUNT_ID
          ? readBoolean(kook.enabled, false)
          : true,
    configured: Boolean(token),
    name: readString(named?.name) ?? (accountId === DEFAULT_ACCOUNT_ID ? readString(kook.name) : undefined),
    token,
    tokenSource,
    config: {
      defaultTo:
        readString(named?.defaultTo) ??
        (accountId === DEFAULT_ACCOUNT_ID ? readString(kook.defaultTo) : readString(kook.defaultTo)),
      botUserId:
        readString(named?.botUserId) ??
        (accountId === DEFAULT_ACCOUNT_ID ? readString(kook.botUserId) : readString(kook.botUserId)),
      chatmode: normalizeChatmode(named?.chatmode ?? kook.chatmode),
      requireMention: readBoolean(named?.requireMention ?? kook.requireMention, true),
      oncharPrefixes: readStringArray(named?.oncharPrefixes ?? kook.oncharPrefixes),
      outboundFormat: normalizeOutboundFormat(named?.outboundFormat ?? kook.outboundFormat),
      gatewayCompress: normalizeGatewayCompress(named?.gatewayCompress ?? kook.gatewayCompress),
    },
  };
}

export function setKookAccountEnabled(params: {
  cfg: OpenClawConfig;
  accountId: string;
  enabled: boolean;
}): OpenClawConfig {
  const accountId = normalizeAccountId(params.accountId);
  const kook = getKookConfig(params.cfg);

  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...params.cfg,
      channels: {
        ...params.cfg.channels,
        kook: {
          ...kook,
          enabled: params.enabled,
        },
      },
    };
  }

  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      kook: {
        ...kook,
        accounts: {
          ...kook.accounts,
          [accountId]: {
            ...(kook.accounts?.[accountId] ?? {}),
            enabled: params.enabled,
          },
        },
      },
    },
  };
}

export function deleteKookAccount(params: {
  cfg: OpenClawConfig;
  accountId: string;
}): OpenClawConfig {
  const accountId = normalizeAccountId(params.accountId);
  const kook = getKookConfig(params.cfg);

  if (accountId === DEFAULT_ACCOUNT_ID) {
    const nextChannels = { ...(params.cfg.channels ?? {}) } as Record<string, unknown>;
    delete nextChannels.kook;
    return {
      ...params.cfg,
      channels: nextChannels,
    };
  }

  const accounts = { ...(kook.accounts ?? {}) };
  delete accounts[accountId];
  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      kook: {
        ...kook,
        accounts: Object.keys(accounts).length > 0 ? accounts : undefined,
      },
    },
  };
}

export function applyKookAccountName(params: {
  cfg: OpenClawConfig;
  accountId: string;
  name?: string;
}): OpenClawConfig {
  const accountId = normalizeAccountId(params.accountId);
  const kook = getKookConfig(params.cfg);
  const name = readString(params.name);

  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...params.cfg,
      channels: {
        ...params.cfg.channels,
        kook: {
          ...kook,
          ...(name ? { name } : {}),
        },
      },
    };
  }

  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      kook: {
        ...kook,
        accounts: {
          ...kook.accounts,
          [accountId]: {
            ...(kook.accounts?.[accountId] ?? {}),
            ...(name ? { name } : {}),
          },
        },
      },
    },
  };
}

export function validateKookSetupInput(params: {
  accountId: string;
  input: {
    token?: string;
    useEnv?: boolean;
  };
}): string | null {
  const accountId = normalizeAccountId(params.accountId);

  if (params.input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
    return "KOOK_BOT_TOKEN can only be used for the default account.";
  }

  if (!params.input.useEnv && !readString(params.input.token)) {
    return "KOOK requires a bot token (or --use-env for the default account).";
  }

  return null;
}

export function applyKookAccountConfig(params: {
  cfg: OpenClawConfig;
  accountId: string;
  input: {
    name?: string;
    token?: string;
    useEnv?: boolean;
  };
}): OpenClawConfig {
  const accountId = normalizeAccountId(params.accountId);
  const token = readString(params.input.token);
  const named = applyKookAccountName({
    cfg: params.cfg,
    accountId,
    name: params.input.name,
  });
  const kook = getKookConfig(named);

  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...named,
      channels: {
        ...named.channels,
        kook: {
          ...kook,
          enabled: true,
          ...(params.input.useEnv ? {} : token ? { token } : {}),
        },
      },
    };
  }

  return {
    ...named,
    channels: {
      ...named.channels,
      kook: {
        ...kook,
        enabled: true,
        accounts: {
          ...kook.accounts,
          [accountId]: {
            ...(kook.accounts?.[accountId] ?? {}),
            enabled: true,
            ...(token ? { token } : {}),
          },
        },
      },
    },
  };
}

export function buildKookChannelSchema(): {
  schema: Record<string, unknown>;
  uiHints: Record<string, Record<string, unknown>>;
} {
  const accountProperties = {
    enabled: { type: "boolean" },
    name: { type: "string" },
    token: { type: "string" },
    botUserId: { type: "string" },
    defaultTo: { type: "string" },
    chatmode: { type: "string", enum: ["oncall", "onmessage", "onchar"] },
    requireMention: { type: "boolean" },
    oncharPrefixes: { type: "array", items: { type: "string" } },
    outboundFormat: { type: "string", enum: ["text", "kmarkdown"] },
    gatewayCompress: { type: "integer", enum: [0, 1] },
  };

  return {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        defaultAccount: { type: "string" },
        name: { type: "string" },
        token: { type: "string" },
        botUserId: { type: "string" },
        defaultTo: { type: "string" },
        chatmode: { type: "string", enum: ["oncall", "onmessage", "onchar"] },
        requireMention: { type: "boolean" },
        oncharPrefixes: { type: "array", items: { type: "string" } },
        outboundFormat: { type: "string", enum: ["text", "kmarkdown"] },
        gatewayCompress: { type: "integer", enum: [0, 1] },
        accounts: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: false,
            properties: accountProperties,
          },
        },
      },
    },
    uiHints: {
      token: {
        label: "Bot Token",
        sensitive: true,
      },
      botUserId: {
        label: "Bot User ID",
        help: "Optional. Helpful for mention matching before the first successful probe.",
      },
      chatmode: {
        help: "`oncall` replies only when mentioned in channels. `onmessage` replies to all channel messages. `onchar` replies when a prefix matches.",
      },
      oncharPrefixes: {
        help: "Used when chatmode is `onchar`.",
      },
      outboundFormat: {
        help: "`text` is safest for MVP. `kmarkdown` is more capable but less compatible with arbitrary Markdown output.",
      },
    },
  };
}

