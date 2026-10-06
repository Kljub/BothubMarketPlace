# Trading Cards

Members collect trading cards:

- **/cards open**: a pack (3 cards by default). Free once per cooldown
  (24 hours by default); before that it can cost coins of the Economy module
  (when a price is set). Rarer cards come out less often: common 60,
  uncommon 25, rare 10, epic 4, legendary 1 (only rarities that have cards).
- **/cards collection** [member]: the cards by rarity and the completion.
- **/cards show** card: the card with its picture.
- **/cards trade** member give want: a trade offer the other member accepts
  or declines (valid 15 minutes; both cards are checked again).
- **/cards gift** member card: gives one card away.

The cards are set on the dashboard: name, rarity, a picture (upload, drop
image files on the list, or an https link), set and description. There is
no limit to the number of cards.

## Blocks

Open a pack, Card collection, Show a card, Offer a trade, Gift a card
(`plugin.plugin_tradingcards.*`). Ports `replied`, `next`, `failed`.

## SDK permissions

`storage` (collections, cooldowns, trades), `storage.files` (card pictures),
`discord.interactions.reply`, `modules.economy.balance.write` (buying packs).
