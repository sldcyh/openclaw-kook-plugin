import { sendKookText } from "./api.js";
import { buildKookReplyText } from "./normalize.js";
import { getKookRuntime } from "./runtime.js";
import { buildKookMessageContext } from "./message-context.js";
import type { KookMessageEvent, ResolvedKookAccount } from "./types.js";

export async function handleKookInboundEvent(params: {
  event: KookMessageEvent;
  account: ResolvedKookAccount;
  log?: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
    debug?: (message: string) => void;
  };
}): Promise<void> {
  const runtime = getKookRuntime();
  const { cfg, ctx, storePath, route, replyTarget, replyQuote } = buildKookMessageContext({
    event: params.event,
    account: params.account,
  });

  await runtime.channel.session.recordSessionMetaFromInbound({
    storePath,
    sessionKey: route.sessionKey,
    ctx,
  });

  runtime.channel.activity.record({
    channel: "kook",
    accountId: route.accountId ?? params.account.accountId,
    direction: "inbound",
  });

  const messagesConfig = runtime.channel.reply.resolveEffectiveMessagesConfig(cfg, route.agentId);
  let finalSent = false;

  await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx,
    cfg,
    dispatcherOptions: {
      responsePrefix: messagesConfig.responsePrefix,
      deliver: async (payload, info) => {
        if (info.kind !== "final") {
          return;
        }

        const replyText = buildKookReplyText(payload);
        if (!replyText) {
          return;
        }

        await sendKookText({
          account: params.account,
          to: replyTarget,
          text: replyText,
          quote: replyQuote,
        });

        runtime.channel.activity.record({
          channel: "kook",
          accountId: route.accountId ?? params.account.accountId,
          direction: "outbound",
        });
        finalSent = true;
      },
      onError: (error, info) => {
        params.log?.error?.(
          `[kook] failed to deliver ${info.kind} reply: ${error instanceof Error ? error.message : String(error)}`,
        );
      },
    },
    replyOptions: {},
  });

  if (!finalSent) {
    params.log?.debug?.(
      `[kook] no final outbound reply was produced for session ${route.sessionKey}`,
    );
  }
}

