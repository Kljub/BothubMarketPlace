# Tic Tac Toe

`/tictactoe [opponent] [bet]`: without an opponent against the bot (it wins
when it can, else blocks, else takes the centre or a corner); with one as a
duel the opponent accepts first. Bets come from the Economy module: against
the bot a win pays twice the bet and a draw gives it back; in a duel the
winner gets both bets. A game untouched for 5 minutes ends and pays back.

Settings: lowest and highest bet, currency name.

SDK permissions: `modules.economy.balance.read`, `modules.economy.balance.write`,
`storage`, `scheduler`, `discord.interactions.reply`, `discord.members.read`.
