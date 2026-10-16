# Roblox Verification

Version 1.0.0

Members link their Roblox account and get roles for it: a verified role,
roles by group rank (rank binds) and by game passes, and their Roblox name
as nickname. Uses the public Roblox web APIs; no key needed.

## How members verify

1. `/roblox-verify username` (or the button "Verify with Roblox" of the
   panel, which asks for the username in a form).
2. The bot answers privately with a phrase like `bothub river comet maple
   ember`: the member puts it into their Roblox profile ("About") and
   presses **Done** (or runs `/roblox-verify` again) within 30 minutes.
3. The bot finds the phrase in the profile and links the account. The
   phrase can be removed afterwards.

The phrase is made of words because Roblox hides numbers in profiles. One
Roblox account belongs to one member; a link holds on every server of the
bot.

## Roles

- **Verified role**, and optionally an **unverified role** for new members
  that goes after the verification.
- **Rank binds**: a Roblox group ID, a rank range (1-255, 255 = owner; from
  rank 0 also members outside the group) and a role.
- **Game passes**: a game pass ID and a role (the member's Roblox inventory
  must be public).
- **Nickname**: username, display name, or "Display name (@username)".

Roles are taken away when a rank or a game pass no longer fits (setting).
The bot updates everyone's roles every 6 to 48 hours (in small steps every
10 minutes), a member who joins a server gets their roles at once, and
`/roblox-update [member]` updates one member now.

## Commands

- `/roblox-verify [username]`
- `/roblox-profile [member] [username]`: avatar, names, join date,
  friends, followers, groups, linked Discord member.
- `/roblox-update [member]`
- `/roblox-unlink`

## Blocks

**Roblox verify** (`plugin.plugin_robloxverify.verify`), **Roblox profile**
(`plugin.plugin_robloxverify.profile`), **Roblox update roles**
(`plugin.plugin_robloxverify.update`, mode update or unlink).

## SDK permissions

`http.outbound` (users, groups, inventory, thumbnails and friends of
roblox.com), `discord.roles.assign`, `discord.members.nicknames`,
`discord.members.read` (current roles), `discord.messages.send` and
`discord.messages.edit` (panel, log), `discord.interactions.reply`,
`discord.modals` (username form), `discord.events.members` (joins),
`storage`, `scheduler`.
