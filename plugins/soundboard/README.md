# Soundboard

Plays short sounds in a voice channel.

Version 1.0.0 · developer: BotHub · license: MIT

## Structure

```
Plugin
  ├── Commands    commands/   -
  ├── Events      events/     -
  ├── Services    services/   helpers only
  ├── Nodes       nodes/      play_sound, stop_sound
  └── Dashboard   dashboard/  settings page
        │
        ▼
   BotHub SDK  →  Core  →  Discord · DB · Redis
```

## SDK permissions the admin must enable

- `discord.voice`

## Built from

- **Voice / sounds service**: Plays sound files of the plugin (sounds/*.ogg|mp3|wav, max 2 MB each) in a voice channel: services/voice.js joins, plays, stops, leaves; nodes "Play sound" and "Stop sound". One player per server.

## Develop

```
npm test                        # tests of all plugins
npm run validate -- soundboard
npm run pack -- soundboard         # dist/soundboard-<version>.zip + SHA-256
```

Raise `version` in `bothub.json` for every release.
