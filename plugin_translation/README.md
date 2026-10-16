# Translation

Version 1.0.0

Translate messages with [DeepL](https://www.deepl.com/pro-api) in 32
languages.

## Quick-Translation

React with a flag on a message (🇩🇪, 🇫🇷, 🇯🇵, 🇧🇷 …): the bot posts the
message in the language of that flag, with a link to the original and the
detected source language. Extra trigger emojis (e.g. 🌐) translate into a
target language of the settings. Each message is translated once per
language. Limit it to channels and roles; answer in the channel or by DM to
the member who reacted.

## /translate

`/translate text [to]`: `to` is a code (`DE`, `EN-US`, `pt-br`), a name
(`French`) or empty for the default language. The answer shows original and
translation; it can be private.

## Setup

1. Create a DeepL API key (the free plan has 500,000 characters a month).
2. BotHub → Admin → API / Secrets: add `DEEPL_API_KEY` with the value
   `DeepL-Auth-Key <your key>` (DeepL's header format) and share it with this
   plugin. The plugin never sees the key; the bot adds it to the request.
3. Plugin settings: plan (free keys end in `:fx`), daily limit, characters
   per translation.

## Settings (per bot)

Language of the answers, DeepL plan, translations per day (0: no limit),
characters per translation, flag reactions on/off, extra trigger emojis and
their target language, Quick-Translation channels and roles, answer in the
channel or by DM, default language of /translate, private /translate answers.

## Block

**Translate** (`plugin.plugin_translation.translate`): config `text`, `to`.
`{Var}` (translation), `.from`, `.to`, `.error`. Ports `replied`, `next`,
`failed`.

## SDK permissions

`secrets.use` (the DeepL key to api-free.deepl.com / api.deepl.com),
`discord.events.messages` (reactions), `discord.messages.read` (the message
to translate), `discord.members.read` (role check), `discord.messages.send`,
`discord.interactions.reply`, `storage` (daily count, translated messages).

Not possible yet: deleting the original message (plugins may delete only
the bot's own messages).
