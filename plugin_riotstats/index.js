// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/<name>.js -> blocks (definition: nodes/<name>.json)
//   services/tasks.js -> tasks (bothub.json "services.tasks": tick every 5 minutes)
// commands/ and dashboard/ need no code; the core reads them from bothub.json.
import stats from './nodes/stats.js';
import matches from './nodes/matches.js';
import link from './nodes/link.js';
import leaderboard from './nodes/leaderboard.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { stats, matches, link, leaderboard },
  tasks,
};
