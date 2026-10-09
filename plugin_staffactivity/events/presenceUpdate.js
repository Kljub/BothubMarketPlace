// Event presenceUpdate ("discord.events.members"): payload 'server.id',
// 'user.id', 'user.bot', 'old_status', 'new_status'. Bots of a team show
// their Discord status: online on duty, idle idle, dnd and offline off.
import { boardGuild, botStatusChanged, refreshBoard, teamsOf } from '../services/board.js';

/** @param {import('@bothub/sdk').PluginContext} ctx */
export default async function presenceUpdate(ctx, payload) {
  const guild = payload['server.id'];
  const user = payload['user.id'];
  if (payload['user.bot'] !== true || !guild || !user || guild !== boardGuild(ctx)) return;
  const teams = teamsOf(ctx, guild);
  if (!teams.length) return;
  const member = await ctx.member.get(guild, user).catch(() => null);
  if (!member || !teams.some((t) => member.roles.includes(t.role.id))) return;
  if (await botStatusChanged(ctx, guild, user, String(payload.new_status ?? 'offline'))) await refreshBoard(ctx, guild);
}
