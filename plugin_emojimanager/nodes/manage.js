// Node plugin.plugin_emojimanager.manage: adds an emoji to the list or
// deletes one (/emoji-menu add, /emoji-menu delete). Only members the
// "managers" access rule of the settings page allows (default: Manage
// Expressions). The image of add is a Discord attachment (stored in the
// plugin files) or an https link. With a command behind the run the node
// answers it privately itself (port replied); without one the ports say what
// happened: done, denied, exists, not_found, full, bad_name, bad_image.
import { addEmoji, cleanName, deleteEmoji } from '../services/emojis.js';

const TEXTS = {
  denied: '⛔ You may not manage the emojis here.',
  exists: '❌ An emoji named **:{name}:** already exists.',
  not_found: '❓ No emoji named **:{name}:** in the list.',
  full: '❌ The list is full (50 emojis). Delete one first.',
  bad_name: '❌ Names use a-z, 0-9, _ and - (max. 32).',
  bad_image: '❌ That is no usable image (PNG, GIF, WEBP or JPEG, max. 2 MB).',
  added: '✅ **:{name}:** added. Send it with /emoji-menu show.',
  deleted: '🗑️ **:{name}:** deleted.',
};

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function manage(ctx, { config, vars, interaction }) {
  const action = config.action === 'delete' ? 'delete' : 'add';
  const name = cleanName(config.name);
  const done = async (port, text) => {
    if (interaction) await ctx.interaction.reply(interaction, TEXTS[text].replace('{name}', name), { ephemeral: true });
    return { port: interaction ? 'replied' : port, results: { '': name, '.reason': port } };
  };
  const guildId = String(vars['server.id'] ?? '');
  // Only on a server: in DMs the access check would allow everyone.
  if (!/^\d{17,20}$/.test(guildId)) return done('denied', 'denied');
  const access = await ctx.config.checkAccess('managers', { userId: String(vars['user.id'] ?? ''), guildId, channelId: String(vars['channel.id'] ?? '') || null });
  if (!access.allowed) return done('denied', 'denied');
  if (action === 'delete') return (await deleteEmoji(ctx, name)) ? done('done', 'deleted') : done('not_found', 'not_found');
  try {
    await addEmoji(ctx, name, config.image);
  } catch (err) {
    const reason = err?.reason;
    if (!['bad_name', 'exists', 'full', 'bad_image'].includes(reason)) throw err;
    return done(reason, reason);
  }
  return done('done', 'added');
}
