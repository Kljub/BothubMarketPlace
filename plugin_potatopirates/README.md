# Potato Pirates

The coding card game [Potato Pirates](https://potatopirates.game/) in
Discord: program your ships with loops and conditions, sink the other crews
or collect all 7 Potato Kings. 2 to 6 pirates, any mix of members and bots.

Version 1.0.0 · developer: BotHub · license: PolyForm-Noncommercial-1.0.0

## Playing

- `/potatopirates` opens a lobby in the channel. Members click **Join**, the
  host adds bots (**easy**, **medium**, **hard**) and clicks **Set sail**.
- `/potatopirates bots:2 difficulty:hard` starts at once against 2 bots.
- One game per channel. The table is one message everybody sees; **My hand**
  opens your private panel: put cards on ships, attack, play surprise cards,
  buy ships, move crew, end the turn.
- Every ship shows its program as Python-like code, so players see what
  `for`, `while` and `if/else` do:

```py
for i in range(2):
    for j in range(3):
        roast(target)  # -1
```

## Rules (base game)

- Start: 2 ships with 10 potatoes each, 5 cards. Draw 2 cards per turn.
- Per ship and turn: **either** put cards on it **or** attack with it. A ship
  holds 3 cards; control cards lie above action cards and repeat everything
  below them. After an attack the cards are used up and the ship stays in
  battle mode until the owner's next turn.
- Action cards: Roast 1, Mash 2, Fry 3 damage. Control cards: For 2/3/x/y
  times, While > 4/5/6, If < 4/5/6 + Else (hits every enemy ship).
- Surprise cards any time: Loot (2 random cards of a player), Hijack (an
  anchored enemy ship with its cards), Switch (1 ship: a new ship, 2: a card
  from the discard pile, 3: draw 3), Deny (cancels an attack or surprise card;
  a Deny can be denied).
- Potato King: everyone clicks **Potato King!**; the slowest pays the finder 2
  potatoes. 7 kings win, or being the last pirate with a ship.
- A ship with 0 potatoes sinks. 4 potatoes buy a new ship (plus 1 as its crew).
  A player without ships but with crew has until the end of the next turn to
  get a ship. A player removed by an attack gives the hand and the kings to
  the attacker.
- The two promo cards of the rulebook (Frying Dutchpan, S.S. Megachip) are a
  dashboard switch.

## The three match currencies

They exist only during a match and are gone when it ends:

| Currency | What it is |
|---|---|
| 🥔 Potatoes | the crew on your ships; a ship with 0 sinks |
| 💎 Crystals | energy: putting a card on a ship costs Roast 1, Mash 2, Fry 3, control 1; +3 per turn, max. 10 (dashboard) |
| ⛵ Ships | max. 3 per player (dashboard) |

## Bots

- **easy** plays random cards, attacks a random ship, rarely denies.
- **medium** builds the strongest program its crystals pay for, attacks the
  ship it hurts most, denies attacks that would sink it.
- **hard** also weighs If-Else across all enemy ships, hunts the player with
  most kings, keeps its crew even, saves Deny for big hits and counters a
  Deny against its own attacks.

Bots answer Deny windows and salutes at once (their salute time depends on
the level); a window waits for the human players until everybody let it run
or the time is up.

## Settings

Language (en/de), kings to win, ships per player, crystals on/off with start,
per turn and max., promo cards, short game (deck empty: most kings wins),
Deny window and salute in seconds, turn time in minutes (an absent player's
turn ends by itself). Lobbies close after 15 minutes, games nobody touched
for an hour close too.

## SDK permissions

`storage`, `scheduler`, `discord.messages.send`, `discord.messages.edit`,
`discord.interactions.reply`.

## Structure

```
services/cards.js         the 85 cards + 2 promo cards, crystal costs
services/engine.js        the rules (no Discord, no storage)
services/ai.js            the bots (easy, medium, hard)
services/auto.js          bots and windows move on until a human acts
services/flow.js          storage, lock, table refresh
services/view.js          table message, hand panel, program as code
services/interactions.js  buttons and selects
services/tasks.js         task "tick" (every minute: time limits)
services/i18n.js          game texts en/de
```

Potato Pirates is a game by Codomo. This plugin is a free, non-commercial
fan implementation for learning.
