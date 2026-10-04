# Minesweeper

`/minesweeper bet [mines]`: a field of 24 buttons with 1–23 mines (default
3). Every diamond raises the multiplier (the fair odds of finding that many
safe fields in a row, times the RTP setting); 🔥 cashes out, a mine loses
the bet. One round per member and server; a round untouched for 10 minutes
ends on its own (diamonds paid out, else the bet comes back).

Bets use the bot's Economy module. Settings: RTP, lowest and highest bet,
currency name.

SDK permissions: `modules.economy.balance.read`, `modules.economy.balance.write`,
`storage`, `scheduler`, `discord.interactions.reply`.

Ported from the v2 Minesweeper plugin (rounds moved from memory to plugin
storage, one Economy balance instead of several currencies).
