# Criminal

`/steal user`: tries to rob another member. On success a share of their
balance (capped by "highest loot") goes to the thief; when caught the thief
pays a fine (to nobody or, if set, to the victim). A cooldown per member
keeps it from being spammed. Balances come from the Economy module.

Settings: success chance, loot share, highest loot, fine share, fine to the
victim, cooldown, currency name.

SDK permissions: `modules.economy.balance.read`, `modules.economy.balance.write`,
`storage`, `discord.interactions.reply`, `discord.members.read`.

Ported from the v2 Criminal plugin; cooldown, loot cap and "fine to the
victim" are new.
