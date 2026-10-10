// Service "tasks" ("scheduler"): bothub.json "services.tasks".
//   link_poll (every 1m): finishes the Quick Connect links of /jellyfin-link,
//   gives the linked role and tells the member by DM.
//   library_options (every 30m): the "Server:Library" list of the settings.
import { pollLinks } from './accounts.js';
import { refreshLibraryOptions } from './jellyfin.js';
import { setting } from './util.js';

export const tasks = {
  async library_options(ctx) {
    await refreshLibraryOptions(ctx);
  },
  async link_poll(ctx) {
    const done = await pollLinks(ctx);
    const role = setting(ctx, 'linked_role', null);
    for (const d of done) {
      if (role?.id && d.guild) await ctx.role.addToMember(d.guild, d.userId, role.id, 'Jellyfin account linked').catch((err) => ctx.logger.warn(`linked role: ${err?.message ?? err}`));
      await ctx.message.dm(d.userId, `✅ Your Jellyfin account **${d.account.username}** is linked.`).catch(() => undefined);
    }
  },
};
