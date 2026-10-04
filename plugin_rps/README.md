# Rock Paper Scissors

- `/rps choice [bet]`: one round against the bot. A win pays twice the bet,
  a tie pays it back.
- `/rps-duel opponent [bet]`: challenges a member. The opponent accepts (or
  declines), then both pick in the same message; each pick is confirmed
  privately, so nobody sees the other's choice. The winner gets both bets.
  Without both picks within 2 minutes the bets are paid back.

Bets come from the bot's Economy module (the same balances as `/balance`);
without a bet the Economy module is not touched. Settings: currency name
(only the text in the answers) and the highest bet.

## SDK permissions

`modules.economy.balance.read`, `modules.economy.balance.write`, `storage`,
`scheduler`, `discord.interactions.reply`, `discord.members.read` (no bots
as opponents).

Ported from the v2 RPS plugin: the duel state moved from memory to plugin
storage, so a bot restart keeps it (and pays back on timeout).
