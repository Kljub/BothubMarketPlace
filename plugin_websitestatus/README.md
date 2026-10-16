# Website Status Check

Version 1.2.0

Watches websites and keeps a status board in a Discord channel: 🟢 online,
🟡 warning (slow or HTTP 4xx), 🔴 offline (HTTP 5xx or no answer), with the
response time. Websites with the same group share one embed; the others get
their own. The board is one message (up to 10 embeds each) that the bot edits
after every check; the first embed counts down to the next check. Each
website is one line: `🟢 Status: **Online** - Google - 123 ms` (with the HTTP
code when it failed).

## Downtime detector (services)

Next to websites, the board watches services through their own status pages
or public APIs and says whether they are down:

| Service | Target (optional unless noted) |
|---|---|
| AWS | region, e.g. `eu-central-1` (empty: all; events of the last 3 days) |
| Google Cloud | product, e.g. `BigQuery` |
| Microsoft Azure, Cloudflare, DigitalOcean, Linode, Vercel | – |
| Discord, GitHub, npm, Slack, Reddit, Dropbox, Twitch, OpenAI, Claude | – |
| Epic Games, Xbox Live | – |
| PlayStation Network | country (`DE`, `US` …) or region (`SCEE` …) |
| Minecraft server | `host` or `host:port` (required; via api.mcsrvstat.us, players and version) |
| Steam game server | `ip:port` (required; Rust, ARK, CS2, Valheim … via the Steam server list; needs the secret `STEAM_API_KEY` under Admin → API / Secrets) |

🟢 all good, 🟡 an incident or maintenance (or the status page did not
answer), 🔴 a critical incident, or the game server is not reachable. The
line shows what the status page says (or players and map). Services without
a group share one embed "🛰️ Services". Some big Minecraft networks (e.g.
Hypixel) block status queries and always show offline.

## User reports

Like Downdetector, but inside the server: members report a problem with
`/sitereport <name>`. When enough different members (setting, default 3)
reported a website or service within the time window (15 minutes to 3 hours),
it shows as 🟡 warning on the board with "👥 3 reports", even when its own
check is fine, and the warning alert goes out. The report that reaches the
threshold starts a check round at once. Each member counts once per website
or service and window. Reports can be switched off.

Each service can also link a public reports page, e.g. its page on
[allestörungen.de](https://xn--allestrungen-9ib.de/): the link shows in the
board line, in `/sitestatus` and in the alert. The plugin does not read that
site: Downdetector blocks automated access and offers its data only through a
paid enterprise API.

## Alerts

With an alert channel the bot posts when a website or service goes down
(after 1-5 bad checks in a row, setting) and when it is back up, with the
downtime ("🟢 **Rust** is back up after 12 min"). Alerts on outages only, or
also on warnings. Plugins cannot ping roles yet, so there is no role ping.

## Commands

- `/sitestatus [name]`: the status of one website or service (detail,
  response time, user reports, last check, reports page), or of all of them
  without a name. Names match without case; a unique part of a name is
  enough.
- `/sitereport <name>`: report a problem (see user reports).
- `/sitecheck`: checks everything at once (no waiting for the interval),
  updates the board and answers with the results.

Only the caller sees the answers.

## Settings (per bot)

Status channel, interval (1 minute to 24 hours), "slow from" limit, language
of the board, websites (name, address, group), services (service, target,
own name, group, reports page), group descriptions, alert channel, alert on
(offline / also warnings), alert after (1, 2, 3 or 5 bad checks), user
reports on/off, warning from reports (1-10), report time window. A new website or
service is checked within a minute.

## Blocks

**Website / service status** (`plugin.plugin_websitestatus.site_status`): the
last result of a website or service by name: `{Var}` (online / warning / offline),
`.emoji`, `.name`, `.url`, `.latency`, `.code`, `.checked`, `.color`, `.detail`,
`.reports`. Ports
`unchecked` and `not_found`.

**Check websites now** (`plugin.plugin_websitestatus.check_now`): checks at
once and updates the board; from a command it answers with the results.
`{Var}` (one line per website), `.online`, `.problems`. Ports `replied` and
`failed` (no websites set up).

**Show status** (`plugin.plugin_websitestatus.show_status`): answers with
the status of one entry or all (empty name). Ports `replied`, `next`,
`not_found`.

**Report a problem** (`plugin.plugin_websitestatus.report`): counts a
member's report. `{Var}` (answer), `.name`, `.count`. Ports `replied`,
`next`, `duplicate`, `not_found`, `off`.

## SDK permissions

`http.check` (status and latency of public websites only, never the page or
the home network), `http.outbound` (the status pages and APIs of
`services.hosts`), `secrets.use` (STEAM_API_KEY for Steam servers), `storage`, `scheduler`, `discord.messages.send`,
`discord.messages.edit`, `discord.interactions.reply` (the commands).

Ported from the v2 Website Status Check plugin 3.0.0: the own tables became
plugin settings and storage; the separate messages per website became one
board message.
