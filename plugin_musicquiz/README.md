# Music Quiz

Version 1.0.0

Guess the song. `/musicquiz` starts a quiz in the channel: each round a
30 second clip plays in the voice channel and a message shows four answers
as buttons. The first member with the right answer wins the round (1 point);
a wrong guess locks that member out until the next round. The round message
then shows the song, the artist, the cover and a Deezer link, and the next
round starts. After the last round the bot posts the final standings.

## Songs

The clips are the 30 second previews of the public Deezer API (no key, no
account):

- Charts and genre charts: pop, rap, rock, dance, R&B, alternative, electro,
  metal, German music, latin, country, jazz, classical, films & games, kids
- Decades: 60s, 70s, 80s, 90s, 2000s, 2010s (the biggest Deezer playlist of
  that decade)
- Any public Deezer playlist: `/musicquiz playlist:https://www.deezer.com/playlist/…`

Songs repeat no artist while the source has enough different ones. The
question is the song title, the artist, or mixed.

## How the round ends

- the first right answer,
- every player guessed wrong (players: who guessed in this quiz, and who
  started it),
- "⏭️ Reveal" (players only),
- or, when nobody solves it, the round time (30-90 s, setting). The plugin
  checks that once a minute, so a forgotten round ends up to a minute later.

## Commands

- `/musicquiz [genre] [rounds] [mode] [playlist]`: starts the quiz; the
  member must be in a voice channel, the bot joins it.
- `/musicquiz-stop`: ends the quiz. The starter can do so at once, others
  three minutes after the last round started. "⏹️ Stop quiz" on the round
  message does the same.
- `/musicquiz-top [by]`: the server leaderboard by points, right answers or
  quiz wins.

One quiz runs per server at a time.

## Needs the Music module

The clips go into the queue of the bot's Music module (the same queue as
`/play`), with the title "🎵 Music Quiz · 2/10" so the queue does not give
the answer away. Switch the Music module on for the bot. Songs that members
queued before play first.

A round that ends early does not stop its clip: the rest of the revealed
song plays, then the next clip. Plugins cannot skip songs of the music
queue yet.

## Settings (per bot)

Language (English, German), default songs, default question (title, artist,
mixed), default rounds (1-15), round time.

## Blocks

**Start music quiz** (`plugin.plugin_musicquiz.start`): config `genre`,
`mode`, `rounds`, `playlist`. `{Var}` (answer), `.rounds`, `.error`. Ports
`replied`, `next`, `failed`.

**Stop music quiz** (`plugin.plugin_musicquiz.stop`): `{Var}` (answer).

**Music quiz leaderboard** (`plugin.plugin_musicquiz.top`): config `by`
(points, correct, wins). `{Var}` (text), `.first` (ID of the first).

## SDK permissions

`modules.music.queue` (the clips), `http.outbound` (api.deezer.com and the
preview host cdnt-preview.dzcdn.net), `storage` (game, leaderboard),
`scheduler` (round time), `discord.messages.send`, `discord.messages.edit`
(round messages), `discord.interactions.reply` (commands and buttons).
