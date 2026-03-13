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
git clone https://github.com/sldcyh/openclaw-kook-plugin.git
cd openclaw-kook-plugin
openclaw plugins install /absolute/path/to/openclaw-kook-plugin
```

## Install from npm

```bash
openclaw plugins install @sldcyh/openclaw-kook-plugin@0.1.2
```

After installation, restart the gateway so OpenClaw reloads plugins:

```bash
openclaw gateway restart
```

Then add a KOOK account:

```bash
openclaw channels add --channel kook --token YOUR_KOOK_BOT_TOKEN
```

If you prefer storing the token in an environment variable instead of config:

```bash
export KOOK_BOT_TOKEN="your-kook-bot-token"
openclaw channels add --channel kook --use-env
```

Optional flags:

- `--account <id>` to create a named KOOK account
- `--name <display-name>` to label the account in OpenClaw

## Verify install

```bash
openclaw plugins list
openclaw channels list
openclaw channels status
```

You should see:

- plugin `openclaw-kook-plugin` loaded
- channel `KOOK default` configured
- after the gateway connects, `running, connected`

## Config shape

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
