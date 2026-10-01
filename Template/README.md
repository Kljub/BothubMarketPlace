# Template

Plugin template with every layer: commands, events, services (storage, messages, tasks, API, voice), nodes and a dashboard page.

Version 1.0.0 · developer: BotHub · license: MIT

## New plugin from this template

Every plugin of the market is one folder in the repo root, named like its id
(lowercase, `a-z 0-9 -`). This folder shows every layer; a new plugin takes
only the layers it needs. Build it with the tools in the BotHub repo:

```
cd Bothub/sdk/market
npm install
npm run create -- my-plugin --features nodes,commands,storage   # or --features all, --list
```

The new folder `my-plugin/` lands next to `Template/`, with ids, texts
(`plugin.my-plugin.*`) and tests already renamed. Copying `Template/` by hand
also works: rename the folder, then replace `template` in `bothub.json`,
`package.json`, `lang/*.json`, `commands/*.json` and `nodes/*.json`.

## Structure

```
Plugin
  ├── Commands    commands/   hello.json
  ├── Events      events/     guildMemberAdd
  ├── Services    services/   task daily_report, task cleanup, API EXAMPLE_API
  ├── Nodes       nodes/      hello, reply_for, count, announce, api_get, play_sound, stop_sound
  └── Dashboard   dashboard/  settings page
        │
        ▼
   BotHub SDK  →  Core  →  Discord · DB · Redis
```

## SDK permissions the admin must enable

- `storage`
- `discord.messages.send`
- `discord.events`
- `scheduler`
- `http.endpoints`
- `discord.voice`

## API endpoints

Create under Admin → API / Secrets and share with the plugin (Admin → Plugins):

- `EXAMPLE_API`

## Built from

- **Node (builder block)**: A block for the command and event builder: nodes/hello.json describes it, nodes/hello.js runs it (config + variables in, results out).
- **Dashboard settings page**: A settings page per bot (dashboard/settings.json: text, select, color, channel, roles, list ...), rendered by BotHub. The plugin reads the values read-only with ctx.config; nodes/reply_for uses them.
- **Slash command**: A slash command as a builder graph (commands/hello.json) that uses the node "hello". Every bot gets it as a disabled copy in Custom Commands; the owner switches it on and can edit it.
- **Storage service**: Key-value storage per bot and plugin (services/storage.js: JSON helpers) and a node that counts per server and member. Survives restarts; max 1000 keys, 16 KB per value, 1 MB in total.
- **Messages service**: Sends text or embeds to a channel (services/messages.js, ctx.message.send; no pings, at most 5 messages per 5 s) and a node "Announce".
- **Discord events**: Reacts to Discord events without a builder graph: one file per event in events/ (example: welcome message on guildMemberAdd), the channel and text come from the settings page.
- **Timed tasks service**: Runs code on a schedule (services/tasks.js): "every" (1m, 6h, 1d ...) or "cron" (5 fields, UTC). Example: a daily report into a channel from the settings page.
- **External API service**: Calls an external API through a global API endpoint (services/api.js, Admin -> API / Secrets). The bot adds the API key; the plugin never sees it. The admin shares the endpoint with the plugin.
- **Voice / sounds service**: Plays sound files of the plugin (sounds/*.ogg|mp3|wav, max 2 MB each) in a voice channel: services/voice.js joins, plays, stops, leaves; nodes "Play sound" and "Stop sound". One player per server.

## Develop

```
npm test                         # in this folder: the plugin tests

# in Bothub/sdk/market (tools of the BotHub repo):
npm run validate -- template
npm run pack -- template          # dist/template-<version>.zip + SHA-256
npm run index                    # index.json of the market repo
```

Publish: GitHub Release `template-<version>` of the market repo with the zip as asset, then commit index.json.

Raise `version` in `bothub.json` for every release.
