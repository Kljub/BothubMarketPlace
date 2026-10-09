# Global Bans

A user banned on one server of your bot is banned on every other server of
the bot too.

- **Automatic:** every ban (or only bans on the source servers you list)
  spreads to all servers of the bot, except the ones you leave out.
- **By hand:** `/globalban <user> [reason]` and `/globalunban <user>` (need
  Ban Members).
- **Unbans follow** (optional): unbanning a globally banned user on a source
  server unbans them everywhere.
- **Trusted users** are never banned globally.
- **Log channel:** a report after each global ban or unban, with the servers
  where it was not possible.

Bans the plugin makes itself carry the reason prefix `[Global Ban]` and are
not spread again. Many servers are worked through a few at a time (a task
goes on every minute). The bot needs Ban Members on every server, and its
role above the member.

Needs BotHub with the plugin events `guildBanAdd` / `guildBanRemove`
(October 2026 or newer).
