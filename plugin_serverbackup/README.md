# Server Backup

Backups of a whole Discord server: roles with their permissions, channels
with their permission overwrites, topic, slowmode, bitrate and user limit,
emojis, server settings and (optional) bans.

- `/backup create`: backs up this server (also on a schedule: daily or on a
  weekday at a set time, every server the bot is on)
- `/backup info`, `/backup delete [number]`
- `/backup restore [number] [mode]`: builds the backup back into this server
- `/backup clone source [number] [mode]`: copies another server's backup
  (the bot must be on both) into this one

Restore and clone ask first and report by DM. Mode **add** creates roles
and channels next to what is there; **replace** deletes the channels and
the roles the bot may manage first. Administrator is never granted again
(plugins may not hand it out); bot roles are skipped; channels that need a
Community server are made as text or voice channels. The bot needs Manage
Roles, Manage Channels, Manage Server, Manage Emojis and, for bans, Ban
Members, and its role must be above the roles it recreates.

Backups are JSON files of the plugin: download them on the plugin page under
**Files**. Settings: what to include, how many backups to keep per server,
schedule and time zone. The commands need "Manage Server".

SDK permissions: `discord.server.backup`, `discord.server.restore`,
`storage`, `storage.files`, `scheduler`, `discord.guilds.read`,
`discord.interactions.reply`, `discord.messages.send` (the DM report).

Ported from the v2 Server Backup plugin; restore and clone are new.
