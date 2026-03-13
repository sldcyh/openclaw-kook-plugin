# OpenClaw KOOK Plugin

Early community plugin for connecting OpenClaw to KOOK through a bot token and
KOOK's WebSocket gateway.

This repository is an MVP focused on getting the core messaging loop working in
real KOOK servers under domestic network conditions.

## Current scope

- DM receive + reply
- Channel receive + reply
- Mention-gated channel replies by default
- `openclaw message send` support for `user:<id>`, `channel:<id>`, and `chat:<code>`
- WebSocket-based inbound event handling

## Not implemented yet

- Voice
- Cards and button callbacks
- KOOK-hosted media upload
- Reactions
- Threads
- Rich directory lookup

## Requirements

- OpenClaw `2026.3.11` or newer
- A KOOK bot token from the KOOK developer console

Optional:

- `botUserId`
  Useful if you want explicit mention matching before the plugin probes
  `user/me`.

## Install from source

```bash
npm install
openclaw plugins install --link /absolute/path/to/openclaw-kook-plugin
```

## Install from npm

```bash
openclaw plugins install @sldcyh/openclaw-kook-plugin
```

After installation, confirm the plugin is loaded:

```bash
openclaw plugins list
openclaw channels status
```

## Minimal config

```json5
{
  channels: {
    kook: {
      enabled: true,
      token: "your-kook-bot-token",
      chatmode: "oncall",
      outboundFormat: "text"
    }
  }
}
```

Use an environment variable if you do not want the token stored in config:

```bash
export KOOK_BOT_TOKEN="your-kook-bot-token"
```

## Behavior notes

- Default `chatmode` is `oncall`, so the bot replies in channels only when
  mentioned.
- `onmessage` and `onchar` modes are exposed in config for broader automation
  flows.
- KOOK image/file APIs require bot-owned uploaded assets, so this MVP falls
  back to sending URLs as text when media upload is unavailable.
- This plugin intentionally uses KOOK WebSocket mode. Webhook mode is left for
  a later pass.

## Target formats

- `user:<userId>`: send a DM
- `chat:<chatCode>`: send a DM through an existing chat session
- `channel:<channelId>`: send to a channel

## Development

```bash
npm install
npm run check
npm run pack:check
```

## Roadmap

- Add KOOK card messages and button callbacks
- Add uploaded media support
- Improve channel and user lookup
- Evaluate voice support separately
