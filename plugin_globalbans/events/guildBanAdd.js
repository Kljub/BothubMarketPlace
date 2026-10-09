// Event guildBanAdd ("discord.events.members"): payload 'server.id',
// 'server.name', 'user.id', 'user.name', 'user.bot', 'reason'.
import { enqueue, isSource, isTrusted, PREFIX, work } from '../services/bans.js';

/** @param {import('@bothub/sdk').PluginContext} ctx */
export default async function guildBanAdd(ctx, payload) {
  const guild = payload['server.id'];
  const user = payload['user.id'];
  const reason = String(payload.reason ?? '');
  // Bans of this plugin itself are not spread again.
  if (!guild || !user || reason.startsWith(PREFIX)) return;
  if (!isSource(ctx, guild) || isTrusted(ctx, user)) return;
  const from = payload['server.name'] ? `${payload['server.name']}` : guild;
  await enqueue(ctx, 'ban', user, guild, reason ? `${reason} (${from})` : `banned on ${from}`);
  await work(ctx);
}
