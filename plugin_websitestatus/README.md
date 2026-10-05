# Website Status Check

Watches websites and keeps a status board in a Discord channel: 🟢 online,
🟡 warning (slow or HTTP 4xx), 🔴 offline (HTTP 5xx or no answer), with the
response time. Websites with the same group share one embed; the others get
their own. The board is one message (up to 10 embeds each) that the bot edits
after every check; the first embed counts down to the next check. Each
website is one line: `🟢 Status: **Online** - Google - 123 ms` (with the HTTP
code when it failed).

## Command

`/sitecheck` checks every website at once (no waiting for the interval),
updates the board and answers with the results (only the caller sees it).

## Settings (per bot)

Status channel, interval (1 minute to 24 hours), "slow from" limit, language
of the board, websites (name, address, group) and group descriptions. A new
website is checked within a minute.

## Block

**Website status** (`plugin.plugin_websitestatus.site_status`): the last
result of a website by name: `{Var}` (online / warning / offline),
`.emoji`, `.name`, `.url`, `.latency`, `.code`, `.checked`, `.color`. Ports
`unchecked` and `not_found`.

**Check websites now** (`plugin.plugin_websitestatus.check_now`): checks at
once and updates the board; from a command it answers with the results.
`{Var}` (one line per website), `.online`, `.problems`. Ports `replied` and
`failed` (no websites set up).

## SDK permissions

`http.check` (status and latency of public websites only, never the page or
the home network), `storage`, `scheduler`, `discord.messages.send`,
`discord.messages.edit`, `discord.interactions.reply` (/sitecheck).

Ported from the v2 Website Status Check plugin 3.0.0: the own tables became
plugin settings and storage; the separate messages per website became one
board message.
