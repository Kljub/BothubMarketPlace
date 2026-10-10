# Stock Market

A fictional stock market per server: prices move every interval, members buy and sell shares with Economy money.

## Commands

- `/stocks`: Shows the stock market with prices and changes
- `/stock-buy`: Buys shares of a stock
- `/stock-sell`: Sells shares of a stock
- `/portfolio`: Shows your shares and their worth

## Price board

Pick a channel in the setting **Price board channel** and save: the bot
posts the current market there at once and keeps that one message up to
date after every price change (checked every 5 minutes). If the message is
deleted or you pick another channel, a new board is posted.

License: PolyForm Noncommercial 1.0.0. Original: https://github.com/Kljub/BothubMarketPlace
