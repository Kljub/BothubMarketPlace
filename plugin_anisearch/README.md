# AniSearch

Anime and manga search on [AniList](https://anilist.co), plus new-episode notices for tracked anime.

Version 1.0.0 · developer: BotHub · license: MIT

## Commands

Every command is a graph in the Custom Command Builder (copied to each bot as a disabled command) and can be changed there.

| Command | What it does |
|---|---|
| `/anisearch-anime title` | Embed with format, status, score, episodes, next episode, genres, cover |
| `/anisearch-manga title` | Same for manga (chapters, volumes) |
| `/anisearch-track title` | Follows an anime; new episodes are announced (Manage Server) |
| `/anisearch-untrack title` | Stops following (title or AniList ID; Manage Server) |
| `/anisearch-tracked` | The followed anime with their IDs |

## Nodes

| Node | Ports | Results |
|---|---|---|
| AniList search | found, not_found | title, id, url, description, cover, score, status, format, episodes, chapters, volumes, genres, year, next_episode |
| Track anime | next, already, not_found, no_channel, full | title, id, url, channel |
| Stop tracking | next, not_found | title, id |
| Tracked anime | next, empty | list, count |

## Settings

- **Announcement channel** (required for tracking), **role to ping** (optional)
- **Announcement text**: `{episode}` and `{title}`; **embed color**

## How it works

- AniList's public GraphQL API (`graphql.anilist.co`, no key) through `ctx.http` (SDK permission `http.outbound`, host listed in `services.hosts`).
- Task `airing_check` every 15 minutes: one request for all followed anime. AniList names the next, not yet aired episode; when that number goes up, the episode before it is announced.
- Up to 50 anime per bot, kept in the plugin storage.

## Develop

```
npm test                          # in this folder

# in Bothub/sdk/market:
npm run validate -- plugin_anisearch
npm run pack -- plugin_anisearch
npm run index
```
