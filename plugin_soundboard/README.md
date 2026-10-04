# Soundboard

Sound clips members play in their voice channel.

- `/soundboard` posts a panel with a button per sound (max. 25); a click
  plays it in the clicker's voice channel.
- `/soundboard-play sound`, `/soundboard-list`, `/soundboard-stop`.
- Sounds are listed on the plugin's settings page (with a player); upload
  new ones there, or with `/soundboard-add name file`, and remove with
  `/soundboard-remove name` (need "Manage Server"): mp3, ogg, wav or webm up
  to 8 MB, stored by BotHub.

The bot leaves the voice channel a minute after the last sound. While other
audio plays on the server (e.g. the music module) a sound waits its turn.
Settings: volume.

## SDK permissions

`storage`, `storage.files`, `scheduler`, `discord.voice.connect`,
`discord.voice.speak`, `discord.interactions.reply`, `discord.members.read`
(the member's voice channel), `discord.guilds.read` (idle check).

Ported from the v2 Soundboard plugin: uploads moved from the dashboard to
`/soundboard-add`; the panel is new.
