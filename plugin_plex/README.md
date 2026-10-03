# Plex

Plex for Discord: library search, now playing, random picks, recommendations, Overseerr requests, account linking with a role, and new-content notices.

Version 1.0.0 · developer: BotHub · license: MIT

## Setup

1. **Admin → API / Secrets**
   - Secret `PLEX_TOKEN` = your Plex token. Endpoint `PLEX_API` = server URL (e.g. `http://plex.lan:32400`), secret `PLEX_TOKEN`, auth header `X-Plex-Token`, scheme `<secret>`.
   - Optional for requests: secret `OVERSEERR_KEY`, endpoint `OVERSEERR_API` = `https://overseerr.example/api/v1`, header `X-Api-Key`, scheme `<secret>`.
2. **Admin → Plugins → Plex**: share both endpoints with the plugin. SDK Policies: allow `http.endpoints`, `http.outbound` (plex.tv login), `discord.interactions` (button), `discord.roles.manage` (linked role), `webhooks.inbound`.
3. **Bot → Plugins → Plex**: run `/plex-libraries`, put the IDs of the libraries Discord may see into *Shared libraries*, choose the role and channels.
4. Webhooks (plugin page shows the URLs): Plex → Settings → Webhooks → `media`; Overseerr → Notifications → Webhook → `overseerr`.

The Plex token stays in the bot: the plugin never sees it, so embeds carry no poster links with the token.

## Commands

| Command | What it does |
|---|---|
| `/plex-link` | plex.tv login link (15 min); the bot confirms by DM and gives the linked role |
| `/plex-unlink` | Removes the link and the role |
| `/plex-status` | Connection, version, playbacks, shared libraries, your link |
| `/plex-nowplaying` | Active playbacks in the shared libraries |
| `/plex-search title` | First hit in the shared libraries |
| `/plex-random [library] [genre] [unwatched]` | Random title with an "Again" button |
| `/plex-recommend` | Unwatched title in your favourite genre (watch history) |
| `/plex-request title` | Overseerr request; DM when approved, available or declined |
| `/plex-libraries` | Libraries with their IDs (Manage Server) |

All commands are graphs in the Custom Command Builder and can be changed there.

## Develop

```
npm test                          # in this folder

# in Bothub/sdk/market:
npm run validate -- plugin_plex
npm run pack -- plugin_plex
npm run index
```
