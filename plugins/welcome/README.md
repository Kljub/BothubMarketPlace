# Welcome

Greets new members in a channel of your choice.

Version 1.0.0 · developer: BotHub · license: MIT

## Structure

```
Plugin
  ├── Commands    commands/   -
  ├── Events      events/     guildMemberAdd
  ├── Services    services/   helpers only
  ├── Nodes       nodes/      announce
  └── Dashboard   dashboard/  settings page
        │
        ▼
   BotHub SDK  →  Core  →  Discord · DB · Redis
```

## SDK permissions the admin must enable

- `discord.messages.send`
- `discord.events`

## Built from

- **Messages service**: Sends text or embeds to a channel (services/messages.js, ctx.message.send; no pings, at most 5 messages per 5 s) and a node "Announce".
- **Discord events**: Reacts to Discord events without a builder graph: one file per event in events/ (example: welcome message on guildMemberAdd), the channel and text come from the settings page.

## Develop

```
npm test                        # tests of all plugins
npm run validate -- welcome
npm run pack -- welcome         # dist/welcome-<version>.zip + SHA-256
```

Raise `version` in `bothub.json` for every release.
