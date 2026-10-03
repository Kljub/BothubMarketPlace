// Service "tasks" ("scheduler"): bothub.json "services.tasks".
//   link_poll (every 1m): finishes the plex.tv logins of /plex-link, gives
//   the linked role and tells the member by DM.
import { pollLinks } from './accounts.js';
import { setting } from './util.js';

export const tasks = {
  async link_poll(ctx) {
    const done = await pollLinks(ctx);
    const role = setting(ctx, 'linked_role', null);
    for (const d of done) {
      if (role?.id && d.guild) await ctx.role.addToMember(d.guild, d.userId, role.id, 'Plex account linked').catch((err) => ctx.logger.warn(`linked role: ${err?.message ?? err}`));
      await ctx.message.dm(d.userId, `✅ Your Plex account **${d.account.username}** is linked.`).catch(() => undefined);
    }
  },
};
