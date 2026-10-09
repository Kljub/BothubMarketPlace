// Event guildMemberUpdate ("discord.events.members"): payload 'server.id',
// 'user.id', 'user.bot'. A role given or taken can move a member in or out
// of a team: the board of that server refreshes.
import { boardGuild, refreshBoard, teamsOf } from '../services/board.js';

/** @param {import('@bothub/sdk').PluginContext} ctx */
export default async function guildMemberUpdate(ctx, payload) {
  const guild = payload['server.id'];
  if (!guild || guild !== boardGuild(ctx) || !teamsOf(ctx, guild).length) return;
  await refreshBoard(ctx, guild);
}
