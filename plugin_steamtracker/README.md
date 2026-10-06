# Steam Game Tracker

Watches Steam games and posts in a channel:

- **Sales**: once when the discount reaches the set minimum (e.g. 20 %).
- **Free**: when a game becomes free for a while.
- **News**: announcements and patch notes of the game.

Games are added on the settings page by name, store link or app ID; a game
can have its own channel. They are checked every 30 minutes; the first check
of a game only remembers its state, so nothing old is posted.

**/steam-game** shows a game: price (and sale), players right now, reviews,
release, developer and genres, with links to the store and SteamDB.

No API key is needed: the Steam store and the public Steam news are used.

## Settings (per bot)

Channel, roles to ping, sales (and the minimum discount), free games, news,
store country (prices and currency), embed color, games.

## Block

**Steam game** (`plugin.plugin_steamtracker.game`): `{Var}` (game name),
`.appid`, `.price`, `.discount`, `.players`, `.reviews`, `.url`, `.error`.
Ports `replied`, `next`, `not_found`, `failed`.

## SDK permissions

`secrets.use` (requests to store.steampowered.com and api.steampowered.com,
no key), `storage` (state of the games), `scheduler` (the 30 minute check),
`discord.messages.send`, `discord.interactions.reply`.
