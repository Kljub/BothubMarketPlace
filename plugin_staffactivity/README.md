# Staff Activity

Who of your staff is on duty right now, on a live board in a channel.

- `/duty-on [note]` 🟢, `/duty-idle [note]` 🟡, `/duty-off` 🔴.
- **Teams** (settings): e.g. Support and Admins, each with its role. Only
  members with a team role can set a status; the board lists each team with
  its members, on duty first, with "since" and the note.
- **Board:** one message in the board channel, edited on every change; the
  title counts who is on duty and idle, the colour shows if anyone is.
- **Auto off:** a status older than the set hours turns off by itself.
- English or German board.

The task refreshes the board every 5 minutes. Listing the members of the
team roles needs the bot to see the members (Server Members Intent).
