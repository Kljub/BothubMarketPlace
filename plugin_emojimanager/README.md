# Emoji Manager

Members open a private menu with `/emoji-menu show` (only they see it), pick
an emoji, and the bot posts it big in the channel. `/emoji-menu show name`
sends one right away.

## Commands

- `/emoji-menu show [name]`: the menu, or one emoji by name.
- `/emoji-menu add name image`: adds an emoji; `image` is a file you attach
  (PNG, GIF, WEBP or JPEG, max. 2 MB). The bot stores it in the plugin files.
- `/emoji-menu delete name`: deletes an emoji of the list and its image.

Add and delete are for the members of the "Who may add and delete emojis"
access rule (default: "Manage Expressions"). They change the same list as
the settings page.

## Settings (per bot)

- **Emojis**: name + image. Upload the image on the dashboard, or give an
  https link instead.
- **Who may add and delete emojis**: access rule for add and delete.
- **Server emojis**: also offer the server's own custom emojis.
- Show who sent it, embed color.

The menu shows the first 25 (Discord's limit per menu); every emoji works
by name. Uses are counted per server.

## SDK permissions

`storage` (use counts), `storage.files` (uploaded images),
`discord.messages.send`, `discord.messages.files` (posts uploaded images),
`discord.interactions.reply`, `discord.emojis.read` (server emojis).

## Blocks

- **Emoji menu** (`plugin.plugin_emojimanager.menu`): private menu as the
  command's answer; ports replied, empty, next, sent, not_found.
- **Send emoji** (`plugin.plugin_emojimanager.send`): one emoji by name into
  a channel; results name, image, message ID, use count.
- **Manage emojis** (`plugin.plugin_emojimanager.manage`): add (image from a
  Discord attachment or an https link) or delete; answers the command itself.

## Changes

- 1.1.0: images are uploaded (dashboard and `/emoji-menu add`), posted as
  attachments; `/emoji-menu` became `/emoji-menu show`, new `add` and
  `delete`. Links of 1.0.0 keep working.
- 1.0.0: port of the v2 Emoji Manager 3.0.0 with image links.

Not in this version: the use counts on the dashboard.
