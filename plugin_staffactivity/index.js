// Entry file ("main" in bothub.json): the duty block behind the three
// commands, the task that turns old statuses off and refreshes the board,
// the events that keep it current (roles, bot status) and the settings save
// that posts it at once.
import setStatus from './nodes/set_status.js';
import guildMemberUpdate from './events/guildMemberUpdate.js';
import presenceUpdate from './events/presenceUpdate.js';
import { boardGuild, refreshBoard, tick } from './services/board.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { set_status: setStatus },
  events: { guildMemberUpdate, presenceUpdate },
  tasks: { tick: (ctx) => tick(ctx) },
  // Settings saved on the dashboard: the board goes out (or is edited) now.
  async onConfigChange(ctx) {
    const guild = boardGuild(ctx);
    if (guild) await refreshBoard(ctx, guild);
  },
};
