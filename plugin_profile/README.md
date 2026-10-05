# Profile

Profile cards for members: `/profile [member]` shows a card with about me,
pronouns, age, location, hobbies and favorites (game, movie or series,
music, food) and an own color. `/profile-edit [about|favorites]` opens a
form filled with the saved values; the buttons under an own card do the
same and can delete the profile.

The profiles are the Data Storage variable `member_profile` (one object per
member and server), so admins can see and change them under Data Storage.

SDK permissions: `data.variables`, `discord.interactions.reply`,
`discord.modals`, `discord.members.read` (name and avatar on the card).

## Blocks

- **Show profile** (`plugin.plugin_profile.show`): member in; results
  `{Var}` (display name), `.about`, `.empty`. Ports: replied, next, empty.
- **Edit profile** (`plugin.plugin_profile.edit`): opens the form (part
  about or favorites). Ports: opened, failed.
