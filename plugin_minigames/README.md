# Minigames

Games for the Economy module of the bot. Bets and rewards use the same
balances as `/balance`.

| Command | Game |
|---|---|
| `/dicebet [opponent] [bet]` | Both roll two dice, the higher sum wins the pot; a tie pays back. Without an opponent against the bot. |
| `/5dice bet` | Five dice, one roll. Five of a kind 30×, four 6×, full house 4×, straight 4×, three of a kind and two pairs 1.5× (the bet included). |
| `/high-low bet` | Higher or lower than the card? Every right guess multiplies the prize by the fair odds × the payout rate; cash out any time, at most 10 rounds. |
| `/scratchcard` | A card for a fixed price; scratch nine fields. Three 💎 20×, 7️⃣ 5×, 🍒 2×, 🍋 1×. |
| `/dos opponent bet` | Double or steal: both pick in secret. Both double: both win their bet. One steals: the pot to the stealer. Both steal: both lose. |
| `/mastermind` | Crack a code of 4 colours in 10 tries. |
| `/hangman` | Guess the word letter by letter, 6 mistakes. Own word list in the settings. |
| `/matchpairs` | Find the 10 pairs among 20 cards. |
| `/lightsout` | Switch off all 25 lights; a light toggles its neighbours too. |
| `/beg` | A chance for a few coins, with a cooldown. |
| `/fish` | A catch from boot (0) to shark (300–600), with a cooldown. |
| `/2048` | Slide and merge the tiles until a 2048 tile appears (puzzle reward). |
| `/connect4 [opponent] [bet]` | Four in a row against a member (optional bet) or the bot. |
| `/chess [opponent]` | Chess against a member or the bot; full rules. |
| `/chess-move <move>` | A move: `e2e4`, `e7e8q`, `Nf3`, `exd5`, `O-O`. |
| `/trivia [difficulty]` | A quiz question (opentdb.com); the first right answer wins the trivia reward. |

Solved puzzles (mastermind, hangman, match pairs, lights out) pay a reward,
once per cooldown per member. Games untouched for 10 minutes end: duels pay
the bets back, higher or lower cashes out, a scratch card pays its prize.

Settings: payout rate of higher or lower, scratch card price, puzzle reward
and cooldown, begging (chance, amounts, cooldown), fishing (cooldown, value),
own hangman words, lowest and highest bet, currency name.

SDK permissions: `modules.economy.balance.read`, `modules.economy.balance.write`,
`storage`, `scheduler`, `discord.interactions.reply`, `discord.members.read`.
