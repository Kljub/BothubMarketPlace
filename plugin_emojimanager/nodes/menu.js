// Node plugin.plugin_emojimanager.menu: answers the command with a private
// menu (only the member sees it): select menus of 25 emojis, pages of 100. Picking one
// posts it in the channel (components.pick). With a name it sends that
// emoji right away. Ports: replied, sent, not_found, empty, next (no command
// behind the run: results only).
import { emojiList, MENU_MAX, PAGE_SIZE } from '../services/emojis.js';

/**
 * One page of the menu: up to 4 select menus of 25 emojis (100) and, with
 * more emojis, buttons to the previous and next page. Any number of emojis.
 */
export function menuPage(list, userId, page) {
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = list.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
  const rows = [];
  for (let i = 0; i < slice.length; i += MENU_MAX) {
    const part = slice.slice(i, i + MENU_MAX);
    rows.push([{
      type: 'select', key: 'pick', data: `${userId}:${rows.length}`,
      placeholder: `Choose an emoji… (${part[0].name} – ${part[part.length - 1].name})`,
      options: part.map((e) => ({ label: e.name, value: e.name, description: e.source === 'server' ? 'Server emoji' : undefined })),
    }]);
  }
  if (pages > 1) {
    rows.push([
      { key: 'page', data: `${userId}:${p - 1}`, label: '◀', style: 'secondary', disabled: p === 0 },
      { key: 'page', data: `${userId}:${p + 1}`, label: '▶', style: 'secondary', disabled: p >= pages - 1 },
    ]);
  }
  const content = pages > 1 ? `😀 Pick an emoji (page ${p + 1} of ${pages}, ${list.length} emojis):` : '😀 Pick an emoji:';
  return { content, components: rows };
}

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
  await ctx.interaction.reply(interaction, menuPage(list, String(vars['user.id'] ?? ''), 0), { ephemeral: true });
  return { port: 'replied', results: { '': names.map((n) => `:${n}:`).join(' '), '.count': String(list.length) } };
}

/** Page buttons of the menu: only the member who opened it. */
export async function page(ctx, ev) {
  const [owner, raw] = String(ev.data ?? '').split(':');
  if (owner && ev.user.id !== owner) {
    await ctx.interaction.reply(ev.handle, 'This is not your menu. Open your own with /emoji-menu.', { ephemeral: true });
    return;
  }
  const list = await emojiList(ctx, ev.guildId ?? '');
  await ctx.interaction.update(ev.handle, menuPage(list, ev.user.id, Number(raw) || 0));
}

/** Select of the menu: only the member who opened it; posts the emoji publicly. */
export async function pick(ctx, ev) {
  const owner = String(ev.data ?? '').split(':')[0];
  if (owner && ev.user.id !== owner) {
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
