// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/game.js -> blocks.game, services/tasks.js -> tasks (every 30 minutes)
// commands/ and dashboard/ need no code; the core reads them from bothub.json.
import game from './nodes/game.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { game },
  tasks,
};
