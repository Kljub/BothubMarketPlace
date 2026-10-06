# BotHub Marketplace

Plugins for [BotHub](https://github.com/Kljub/BotHub), the self-hosted
dashboard for your own Discord bots. BotHub's App Store (Admin → Plugins)
reads `index.json` of this repo and installs the plugins from the release
zips. Every plugin runs in a sandbox and can only do what its SDK
permissions allow; the admin switches those on under **Admin → SDK
Policies**.

## Plugins

| Plugin | What it does | Commands |
|---|---|---|
| 🤖 **AI Chat** | Chat with an AI (OpenAI, Anthropic, Groq, NVIDIA, Ollama, any OpenAI-compatible server): answers to mentions, memory, persona prompts, optional web search | `/ask`, `/ask-reset` |
| 🔎 **AniSearch** | Anime and manga search, airing schedules and reminders | 6 |
| 🎨 **ArcEnCiel** | Image generation with Arc en Ciel: text to image, image to image, auto-tagging; upscale and regenerate buttons | `/imagine`, `/img2img`, `/autotag` |
| 🎰 **Casino** | Coinflip, dice, slots, roulette and blackjack with bets; payout rate (RTP) per bot | 5 |
| 🕵️ **Criminal** | Rob another member's wallet, or a member's bank with a crew: chance, loot, fine and cooldown per bot | `/steal`, `/rob-bank` |
| 😀 **Emoji Manager** | Emoji menus and emoji uploads | 3 |
| 🎮 **Minigames** | Dice duels, 5 dice, higher or lower, scratch cards, double or steal, mastermind, hangman, match pairs, lights out, begging, fishing | 11 |
| 💣 **Minesweeper** | A mine bet on 24 fields with a rising multiplier | `/minesweeper` |
| 🎬 **Plex** | Plex for Discord: library search with posters, now playing, random picks, Overseerr requests, account linking, new-content notices | 12 |
| ✂️ **Rock Paper Scissors** | Against the bot or as a duel, optional bets | `/rps`, `/rps-duel` |
| 💾 **Server Backup** | Backups of a whole server by command or schedule; restore or clone into another server | `/backup …` |
| 🔊 **Soundboard** | Sound clips in your voice channel: panel with buttons, uploads in the dashboard | `/soundboard …` |
| 🖌️ **Stable Diffusion Forge** | Images from your own Forge server: text and image to image, upscale and regenerate buttons, progress, model dropdowns | `/forge-imagine`, `/forge-img2img` |
| 📎 **Temp Attachments** | Files or texts behind an access button: password, dates, max. uses, roles | `/tempfile-…` |
| ❌ **Tic Tac Toe** | Against the bot or as a duel, optional bets | `/tictactoe` |
| 🎴 **Trading Cards** | Collect cards: packs, collection, trading and gifts | `/cards …` |
| 🌤️ **Weather** | Current weather from OpenWeatherMap | `/weather` |
| 📡 **Website Status Check** | Watches websites and keeps a status board in a channel | — |
| 🧮 **Steam Calc & Stats** | Account value, profiles, achievements and an achievement tracker (Steam Web API key) | `/steam-calc`, `/steam-profile`, `/steam-achievements` |
| 🎮 **Steam Game Tracker** | Sales, free games and patch notes of Steam games in a channel | `/steam-game` |
| 💼 **Work** | A job system: jobs with pay range and cooldown | `/job-…`, `/work` |

Each plugin folder has its own `README.md` with setup, settings and the SDK
permissions it needs. Games with bets use the bot's **Economy** module.

## Install

1. In BotHub: **Admin → Plugins (App Store)** → pick a plugin → Install.
2. Switch on the SDK permissions it asks for (Admin → SDK Policies).
3. API keys and addresses (AI Chat, ArcEnCiel, Forge, Plex, Weather, …) go into **Settings → API /
   Secrets**; every user keeps their own, and a bot uses its owner's keys.
4. On the bot: **Plugins** → the plugin → settings; its commands are Custom
   Commands you switch on there.

## Repository layout

```
index.json            the catalog BotHub reads (written by the market tools)
Template/             the starting point of a new plugin (never packed)
plugin_<name>/        one plugin
  bothub.json         manifest: id, version, SDK permissions, commands, nodes, services
  index.js            entry: joins the layers
  nodes/              builder blocks (<name>.json definition + <name>.js handler)
  commands/           slash commands as Custom Command graphs
  services/           the plugin's logic
  dashboard/          settings page (settings.json)
  lang/               en.json, de.json
  test/               node:test tests with the SDK test kit (test/lib)
```

## Develop

The tools live in the BotHub repo (`sdk/market`) and find this repo next to
it (`BOTHUB_MARKET_DIR`, default `../BothubMarketPlace`):

```
npm run create -- myplugin --features nodes,commands,storage   # new plugin_myplugin/
npm run validate [-- plugin_x]                                  # the checks of the BotHub install
npm test [-- plugin_x]                                          # the plugin's tests
npm run sync-sdk [-- plugin_x]                                  # fresh SDK test kit into test/lib
npm run pack -- plugin_x                                        # dist/<id>-<version>.zip + SHA-256
npm run index                                                   # index.json
npm run check                                                   # validate + test + index --check
```

The SDK reference is `sdk/API.md` and `shared/plugin-format.md` in the BotHub
repo. Plugins never get a database handle, the bot token or direct network
access: every call goes through the SDK manager of the bot.

## Publishing a version

1. Raise `version` in the plugin's `bothub.json`, run `npm run check`.
2. `npm run pack -- plugin_x`, then `npm run index`.
3. GitHub Release `plugin_x-<version>` with the zip as asset; commit
   `index.json`.

## License

Plugins of the BotHub Marketplace by [Kljub](https://github.com/Kljub),
original repository: <https://github.com/Kljub/BothubMarketPlace>, for
[BotHub](https://github.com/Kljub/BothubV3).

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE) (the
manifests say `PolyForm-Noncommercial-1.0.0`): free for personal use,
hobby projects, communities, education and non-profit organisations; **no
commercial use**. Copies, forks and derived works must keep the
`Required Notice:` lines of [LICENSE](LICENSE), that is, the name BotHub,
the copyright and the link to this repository as the original. Versions
released before this change stay under MIT.
