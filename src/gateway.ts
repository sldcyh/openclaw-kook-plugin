import WebSocket from "ws";
import { getKookGatewayUrl, getKookSelf } from "./api.js";
import { resolveKookAccount } from "./config.js";
import { handleKookInboundEvent } from "./inbound.js";
import { shouldHandleKookEvent } from "./normalize.js";
import { patchKookState } from "./runtime.js";
import type {
  KookGatewayPacket,
  KookHelloPayload,
  KookMessageEvent,
  ResolvedKookAccount,
} from "./types.js";

const RECONNECT_DELAYS_MS = [2000, 4000, 8000, 16000, 30000];
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 6_000;

type MonitorContext = {
  account: ResolvedKookAccount;
  runtime: {
    config: {
      loadConfig: () => any;
    };
  };
  abortSignal: AbortSignal;
  setStatus: (patch: Record<string, unknown>) => void;
  log?: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
    debug?: (message: string) => void;
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function packetToString(data: WebSocket.RawData): string {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data.map((chunk) => Buffer.from(chunk))).toString("utf8");
  }
  return Buffer.from(data).toString("utf8");
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function monitorKookProvider(ctx: MonitorContext): Promise<void> {
  const accountId = ctx.account.accountId;
  const state = {
    sessionId: "",
    lastSn: 0,
    reconnectAttempts: 0,
    forceFreshGateway: false,
    selfUserId: ctx.account.config.botUserId ?? "",
  };

  patchKookState(accountId, {
    accountId,
    running: true,
    lastStartAt: Date.now(),
    lastError: null,
  });
  ctx.setStatus({
    running: true,
    lastStartAt: Date.now(),
    lastError: null,
  });

  try {
    const self = await getKookSelf({
      account: ctx.account,
      signal: AbortSignal.timeout(8000),
    });
    state.selfUserId = self.id;
    patchKookState(accountId, { bot: self });
    ctx.setStatus({
      bot: self,
    });
  } catch (error) {
    ctx.log?.warn?.(`[kook] initial self probe failed: ${stringifyError(error)}`);
  }

  while (!ctx.abortSignal.aborted) {
    const cfg = ctx.runtime.config.loadConfig();
    const account = resolveKookAccount({
      cfg,
      accountId,
    });

    if (!account.enabled) {
      ctx.log?.info?.(`[kook] account ${accountId} is disabled; stopping monitor`);
      break;
    }

    if (!account.token) {
      ctx.log?.warn?.(`[kook] account ${accountId} has no bot token; stopping monitor`);
      break;
    }

    try {
      await connectOnce({
        ctx,
        account,
        state,
      });
      state.reconnectAttempts = 0;
    } catch (error) {
      const message = stringifyError(error);
      patchKookState(accountId, {
        connected: false,
        lastError: message,
      });
      ctx.setStatus({
        connected: false,
        lastError: message,
      });
      ctx.log?.warn?.(`[kook] connection loop ended with error: ${message}`);

      if (message.startsWith("KOOK auth error:")) {
        break;
      }
    }

    if (ctx.abortSignal.aborted) {
      break;
    }

    state.reconnectAttempts += 1;
    patchKookState(accountId, {
      reconnectAttempts: state.reconnectAttempts,
    });
    ctx.setStatus({
      reconnectAttempts: state.reconnectAttempts,
    });

    const delay =
      RECONNECT_DELAYS_MS[Math.min(state.reconnectAttempts - 1, RECONNECT_DELAYS_MS.length - 1)];
    await sleep(delay);
  }

  patchKookState(accountId, {
    running: false,
    connected: false,
    lastStopAt: Date.now(),
  });
  ctx.setStatus({
    running: false,
    connected: false,
    lastStopAt: Date.now(),
  });
}

async function connectOnce(params: {
  ctx: MonitorContext;
  account: ResolvedKookAccount;
  state: {
    sessionId: string;
    lastSn: number;
    reconnectAttempts: number;
    forceFreshGateway: boolean;
    selfUserId: string;
  };
}): Promise<void> {
  const gatewayUrl = await getKookGatewayUrl({
    account: params.account,
    signal: AbortSignal.timeout(8000),
  });
  const url = new URL(gatewayUrl);

  if (!params.state.forceFreshGateway && params.state.sessionId) {
    url.searchParams.set("resume", "1");
    url.searchParams.set("sn", String(params.state.lastSn));
    url.searchParams.set("session_id", params.state.sessionId);
  }

  params.state.forceFreshGateway = false;

  await new Promise<void>((resolve, reject) => {
    let pingTimer: NodeJS.Timeout | undefined;
    let pongTimer: NodeJS.Timeout | undefined;
    let sawHello = false;
    let closedByAbort = false;
    const ws = new WebSocket(url, {
      handshakeTimeout: 10_000,
    });

    const cleanup = () => {
      if (pingTimer) {
        clearInterval(pingTimer);
      }
      if (pongTimer) {
        clearTimeout(pongTimer);
      }
      ws.removeAllListeners();
    };

    const closeForAbort = () => {
      closedByAbort = true;
      try {
        ws.close(1000, "abort");
      } catch {
        ws.terminate();
      }
    };

    params.ctx.abortSignal.addEventListener("abort", closeForAbort, { once: true });

    const startHeartbeat = () => {
      pingTimer = setInterval(() => {
        try {
          ws.send(
            JSON.stringify({
              s: 2,
              sn: params.state.lastSn,
            }),
          );
          if (pongTimer) {
            clearTimeout(pongTimer);
          }
          pongTimer = setTimeout(() => {
            params.ctx.log?.warn?.("[kook] heartbeat timeout; terminating socket");
            ws.terminate();
          }, PONG_TIMEOUT_MS);
        } catch (error) {
          params.ctx.log?.warn?.(`[kook] failed to send heartbeat: ${stringifyError(error)}`);
          ws.terminate();
        }
      }, PING_INTERVAL_MS);
    };

    ws.on("open", () => {
      startHeartbeat();
      patchKookState(params.account.accountId, {
        running: true,
      });
      params.ctx.setStatus({
        running: true,
      });
    });

    ws.on("message", (raw) => {
      let packet: KookGatewayPacket;
      try {
        packet = JSON.parse(packetToString(raw)) as KookGatewayPacket;
      } catch (error) {
        params.ctx.log?.warn?.(`[kook] failed to parse gateway packet: ${stringifyError(error)}`);
        return;
      }

      switch (packet.s) {
        case 1: {
          const hello = packet.d as KookHelloPayload;
          if (hello.code !== 0) {
            cleanup();
            reject(new Error(`KOOK auth error: hello code ${hello.code}`));
            return;
          }
          sawHello = true;
          params.state.sessionId = hello.session_id ?? params.state.sessionId;
          patchKookState(params.account.accountId, {
            connected: true,
            lastConnectedAt: Date.now(),
            reconnectAttempts: 0,
            lastError: null,
          });
          params.ctx.setStatus({
            connected: true,
            lastConnectedAt: Date.now(),
            reconnectAttempts: 0,
            lastError: null,
          });
          return;
        }
        case 0: {
          if (typeof packet.sn === "number" && packet.sn > params.state.lastSn) {
            params.state.lastSn = packet.sn;
          }
          patchKookState(params.account.accountId, {
            lastEventAt: Date.now(),
          });
          params.ctx.setStatus({
            lastEventAt: Date.now(),
          });

          const event = packet.d as KookMessageEvent;
          if (
            shouldHandleKookEvent({
              event,
              account: params.account,
              selfUserId: params.state.selfUserId || params.account.config.botUserId,
            })
          ) {
            patchKookState(params.account.accountId, {
              lastInboundAt: Date.now(),
            });
            params.ctx.setStatus({
              lastInboundAt: Date.now(),
            });
            void handleKookInboundEvent({
              event,
              account: {
                ...params.account,
                config: {
                  ...params.account.config,
                  botUserId:
                    params.account.config.botUserId ?? params.state.selfUserId ?? undefined,
                },
              },
              log: params.ctx.log,
            }).catch((error) => {
              params.ctx.log?.error?.(`[kook] inbound dispatch failed: ${stringifyError(error)}`);
            });
          }
          return;
        }
        case 3: {
          if (pongTimer) {
            clearTimeout(pongTimer);
            pongTimer = undefined;
          }
          return;
        }
        case 5: {
          params.ctx.log?.info?.("[kook] gateway requested reconnect");
          params.state.sessionId = "";
          params.state.lastSn = 0;
          params.state.forceFreshGateway = true;
          ws.close(1012, "reconnect");
          return;
        }
        case 6: {
          patchKookState(params.account.accountId, {
            connected: true,
            lastEventAt: Date.now(),
          });
          params.ctx.setStatus({
            connected: true,
            lastEventAt: Date.now(),
          });
          return;
        }
        default:
          return;
      }
    });

    ws.on("error", (error) => {
      patchKookState(params.account.accountId, {
        lastError: stringifyError(error),
      });
      params.ctx.setStatus({
        lastError: stringifyError(error),
      });
    });

    ws.on("close", (code, reasonBuffer) => {
      const reason = reasonBuffer.toString();
      cleanup();
      patchKookState(params.account.accountId, {
        connected: false,
        lastDisconnect: {
          at: Date.now(),
          status: code,
          error: reason || undefined,
        },
      });
      params.ctx.setStatus({
        connected: false,
        lastDisconnect: {
          at: Date.now(),
          status: code,
          error: reason || undefined,
        },
      });

      if (closedByAbort || params.ctx.abortSignal.aborted) {
        resolve();
        return;
      }

      if (!sawHello) {
        reject(new Error(`KOOK gateway closed before hello (${code}${reason ? `: ${reason}` : ""})`));
        return;
      }

      resolve();
    });
  });
}

