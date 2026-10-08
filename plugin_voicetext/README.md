# Voice Text Link

Opens a text channel for the members of a voice channel.

- **Linked channels:** pick a voice channel and a text channel. Whoever joins
  the voice channel can see and write in the text channel; leaving hides it
  again. Hide the text channel for @everyone yourself.
- **Automatic text channels:** voice channels without a link get a hidden
  text channel next to them on the first join (name with `{voice}` and
  `{user}`); only the members in the voice channel see it, and it is deleted
  when the voice channel is empty. Can be limited to some voice channels or
  categories.
- **Greeting:** an optional message in the text channel when someone joins
  (`{user}`, `{voice}`).

The bot needs Manage Channels and Manage Roles (channel permissions) on the
server.
