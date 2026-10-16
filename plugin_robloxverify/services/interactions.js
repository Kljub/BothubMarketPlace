// Service "interactions": the "Done" button after step 1 and the panel
// button "Verify with Roblox" with its modal (key "rv", data "done" or
// "start"; modal "rvm"), plus the panel itself (button mode).
import { lang, verify } from './verify.js';
import { RobloxError } from './roblox.js';
import { t } from './i18n.js';
import { readJson, writeJson } from './storage.js';
import { setting } from './util.js';

/** The answer of a verification step, with "Done" while a phrase waits. */
export function answer(ctx, out) {
  const L = lang(ctx);
  return out.pending
    ? { content: out.text, components: [[{ key: 'rv', data: 'done', label: t(L, 'btn.done'), emoji: '✅', style: 'success' }]] }
    : { content: out.text, components: [] };
}

async function step(ctx, ev, input) {
  const L = lang(ctx);
  try {
    return await verify(ctx, ev.guildId, ev.user.id, input);
  } catch (err) {
    if (!(err instanceof RobloxError)) throw err;
    return { text: `❌ ${t(L, err.key, err.params)}` };
  }
}

export const components = {
  async rv(ctx, ev) {
    const L = lang(ctx);
    if (!ev.guildId) return ctx.interaction.reply(ev.handle, t(L, 'err.server'), { ephemeral: true });
    if (ev.data === 'start') {
      return ctx.interaction.showModal(ev.handle, { key: 'rvm', title: t(L, 'modal.title'), fields: [{ key: 'name', label: t(L, 'modal.name'), style: 'short', required: true, min: 3, max: 40 }] });
    }
    // "Done": check the phrase; the private message is updated in place.
    const out = await step(ctx, ev, '');
    return ctx.interaction.update(ev.handle, answer(ctx, out));
  },
};

export const modals = {
  async rvm(ctx, ev) {
    const out = await step(ctx, ev, ev.fields?.name ?? '');
    return ctx.interaction.reply(ev.handle, answer(ctx, out), { ephemeral: true });
  },
};

/** Posts or updates the panel with "Verify with Roblox" (setting start = button). */
export async function syncPanel(ctx) {
  const L = lang(ctx);
  const channel = setting(ctx, 'start', 'command') === 'button' ? setting(ctx, 'panel_channel', null)?.id : null;
  const known = await readJson(ctx, 'panel', null);
  if (!channel) {
    if (known) {
      await ctx.message.delete(known.channel, known.message).catch(() => undefined);
      await ctx.storage.delete('panel');
    }
    return;
  }
  const message = {
    embeds: [{ color: '#e2231a', title: '🟥 Roblox', description: String(setting(ctx, 'panel_text', '') || t(L, 'panel.text')).slice(0, 4000) }],
    components: [[{ key: 'rv', data: 'start', label: t(L, 'btn.start'), emoji: '🔗', style: 'primary' }]],
  };
  if (known?.channel === channel && (await ctx.message.edit(channel, known.message, message).then(() => true, () => false))) return;
  if (known) await ctx.message.delete(known.channel, known.message).catch(() => undefined);
  const id = await ctx.message.send(channel, message);
  await writeJson(ctx, 'panel', { channel, message: id });
}
