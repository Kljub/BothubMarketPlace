# BotHub Marketplace

Plugins for [BotHub](https://github.com/Kljub/BothubV3), the plugin
template, and the market index the BotHub install reads.

```
Template/            the plugin template: base + one folder per feature
plugins/<id>/        plugin sources (one folder per plugin)
dist/<id>-<ver>.zip  packed plugins, installed by BotHub (never edit)
index.json           market index: id, version, URL, SHA-256 (generated)
schema/              bothub.json schema and SDK catalog (copied from BotHub)
lib/                 SDK testing kit and types (copied from BotHub)
scripts/             create, validate, pack, index, sync-sdk
```

## How a plugin is built

```
Plugin
  ├── Commands    commands/<name>.json     slash command graphs
  ├── Events      events/<event>.js        Discord event handlers
  ├── Services    services/*.js            timed tasks, external APIs, voice, shared code
  ├── Nodes       nodes/<name>.json + .js  builder blocks
  └── Dashboard   dashboard/settings.json  settings page per bot
        │
        ▼
   BotHub SDK   (ctx: permissions, limits, sandbox)
        │
        ▼
      Core  →  Discord · DB · Redis
```

A plugin never talks to Discord, the database or Redis itself. It runs in
its own sandboxed process per bot (no network, no bot token, no files
outside its folder) and uses only `ctx`, the BotHub SDK. The core does the
rest.

### bothub.json

Every plugin has a `bothub.json`: who made it, which version, which SDK it
needs and what it consists of.

```jsonc
{
  "$schema": "../../schema/plugin-manifest.schema.json",
  "schemaVersion": 1,
  "id": "starter",                       // = folder name, a-z 0-9 -
  "name": "Starter Kit",
  "version": "1.0.0",                    // raise for every release
  "description": "Short text for the plugin list.",
  "developer": { "name": "BotHub", "url": "https://github.com/Kljub", "email": "dev@example.com" },
  "license": "MIT",
  "sdk": {
    "version": 1,
    "permissions": ["storage", "discord.messages.send"]   // SDK features the admin must enable
  },
  "main": "index.js",
  "commands": ["commands/hello.json"],
  "events": ["guildMemberAdd"],
  "services": {
    "tasks": [{ "name": "daily_report", "cron": "0 9 * * *" }],
    "endpoints": ["WEATHER_API"]
  },
  "nodes": ["hello"],
  "dashboard": { "settings": "dashboard/settings.json" },
  "lang": { "en": "lang/en.json", "de": "lang/de.json" }
}
```

`sdk.permissions` lists the SDK features the plugin uses. The admin
enables them under Admin → SDK policies; a call without its permission
rejects with `sdk.call.denied`. `events` needs `discord.events`,
`services.tasks` needs `scheduler`, `services.endpoints` needs
`http.endpoints`, sound files need `discord.voice`. The full format:
`shared/plugin-format.md` in the BotHub repo.

## Create a plugin

Every plugin is different, so the template is built from features. Pick
the ones you need; features they depend on are added, and `bothub.json`,
the layer folders, texts, tests and `index.js` are generated.

```
npm install
npm run create -- --list
npm run create -- my-plugin --features nodes,commands --name "My Plugin" --developer "Me"
npm run create -- soundboard --features voice
npm run create -- weather --features api,commands --endpoint WEATHER_API
npm run create -- everything --features all
```

| Feature     | Layer      | What you get | SDK permission |
|-------------|------------|--------------|----------------|
| `nodes`     | Nodes      | A builder block: `nodes/hello.json` (definition) + `nodes/hello.js` (handler) | – |
| `dashboard` | Dashboard  | A settings page (text, select, color, channel, roles, list), read with `ctx.config`, plus a node that uses it | – |
| `commands`  | Commands   | `/hello` as a builder graph, installed as a disabled copy in Custom Commands | – |
| `storage`   | Services   | `services/storage.js` (JSON helpers) + a counting node | `storage` |
| `messages`  | Services   | `services/messages.js` (embeds) + an "Announce" node | `discord.messages.send` |
| `events`    | Events     | `events/guildMemberAdd.js`: welcome message, channel from the settings page | `discord.events` |
| `tasks`     | Services   | `services/tasks.js`: daily report (`cron`, UTC) and cleanup (`every`) | `scheduler` |
| `api`       | Services   | `services/api.js`: calls a global API endpoint, the bot adds the key | `http.endpoints` |
| `voice`     | Services   | `services/voice.js` + sounds: play files of the plugin in a voice channel | `discord.voice` |

Remove what you do not need, for example the node `count`:

1. delete `nodes/count.json` and `nodes/count.js`,
2. remove `"count"` from `nodes` in `bothub.json`,
3. remove `import count …` and `count` from `blocks` in `index.js`,
4. remove the `plugin.<id>.node.count.*` texts and the test of `count`,
5. drop `storage` from `sdk.permissions` if nothing else uses it.

`npm run validate` tells you what does not fit together. Services other
than `services/tasks.js` are imported by the nodes and events that use them.

### The code

`index.js` (the `main` file) joins the layers into one object:

```js
import hello from './nodes/hello.js';
import guildMemberAdd from './events/guildMemberAdd.js';
import { tasks } from './services/tasks.js';

export default {
  async onEnable(ctx) {},          // hooks: onLoad, onEnable, onDisable, onUnload
  blocks: { hello },               // nodes: (ctx, { config, vars }) => ({ port?, results? })
  events: { guildMemberAdd },      // events: (ctx, payload) => {}
  tasks,                           // tasks: (ctx) => {}
};
```

All `ctx` calls: `sdk/API.md` in the BotHub repo, types in `lib/sdk.d.ts`.

**SDK runtime:** every layer of the template runs in the bot: nodes,
dashboard settings (`ctx.config`), storage, messages, commands, events,
tasks (cron in UTC), `http.endpoint` and voice. Event payloads use the
builder variable names (`user.bot` is a boolean; `voiceStateUpdate` has
`voice.action` join/leave/switch); `interactionCreate` is not delivered
yet. Which calls exist: `sdk/API.md` in the BotHub repo.

## Test, check, publish

```
npm test                 # all plugin tests (node --test), with the fake ctx of #sdk-testing
npm run validate         # what the BotHub install checks, plus handlers and texts
npm run pack             # dist/<id>-<version>.zip, same files -> same SHA-256
npm run index            # index.json from dist/
npm run check            # validate + test + index up to date (CI)
```

Publishing a version:

1. Raise `version` in `plugins/<id>/bothub.json` (a version is never
   rebuilt with other files: BotHub refuses a known version with a new hash).
2. `npm run check`, `npm run pack -- <id>`, `npm run index`.
3. Commit `plugins/<id>`, the new zip in `dist/` and `index.json`.

BotHub installs from Admin → Plugins → From the market (id + version), or
by uploading the zip; the SHA-256 is checked against `index.json`. BotHub
reads this index by default
(`https://raw.githubusercontent.com/Kljub/BothubMarketPlace/main/index.json`,
override with `BOTHUB_MARKET_INDEX`).

## Rules for plugins

- ID: 2–64 characters `a-z 0-9 -`, equal to the folder name.
- Texts in `lang/en.json` (required) and `lang/de.json`, keys only
  `plugin.<id>.*`, values up to 500 characters.
- Zip: at most 200 files, 2 MB per file, 5 MB packed, 20 MB unpacked.
- Sounds: `sounds/<name>.ogg|mp3|wav`; Ogg/Opus needs the least CPU.
- Ask only for the SDK permissions you use; high-risk ones are off by default.

## Reviewing contributions

`npm test` and `npm run validate` load the plugin code with normal Node
rights (outside the BotHub sandbox). Read a plugin's code before running
them on a pull request; the CI job has no secrets and only read access. In
BotHub every plugin runs sandboxed, whatever its code does.

`validate` mirrors the install rules; the full graph check of commands
runs on install only, so install a new version once on a test instance
(Admin → Plugins → Upload) before publishing.

## Keep in sync with BotHub

`schema/` and `lib/` come from the BotHub repo:

```
cd ../Bothub/sdk && npx tsc && cd -
npm run sync-sdk -- ../Bothub
```
