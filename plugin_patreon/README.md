# Patreon Linking

Version 1.0.0

Patreon tiers become Discord roles. Patrons who connected Discord in their
Patreon settings get the role of their tier on every server of the bot,
automatically: they never sign in anywhere else, because Patreon itself
tells the creator's API which Discord account belongs to a patron.

## Setup

1. Patreon → Creators → [Clients & API Keys](https://www.patreon.com/portal/registration/register-clients):
   create a client and copy the **Creator's Access Token**.
2. BotHub → Admin → API / Secrets: add it as `PATREON_CREATOR_TOKEN` and
   share it with this plugin.
3. Plugin settings: tier roles, optional roles for every active patron and
   for former patrons.
4. Optional, for changes within seconds: Patreon → Clients & API Keys →
   Webhooks: add the webhook URL of the plugin page (`patreon`) with the
   triggers `members:pledge:create`, `members:pledge:update`,
   `members:pledge:delete`.

Patrons connect Discord in Patreon under Settings → Connected apps →
Discord. `/patreon` tells members how when no pledge is found.

## How roles are given

- **Tier roles**: by tier name as on Patreon (or its ID), or, without a
  name, by a minimum monthly amount. A patron gets every role they fit.
- **Patron role**: every active patron.
- **Former patron role**: ended pledges and declined payments.
- With "take roles away" (default) the roles of an old tier go when the
  tier changes or the pledge ends.
- A patron who joins a server later gets the roles of that server at once.

A full sync reads every patron (200 per page, a few pages per minute) every
15 minutes to 3 hours; members who left the campaign lose the roles at the
end of a pass. Webhooks update one patron at once in between.

New patrons can be announced in a channel (not on the very first sync, so
existing patrons are not announced); a log channel gets a line for every
start, tier change and end.

## Commands

- `/patreon [member]`: the pledge from the last sync: status, tiers, amount,
  total support, patron since.
- `/patreon-sync`: starts a full sync now.

## Blocks

**Patreon pledge** (`plugin.plugin_patreon.status`): `{Var}` (status),
`.tiers`, `.amount`, `.active`. Ports `replied`, `next`, `not_found`.

**Patreon sync now** (`plugin.plugin_patreon.sync_now`): ports `replied`,
`next`, `failed`.

## SDK permissions

`secrets.use` (the creator token, sent by the bot as Bearer header; the
plugin never sees it) to `www.patreon.com`, `discord.roles.assign`,
`webhooks.inbound` (pledge changes), `discord.events.members` (patrons who
join a server), `storage`, `scheduler`, `discord.messages.send`
(announcements, log), `discord.interactions.reply` (commands).

Not tested against a real campaign yet (no creator token available).
