# Plex

Plex for Discord: library search, now playing, random picks, recommendations, Overseerr requests, account linking with a role, and new-content notices.

Version 1.2.0 · developer: BotHub · license: MIT

## Setup

1. **App Store → Plex → Install.** The install dialog lists the SDKs and sets them to "Allow".
2. **App Store → Plex → Sign in with Plex** (up to five servers: "Connect another server" fills `PLEX_API_2` … `PLEX_API_5`; libraries of server 2 are `2:<ID>` in the settings). One click: you sign in on plex.tv, BotHub stores the token as secret `PLEX_TOKEN`, finds your Plex server, creates endpoint `PLEX_API` (header `X-Plex-Token`) and shares it with the plugin. Without the button: create them by hand under Admin → API / Secrets (server URL e.g. `http://plex.lan:32400`, auth header `X-Plex-Token`, scheme `<secret>`).
   - Optional for requests: secret `OVERSEERR_KEY`, endpoint `OVERSEERR_API` = `https://overseerr.example/api/v1`, header `X-Api-Key`, scheme `<secret>`; share it on the plugin's App Store page.
3. **Bot → Plugins → Plex**: run `/plex-libraries`, put the IDs of the libraries Discord may see into *Shared libraries*, choose the role and channels.
4. Webhooks (plugin page shows the URLs): Plex → Settings → Webhooks → `media`; Overseerr → Notifications → Webhook → `overseerr`.

The server token stays in the bot: the plugin never sees it, so embeds carry no poster links with the token. Members who run /plex-link allow BotHub to edit their watchlist: their own plex.tv token is kept in the plugin's global storage (SDK permission `storage.global`) until /plex-unlink. Links hold for every bot of the instance.

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
| `/plex-watchlist` | Shows your Plex watchlist (needs /plex-link) |
| `/plex-watchlist-add <title>` | Adds a movie or show to your watchlist |
| `/plex-watchlist-remove <title>` | Removes a title from your watchlist |

All commands are graphs in the Custom Command Builder and can be changed there.

## Develop

```
npm test                          # in this folder

# in Bothub/sdk/market:
npm run validate -- plugin_plex
npm run pack -- plugin_plex
npm run index
```
