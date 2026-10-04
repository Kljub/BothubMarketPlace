# Casino

`/coinflip`, `/dice`, `/slots`, `/roulette`, `/blackjack` (hit, stand,
split once): bets from the bot's Economy module, every result with a
"🔄 Again" button for the same bet. Each game pays its fair odds (expected
value 1x the bet) times the RTP setting, so the house edge comes only from
RTP; blackjack cards are always fair and a push returns the bet. A blackjack
hand left for 10 minutes is played out as "stand".

Settings: RTP, lowest and highest bet, currency name. Each game is its own
command, so it can be switched on or off in Custom Commands.

SDK permissions: `modules.economy.balance.read`, `modules.economy.balance.write`,
`storage`, `scheduler`, `discord.interactions.reply`.

Ported from the v2 Casino plugin (one RTP for all games, one Economy balance
instead of several currencies; hands moved from memory to plugin storage).
