# Wichteln

Secret Santa for a server.

- `/wichteln [title] [budget] [date]` posts a round with buttons (needs
  Manage Server; the bot owner can change that in the command). The member
  who starts it is in from the start and is the host.
- **Join** / **Leave**: members join with one click; the list in the embed
  shows who is in (max. 100).
- **Wish list**: a member writes what they would like (optional, max. 300
  characters); the giver gets it with the draw.
- **Draw names** (host only, from 3 members): the bot draws a shuffled circle,
  so nobody draws themselves and everybody gets exactly one present. Every
  member gets a DM: whom they give a present to, the wish list, budget and
  date.
- Closed DMs: the host is told privately who got no DM; those members click
  **Who do I give to?** in the round's message and see their name privately.
- **Cancel** (host only) ends the round before the draw.

DMs a draw cannot send within a few seconds go out with the task `deliver`
(every minute). Rounds are removed 90 days after the start (task `cleanup`).

Settings: language of the messages (German or English) and the embed color.

## SDK permissions

`storage`, `scheduler`, `discord.messages.send` (the DMs),
`discord.interactions.reply`, `discord.modals` (the wish list).
