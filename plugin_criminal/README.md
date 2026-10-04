# Criminal

`/steal user`: tries to rob another member. On success a share of their
balance (capped by "highest loot") goes to the thief; when caught the thief
pays a fine (to nobody or, if set, to the victim). A cooldown per member
keeps it from being spammed.

`/rob-bank user`: a bank heist with a crew. The leader opens a lobby, others
join with a button; once the crew is big enough the leader starts. Every
member above the smallest crew adds 5 % chance (at most 90 %). Success: a
share of the victim's bank (capped) is split evenly into the crew's wallets.
Caught: every member pays a fine of their wallet. After a heist the same
bank is safe for a while; lobbies end after 5 minutes.

Balances and banks come from the Economy module.

Settings: success chance, loot share, highest loot, fine share, fine to the
victim, cooldown; for heists the smallest crew, chance, loot share, highest
loot, fine and the protection time; currency name.

SDK permissions: `modules.economy.balance.read`, `modules.economy.balance.write`,
`modules.economy.bank.write` (heists), `storage`, `scheduler`,
`discord.interactions.reply`, `discord.members.read`.

Ported from the v2 Criminal plugin; cooldown, loot cap, "fine to the victim"
and the bank heist are new.
