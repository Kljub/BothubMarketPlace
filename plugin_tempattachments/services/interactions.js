// The "Access" button and the password modal.
import { byId, denied, grant, hashPassword, refresh } from './files.js';

async function open(ctx, ev, f) {
  const no = await denied(ctx, f, ev.user.id);
  if (no) {
    await ctx.interaction.reply(ev.handle, no.reason, { ephemeral: true });
    if (no.close) await refresh(ctx, f, true);
    return false;
  }
  return true;
}

export const components = {
  async access(ctx, ev) {
    const f = await byId(ctx, ev.data);
    if (!f) {
      await ctx.interaction.reply(ev.handle, '❌ This file no longer exists.', { ephemeral: true });
      return;
    }
    if (!(await open(ctx, ev, f))) return;
    if (f.hash) {
      await ctx.interaction.showModal(ev.handle, { key: 'password', data: f.id, title: `Password for ${f.name}`.slice(0, 45), fields: [{ key: 'password', label: 'Password', style: 'short', required: true, max: 100 }] });
      return;
    }
    await grant(ctx, f, ev.handle, ev.user.id);
  },
};

export const modals = {
  async password(ctx, ev) {
    const f = await byId(ctx, ev.data);
    if (!f) {
      await ctx.interaction.reply(ev.handle, '❌ This file no longer exists.', { ephemeral: true });
      return;
    }
    if (!(await open(ctx, ev, f))) return;
    if (hashPassword(ctx, f.salt, ev.fields?.password ?? '') !== f.hash) {
      await ctx.interaction.reply(ev.handle, '❌ Wrong password.', { ephemeral: true });
      return;
    }
    await grant(ctx, f, ev.handle, ev.user.id);
  },
};
