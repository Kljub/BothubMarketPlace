# Steam Calc & Stats

Two commands for any Steam player (custom URL name, profile link or
SteamID64):

- **/steam-calc**: what the account is worth (current store prices of the
  owned games, and without sales), games owned and never played, total
  playtime and price per hour, level, badges, member since, bans and the
  five most played games. Link to the SteamDB calculator.
- **/steam-profile**: status (or the game being played), level, member
  since, friends, games, bans and the games of the last two weeks.

The numbers come from the official Steam Web API and the Steam store. Games,
playtime and friends need a public profile ("Game details" public). Prices
of the 600 most played games are counted (the store allows only so many
requests).

## Settings (per bot)

Store country (prices and currency) and embed color.

## Setup

An admin pastes a Steam Web API key (steamcommunity.com/dev/apikey) into the
secret STEAM_API_KEY under Admin → API / Secrets. The bot adds it to the
requests; the plugin never sees it.

## Blocks

**Steam account value** (`plugin.plugin_steamcalc.calc`) and **Steam profile**
(`plugin.plugin_steamcalc.profile`): `{Var}` (player name), `.steamid`,
`.value`, `.games`, `.playtime`, `.level`, `.error`. Ports `replied`, `next`,
`not_found`, `private`, `not_set_up`, `failed`.

## SDK permissions

`secrets.use` (requests to api.steampowered.com and store.steampowered.com,
the key added by the bot), `discord.interactions.reply`.
