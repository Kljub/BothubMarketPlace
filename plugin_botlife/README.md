# BotLife

A life simulator in Discord, inspired by BitLife: be born, grow up, go to
school, study, work, fall in love, marry, have children, buy houses and cars,
break the law, go to prison and die, one year at a time. Then continue as
one of your children.

Version 1.0.0 · developer: BotHub · license: PolyForm-Noncommercial-1.0.0

## Playing

`/botlife` opens your life in a private panel (only you see it). Without a
life you are born now: random country, family and talents (options: gender,
first name).

- **🎂 Age +1**: a year passes: school, salary and costs, family, health,
  often an event with a choice (a bully, a party, a wallet, an investment, a
  mugger …). Decide before the next year.
- **💼 Occupation**: study harder or drop out (from 16); apply for jobs (part-
  time jobs from 14 while at school), work harder, ask for a raise, quit,
  retire (from 60). After high school: university (8 majors), then medical
  school, law school or a master's degree.
- **🎯 Activities**: gym, library, meditate, doctor, find love, make a friend,
  vacation, plastic surgery, casino, lottery, emigrate. Each counts up to 3
  times a year.
- **👪 People**: parents, siblings, friends, partner, spouse, children: spend
  time, talk, compliment, give gifts, argue, ask for money, propose, marry,
  break up, divorce, try for a baby.
- **🏠 Assets** (from 18): flats, houses, a villa, a mansion, cars. Houses
  change value over the years, cars lose value; both cost upkeep.
- **🦹 Crime** (dashboard switch): shoplifting, pickpocketing, burglary,
  stealing a car, robbing a bank. Caught means a fine or prison: work out,
  read, start a riot or try to escape.

Stats: ❤️ health, 😊 happiness, 🧠 smarts, ✨ looks (0-100 %). Illnesses come
and go; the doctor helps. Age and poor health raise the chance to die. At the
end: cause of death, net worth and a ribbon (Rich, Scholar, Criminal,
Family person, Lover, Happy, Fit, Centenarian, Tragic, Average). Continue as
a child (inherits a share of the estate, generation +1) or start a new life.

Money exists only in BotLife (no economy module).

- `/botlife-profile [member]`: a life as a public card.
- `/botlife-top [by]`: the server ranking by net worth, age or generations.

## Settings

Language (en/de, for new lives), currency symbol, allow crime, seconds
between two years (default 2: no clicking through a whole life in seconds),
obituary channel (a short obituary when a life ends).

## Blocks

| Block | Results | Ports |
|---|---|---|
| BotLife panel (`plugin.plugin_botlife.start`) | `{Var}` (name), `.age`, `.money`, `.alive`, `.generation` | replied, next, failed |
| BotLife profile (`plugin.plugin_botlife.profile`) | same | replied, next, not_found, failed |
| BotLife ranking (`plugin.plugin_botlife.top`) | `{Var}` (list), `.count` | replied, next, failed |

## SDK permissions

`storage` (one life per member and server, about 2 KB), `discord.messages.send`
(obituaries), `discord.interactions.reply` (panel, buttons, selects).

## Structure

```
services/engine.js        the rules: year, school, work, people, activities, crime, death
services/events.js        what may happen in a year (with choices)
services/data.js          countries, names, majors, jobs, activities, crimes, assets, illnesses
services/i18n.js          every text in English and German
services/view.js          the private panel and the public cards
services/interactions.js  buttons and selects
services/flow.js          storage, lock, obituary
services/blocks.js        /botlife, /botlife-profile, /botlife-top
```

BotLife is a free, non-commercial plugin inspired by BitLife (Candywriter);
it shares no code, names or art with it.
