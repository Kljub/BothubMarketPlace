# DBD Stats

Dead by Daylight statistics of any Steam player with `/dbd-stats <name>`, from
the official [Steam Web API](https://steamcommunity.com/dev): bloodpoints,
time played, escapes, generators, heals, kills and more, with a link to the
full breakdown on [deadbystats.eu](https://deadbystats.eu).

## Setup (admin)

1. Get a free Steam Web API key at https://steamcommunity.com/dev/apikey.
2. Install the plugin. BotHub creates the secret `STEAM_API_KEY` empty
   (`[NULL]`) under Admin → API / Secrets, shared with this plugin.
3. Admin → API / Secrets → `STEAM_API_KEY` → "Enter value": paste the key.

SDK permissions: `secrets.use` (the bot adds the key to requests to
api.steampowered.com; the plugin never sees it) and
`discord.interactions.reply`.

## Use

`/dbd-stats name:<player>`: the Steam custom URL name
(steamcommunity.com/id/**ezteabag**), the profile link or the SteamID64. The
player's Steam profile and game details must be public.

## Block

**DBD stats** (`plugin.plugin_dbdstats.stats`): player in; results `{Var}`
(name), `.steamid`, `.bloodpoints`, `.escapes`, `.kills`, `.playtime`, `.error`.
Ports: replied (a command was answered), next, not_found, private,
not_set_up, failed.
