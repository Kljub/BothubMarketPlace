// Node plugin.plugin_emojimanager.menu: answers the command with a private
// select menu (only the member sees it) of up to 25 emojis. Picking one
// posts it in the channel (components.pick). With a name it sends that
// emoji right away. Ports: replied, sent, not_found, empty, next (no command
// behind the run: results only).
import { emojiList, MENU_MAX } from '../services/emojis.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function menu(ctx, { config, vars, interaction }) {
  const guildId = String(vars['server.id'] ?? '');
  // A name: send that emoji right away (port sent, or not_found).
  const wanted = String(config.name ?? '').trim();
  if (wanted) {
    const { findEmoji, sendEmoji } = await import('../services/emojis.js');
    const emoji = await findEmoji(ctx, guildId, wanted);
    if (!emoji) return { port: 'not_found', results: { '': wanted } };
    const channelId = String(vars['channel.id'] ?? '');
    if (!/^\d{17,20}$/.test(channelId)) throw new Error('No channel to send the emoji to.');
    await sendEmoji(ctx, channelId, guildId, emoji, String(vars['user.id'] ?? ''));
    if (interaction) await ctx.interaction.reply(interaction, `✅ **:${emoji.name}:** sent.`, { ephemeral: true });
    return { port: 'sent', results: { '': emoji.name, '.count': '1' } };
  }
  const list = await emojiList(ctx, guildId);
  const names = list.map((e) => e.name);
  if (!list.length) return { port: 'empty', results: { '.count': '0' } };
  if (!interaction) return { port: 'next', results: { '': names.map((n) => `:${n}:`).join(' '), '.count': String(list.length) } };
  const shown = list.slice(0, MENU_MAX);
  await ctx.interaction.reply(interaction, {
    content: list.length > MENU_MAX ? `😀 Pick an emoji (the first ${MENU_MAX} of ${list.length}; others with /emoji-menu show name):` : '😀 Pick an emoji:',
    components: [[{
      type: 'select', key: 'pick', data: String(vars['user.id'] ?? ''), placeholder: 'Choose an emoji…',
      options: shown.map((e) => ({ label: e.name, value: e.name, description: e.source === 'server' ? 'Server emoji' : undefined })),
    }]],
  }, { ephemeral: true });
  return { port: 'replied', results: { '': names.map((n) => `:${n}:`).join(' '), '.count': String(list.length) } };
}

/** Select of the menu: only the member who opened it; posts the emoji publicly. */
export async function pick(ctx, ev) {
  if (ev.data && ev.user.id !== ev.data) {
    await ctx.interaction.reply(ev.handle, 'This is not your menu. Open your own with /emoji-menu.', { ephemeral: true });
    return;
  }
  const { findEmoji, sendEmoji } = await import('../services/emojis.js');
  const emoji = await findEmoji(ctx, ev.guildId, ev.values?.[0]);
  if (!emoji || !ev.channelId) {
    await ctx.interaction.update(ev.handle, { content: '❌ This emoji is gone.', components: [] });
    return;
  }
  try {
    await sendEmoji(ctx, ev.channelId, ev.guildId ?? '', emoji, ev.user.id);
    await ctx.interaction.update(ev.handle, { content: `✅ **:${emoji.name}:** sent.`, components: [] });
  } catch (err) {
    await ctx.interaction.update(ev.handle, { content: `❌ Could not send it here (${String(err?.message ?? err)}).`, components: [] });
  }
}
