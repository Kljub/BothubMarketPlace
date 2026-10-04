// The confirm / cancel buttons of /backup restore and /backup clone.
import { list } from './backups.js';

export const components = {
  async cancel(ctx, ev) {
    if (ev.user.id !== ev.data) return ctx.interaction.reply(ev.handle, '❌ Not your question.', { ephemeral: true });
    await ctx.interaction.update(ev.handle, { content: 'Cancelled.', components: [] });
  },

  async confirm(ctx, ev) {
    const [from, index, mode, user] = String(ev.data).split(':');
    if (ev.user.id !== user) return ctx.interaction.reply(ev.handle, '❌ Not your question.', { ephemeral: true });
    const b = (await list(ctx, from))[Number(index)];
    if (!b || !ev.guildId) return ctx.interaction.update(ev.handle, { content: '❌ The backup is gone.', components: [] });
    await ctx.interaction.update(ev.handle, { content: '⏳ Restoring… this can take a few minutes. You get the result by DM too.', components: [] });
    void ctx.guild
      .restore(ev.guildId, b.file, { mode, parts: ['roles', 'channels', 'emojis', 'settings', ...(b.counts?.bans ? ['bans'] : [])] })
      .then(async (r) => {
        const text = `✅ **Restore done** (${r.mode})\nCreated: roles **${r.created.roles}**, channels **${r.created.channels}**, emojis **${r.created.emojis}**, bans **${r.created.bans}**${r.mode === 'replace' ? `\nDeleted: roles **${r.deleted.roles}**, channels **${r.deleted.channels}**` : ''}${r.failed.length ? `\nProblems (${r.failed.length}):\n${r.failed.slice(0, 10).map((f) => `• ${f}`).join('\n')}` : ''}`;
        await ctx.interaction.editReply(ev.handle, text.slice(0, 1900)).catch(() => undefined);
        await ctx.message.dm(user, text.slice(0, 1900)).catch(() => undefined);
      })
      .catch(async (err) => {
        const text = `❌ Restore failed: ${err?.message ?? err}`;
        await ctx.interaction.editReply(ev.handle, text).catch(() => undefined);
        await ctx.message.dm(user, text).catch(() => undefined);
      });
  },
};
