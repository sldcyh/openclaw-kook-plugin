import type { PluginRuntime } from "openclaw/plugin-sdk";
import type { KookRuntimeState } from "./types.js";

let runtime: PluginRuntime | null = null;

const accountStates = new Map<string, KookRuntimeState>();

function createDefaultState(accountId: string): KookRuntimeState {
  return {
    accountId,
    running: false,
    connected: false,
    reconnectAttempts: 0,
    lastConnectedAt: null,
    lastDisconnect: null,
    lastEventAt: null,
    lastInboundAt: null,
    lastOutboundAt: null,
    lastError: null,
    lastStartAt: null,
    lastStopAt: null,
  };
}

export function setKookRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getKookRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("KOOK runtime not initialized");
  }
  return runtime;
}

export function getKookState(accountId: string): KookRuntimeState {
  const existing = accountStates.get(accountId);
  if (existing) {
    return existing;
  }

  const created = createDefaultState(accountId);
  accountStates.set(accountId, created);
  return created;
}

export function patchKookState(
  accountId: string,
  patch: Partial<KookRuntimeState>,
): KookRuntimeState {
  const next = {
    ...getKookState(accountId),
    ...patch,
  };
  accountStates.set(accountId, next);
  return next;
}

export function clearKookState(accountId: string): void {
  accountStates.delete(accountId);
}

