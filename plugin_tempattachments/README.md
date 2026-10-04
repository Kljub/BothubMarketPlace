# Temp Attachments

Files or texts behind an access button. `/tempfile-create` posts a message
with a "📎 Access" button; a click answers privately with the text and the
file. Rules per file: password (asked in a modal), available from / until
(UTC, shown in each reader's local time), max. uses, once per member, and
roles (`/tempfile-allowrole`, `/tempfile-removerole`). `/tempfile-delete`
removes it. Expired buttons switch off on their own.

The commands need "Manage Server" and are hidden for others (change it in
the command's permissions block like any Custom Command).

## SDK permissions

`storage`, `storage.files` (the file, up to 8 MB, any type but programs),
`scheduler`, `discord.messages.send`, `discord.messages.edit`,
`discord.interactions.reply`, `discord.modals`, `discord.members.read`
(role check).

Ported from the v2 TempAttachments plugin 2.0.0: the own tables became
plugin storage; the file is stored by BotHub instead of a Discord link that
runs out after about a day.
