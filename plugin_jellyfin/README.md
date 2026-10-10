# Jellyfin

Jellyfin for Discord, built like the Plex plugin: library search with posters,
now playing, random picks, recommendations, Jellyseerr requests, account
linking with Quick Connect and a role, favorites, music in voice, and
new-content notices.

Version 1.0.0 · developer: BotHub · license: PolyForm-Noncommercial-1.0.0

## Setup

1. **Jellyfin → Dashboard → API Keys → +**: create a key (e.g. "BotHub").
2. **Admin → API / Secrets** in BotHub: the install creates the secrets empty;
   fill in
   - `JELLYFIN_URL`: the server address, e.g. `http://192.168.1.10:8096`
   - `JELLYFIN_KEY`: the API key
   - up to five servers: `JELLYFIN_URL_2` + `JELLYFIN_KEY_2` … `_5` (their
     libraries show up as their own entries in the settings)
   - optional for requests: `JELLYSEERR_URL` = `https://jellyseerr.example/api/v1`
     and `JELLYSEERR_KEY`
   The plugin never sees them: the bot adds them to each request (the key as
   query parameter `ApiKey`, the one way Jellyfin takes a bare key).
3. **Bot → Plugins → Jellyfin**: pick the libraries Discord may see in
   *Shared libraries* (a dropdown of every library as "Server:Library",
   refreshed at bot start and every 30 minutes), choose the role and channels.
4. Optional webhooks (the plugin page shows the URLs):
   - Jellyfin → Dashboard → Plugins → Catalog → **Webhook**, install it, then
     *Add Generic Destination*: URL of `media`, notification types
     **Item Added** and **Playback Start**, tick **Send All Properties**.
   - Jellyseerr → Settings → Notifications → Webhook → URL of `jellyseerr`.

## Linking (Quick Connect)

`/jellyfin-link` asks the server for a 6-digit code. The member opens Jellyfin
→ profile → **Quick Connect** and enters it within 10 minutes; the bot checks
every minute, gives the linked role and confirms by DM. No password is
typed in Discord. The session Quick Connect creates is logged out at once;
no member token is kept. Quick Connect must be on (Dashboard → General →
Quick Connect, on by default). With several servers: `/jellyfin-link server:2`.

Links hold for every bot of the instance (global plugin storage), like the
Jellyfin servers. Favorites, unwatched picks and recommendations use the
linked member's Jellyfin user (the admin key acts for it).

## Commands

Every command except /jellyfin-link has the option `visibility`: **Public**
or **Only me**, chosen per use; the bot owner sets the default per command
on the plugin page. Errors are always only for the member.

| Command | What it does |
|---|---|
| `/jellyfin-link [server]` | Quick Connect code; the bot confirms by DM and gives the linked role |
| `/jellyfin-unlink` | Removes the link and the role |
| `/jellyfin-status` | Connection, version, playbacks, shared libraries, your link |
| `/jellyfin-nowplaying` | Active playbacks in the shared libraries |
| `/jellyfin-search title` | First hit in the shared libraries, with poster |
| `/jellyfin-random [library] [genre] [unwatched]` | Random title with an "Again" button (unwatched: by you, needs a link) |
| `/jellyfin-recommend` | Title you have not watched in your favourite genre |
| `/jellyfin-request title` | Jellyseerr request; DM when approved, available or declined |
| `/jellyfin-libraries` | Libraries with their IDs (Manage Server) |
| `/jellyfin-favorites` | Your Jellyfin favorites |
| `/jellyfin-favorites-add title` | Adds a movie or show to your favorites |
| `/jellyfin-favorites-remove title` | Removes a title from your favorites |
| `/jellyfin-play query [kind]` | Plays a song, album, artist or playlist of the shared music libraries in your voice channel (Music module queue) |

All commands are graphs in the Custom Command Builder and can be changed there.

## SDK permissions

`secrets.use` (requests with the admin's addresses and keys), `storage`,
`storage.global` (links for every bot), `storage.files` (posters),
`scheduler` (link check, library list), `discord.messages.send`,
`discord.interactions.reply`, `discord.roles.assign` (linked role),
`webhooks.inbound`, `modules.music.queue`.

## Develop

```
npm test                          # in this folder

# in Bothub/sdk/market:
npm run validate -- plugin_jellyfin
npm run pack -- plugin_jellyfin
npm run index
```

Tested against Jellyfin 12.2 (API key, libraries, search, posters, Quick
Connect link, favorites, webhooks).
