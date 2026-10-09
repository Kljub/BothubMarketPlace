// Entry file ("main" in bothub.json): the duty block behind the three
// commands, and the task that turns old statuses off and refreshes the board.
import setStatus from './nodes/set_status.js';
import { tick } from './services/board.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { set_status: setStatus },
  tasks: { tick: (ctx) => tick(ctx) },
};
