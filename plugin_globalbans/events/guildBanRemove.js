// Event guildBanRemove ("discord.events.members"): payload 'server.id',
// 'user.id', 'user.name'. With "sync_unban" an unban on a source server
// lifts the global ban everywhere.
import { enqueue, isSource, ownUnban, setting, work } from '../services/bans.js';

/** @param {import('@bothub/sdk').PluginContext} ctx */
export default async function guildBanRemove(ctx, payload) {
  const guild = payload['server.id'];
  const user = payload['user.id'];
  if (!guild || !user || setting(ctx, 'sync_unban', false) !== true) return;
  if (!isSource(ctx, guild) || (await ownUnban(ctx, user))) return;
  // Only users the plugin banned globally.
  if ((await ctx.storage.get(`b:${user}`)) === null) return;
  await enqueue(ctx, 'unban', user, guild, '');
  await work(ctx);
}
