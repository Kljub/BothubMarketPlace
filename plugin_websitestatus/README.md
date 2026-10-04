# Website Status Check

Watches websites and keeps a status board in a Discord channel: 🟢 online,
🟡 warning (slow or HTTP 4xx), 🔴 offline (HTTP 5xx or no answer), with the
response time. Websites with the same group share one embed; the others get
their own. The board is one message (up to 10 embeds each) that the bot edits
after every check; the first embed counts down to the next check.

## Settings (per bot)

Status channel, interval (1 minute to 24 hours), "slow from" limit, language
of the board, websites (name, address, group) and group descriptions. A new
website is checked within a minute.

## Block

**Website status** (`plugin.plugin_websitestatus.site_status`): the last
result of a website by name: `{Var}` (online / warning / offline),
`.emoji`, `.name`, `.url`, `.latency`, `.code`, `.checked`, `.color`. Ports
`unchecked` and `not_found`.

## SDK permissions

`http.check` (status and latency of public websites only, never the page or
the home network), `storage`, `scheduler`, `discord.messages.send`,
`discord.messages.edit`.

Ported from the v2 Website Status Check plugin 3.0.0: the own tables became
plugin settings and storage; the separate messages per website became one
board message.
