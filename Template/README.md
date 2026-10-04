# Template

Plugin template with every layer: commands, events, services (storage, messages, tasks, API, voice), nodes and a dashboard page.

Version 1.0.0 · developer: BotHub · license: MIT

## New plugin from this template

Every plugin of the market is one folder in the repo root, named like its id
`plugin_<name>` (lowercase, `a-z 0-9 _`). This folder shows every layer; a
new plugin takes only the layers it needs. Build it with the tools in the
BotHub repo:

```
cd Bothub/sdk/market
npm install
npm run create -- weather --features nodes,commands,storage   # -> plugin_weather/ (or --features all, --list)
```

The new folder `plugin_weather/` lands next to `Template/`, with ids, texts
(`plugin.plugin_weather.*`) and tests already renamed. Copying `Template/` by
hand also works: rename the folder to the new id, then replace
`plugin_template` in `bothub.json`, `package.json`, `lang/*.json`,
`commands/*.json` and `nodes/*.json`.

## Structure

```
Plugin
  ├── Commands    commands/   hello.json
  ├── Events      events/     guildMemberAdd
  ├── Services    services/   task daily_report, task cleanup, secret EXAMPLE_URL, secret EXAMPLE_KEY
  ├── Nodes       nodes/      hello, reply_for, count, announce, api_get, play_sound, stop_sound
  └── Dashboard   dashboard/  settings page
        │
        ▼
   BotHub SDK  →  Core  →  Discord · DB · Redis
```

## SDK permissions the admin must enable

- `storage`
- `discord.messages.send`
- `discord.events.members` (guildMemberAdd)
- `scheduler`
- `secrets.use`
- `discord.voice.connect`
- `discord.voice.speak`

## Texts in your own language

Every text the dashboard shows comes from `lang/<locale>.json` (keys
`plugin.<id>.*`); missing German texts fall back to English:

| Key | Shown as |
|---|---|
| `plugin.<id>.name`, `.description` | name and text in the App Store and on the plugin card |
| `plugin.<id>.setting.<key>`, `.setting.<key>_hint` | settings page |
| `plugin.<id>.node.<block>.label`, `.description` | block in the builder (`labelKey` / `descriptionKey` in `nodes/<block>.json`) |
| `plugin.<id>.port.<port>` | the in/out ports of your blocks (e.g. `port.not_found` = "Nicht gefunden") |
| `plugin.<id>.result.<…>` | results of a block (`labelKey` in `results`) |

A port without a text of your own falls back to BotHub's text for that
port name, then to the name itself ("not_found" -> "Not found").

## Secrets

Create under Admin → API / Secrets (the address too) and share them with the plugin in the App Store:

- `EXAMPLE_URL`
- `EXAMPLE_KEY`

## Built from

- **Node (builder block)**: A block for the command and event builder: nodes/hello.json describes it, nodes/hello.js runs it (config + variables in, results out).
- **Dashboard settings page**: A settings page per bot (dashboard/settings.json: text, select, color, channel, roles, list ...), rendered by BotHub. The plugin reads the values read-only with ctx.config; nodes/reply_for uses them.
- **Slash command**: A slash command as a builder graph (commands/hello.json) that uses the node "hello". Every bot gets it as a disabled copy in Custom Commands; the owner switches it on and can edit it.
- **Storage service**: Key-value storage per bot and plugin (services/storage.js: JSON helpers) and a node that counts per server and member. Survives restarts; max 1000 keys, 16 KB per value, 1 MB in total.
- **Messages service**: Sends text or embeds to a channel (services/messages.js, ctx.message.send; no pings, at most 5 messages per 5 s) and a node "Announce".
- **Discord events**: Reacts to Discord events without a builder graph: one file per event in events/ (example: welcome message on guildMemberAdd), the channel and text come from the settings page.
- **Timed tasks service**: Runs code on a schedule (services/tasks.js): "every" (1m, 6h, 1d ...) or "cron" (5 fields, UTC). Example: a daily report into a channel from the settings page.
- **External API service**: Calls an external API with ctx.http.secret (services/api.js): address and key are admin secrets (Admin -> API / Secrets), shared with the plugin in the App Store. The bot adds both; the plugin never sees them.
- **Voice / sounds service**: Plays sound files of the plugin (sounds/*.ogg|mp3|wav, max 2 MB each) in a voice channel: services/voice.js joins, plays, stops, leaves; nodes "Play sound" and "Stop sound". One player per server.

## Develop

```
npm test                         # in this folder: the plugin tests

# in Bothub/sdk/market (tools of the BotHub repo):
npm run validate -- plugin_template
npm run pack -- plugin_template          # dist/plugin_template-<version>.zip + SHA-256
npm run index                    # index.json of the market repo
```

Publish: GitHub Release `plugin_template-<version>` of the market repo with the zip as asset, then commit index.json.

Raise `version` in `bothub.json` for every release.
