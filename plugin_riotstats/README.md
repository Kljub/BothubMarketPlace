# Riot Games Stats Tracker

Stats of the Riot games in Discord: **Valorant**, **League of Legends**,
**Teamfight Tactics** and **Legends of Runeterra**. Ranks and recent matches
of any Riot ID; members link their Riot ID once for every game; their new
matches and rank ups or downs are posted in a channel; leaderboards per game.

Version 1.0.0 · developer: BotHub · license: PolyForm-Noncommercial-1.0.0

## Setup (admin)

Install the plugin. BotHub creates three secrets empty (`[NULL]`) under
Admin → API / Secrets, shared with this plugin. Fill in the ones you need:

| Secret | Games | Where |
|---|---|---|
| `HENRIKDEV_API_KEY` | Valorant | https://api.henrikdev.xyz/dashboard/ → API Keys (free, log in with Discord). Riot gives Valorant match data only to approved apps, so Valorant uses this common unofficial API. |
| `RIOT_API_KEY` | League of Legends, Legends of Runeterra (and TFT) | https://developer.riotgames.com: a development key lasts 24 hours; register a **Personal API Key** for a lasting one. |
| `RIOT_TFT_API_KEY` | Teamfight Tactics (optional) | A Riot app registered for TFT has its own key. Empty: TFT uses `RIOT_API_KEY` (a development key works for every game). |

A game without its key answers "not set up yet"; the others work. The
plugin never sees the keys: the bot adds them to the requests
(`secrets.use`).

## Commands

| Command | What it shows |
|---|---|
| `/valorant [player] [member]` | Rank, RR, last change, peak, season, level, player card; K/D, KDA, HS %, ADR, ACS and win rate of the last competitive matches; agents, maps |
| `/valorant-matches [player] [member] [mode]` | Last 8 matches (competitive, unrated, swiftplay, spikerush, deathmatch, teamdeathmatch, premier, all) |
| `/lol [player] [member]` | Solo/Duo and Flex rank with LP and win rate, level, top 3 mastery; last 10 matches: win rate, KDA, CS/min, main role, champions |
| `/lol-matches [player] [member] [mode]` | Last 8 matches (all, ranked, flex, normal, quickplay, aram, arena) |
| `/tft [player] [member]` | Ranked, Double Up and Hyper Roll ranks, level; last 10 games: average place, top 4 %, wins, favorite traits |
| `/tft-matches [player] [member] [mode]` | Last 8 games with place and traits (all, ranked, normal, hyperroll, doubleup) |
| `/lor [player] [member]` | Last matches of Legends of Runeterra: win rate, regions, modes (the API has no ranks below Master) |
| `/riot-link player` | Links your Riot ID on this server; it is used for every game |
| `/riot-unlink` | Removes the link |
| `/riot-leaderboard [game]` | Linked members by rank in Valorant, LoL or TFT |

A player is a Riot ID with the tag (`Name#EUW`) or a tracker.gg profile link.
Without a player the command uses your linked Riot ID (or the member's).

## Tracker

Every 5 minutes the next 8 tracked players are checked. Tracked are the linked
members (one switch per game: Valorant, LoL, TFT) and the Riot IDs of the
settings list (each for one or all games, optionally with its own channel).

- **Valorant**: every competitive match with result, score, map, agent,
  K/D/A, ACS, HS %, rank and RR change.
- **LoL**: every match with champion, K/D/A, CS, duration and queue; after
  Solo/Duo and Flex the LP change.
- **TFT**: every game with place, traits and level; after ranked the LP change.
- Rank ups and downs are marked. With "Post every new match" off, only rank
  changes are posted.

The first check of a player only remembers the newest match, so nothing old
is posted.

## Settings

Language (en/de), embed color, Riot account region, Valorant platform
(PC/console), Valorant matches counted in `/valorant`, tracker channel,
tracking per game, post every match, post rank changes, ping the linked
member, max. tracked players, tracked players list.

## Limits

- LoL and TFT servers: NA, BR, LAN, LAS, KR, JP, EUW, EUNE, TR, RU, ME, OCE,
  SEA, TW, VN. Legends of Runeterra: Americas, Europe, SEA, APAC.
- Requests: the free HenrikDev key allows 30 per minute, a Riot personal key
  100 per 2 minutes. Match details are cached, so a command loads only new
  matches.
- 2XKO, Wild Rift and Riftbound have no public player API.

## Blocks

| Block | Results | Ports |
|---|---|---|
| Riot game stats (`plugin.plugin_riotstats.stats`, config `game`) | `{Var}` (Riot ID), `.rank`, `.points` (RR/LP), `.winrate` (TFT: top 4 %), `.kda` (TFT: average place), `.games`, `.error` | replied, next, not_found, not_set_up, failed |
| Riot game matches (`plugin.plugin_riotstats.matches`) | `{Var}`, `.count`, `.error` | replied, next, not_found, not_set_up, failed |
| Link Riot ID (`plugin.plugin_riotstats.link`) | `{Var}`, `.games`, `.error` | replied, next, not_found, not_set_up, failed |
| Riot leaderboard (`plugin.plugin_riotstats.leaderboard`) | `{Var}` (list), `.count`, `.error` | replied, next, failed |

## SDK permissions

`secrets.use` (requests to api.henrikdev.xyz and *.api.riotgames.com with the
admin's keys), `storage` (links, account and match cache, tracker state),
`scheduler` (the 5 minute check), `discord.messages.send`,
`discord.interactions.reply`.

## Structure

```
services/games.js      one interface over the four games
services/henrik.js     HenrikDev API (Valorant)
services/valorant.js   Valorant numbers and embeds
services/riot.js       Riot API: accounts, servers, matches (cached)
services/lol.js        LoL profile, numbers and embeds
services/tft.js        TFT profile, numbers and embeds
services/lor.js        Legends of Runeterra matches
services/champions.js  LoL champion names by ID (mastery)
services/links.js      linked Riot IDs per server
services/tracker.js    task "tick": new matches and rank changes
services/answer.js     whose account a command shows, error replies
services/i18n.js       texts en/de
```

Riot Games Stats Tracker is not endorsed by Riot Games and does not reflect
the views or opinions of Riot Games or anyone officially involved in
producing or managing Riot Games properties. Riot Games and all associated
properties are trademarks or registered trademarks of Riot Games, Inc.
