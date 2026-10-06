// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/calc.js -> blocks calc and profile, nodes/achievements.js -> achievements
//   services/tasks.js -> tasks (achievement tracker, every 30 minutes)
// commands/ and dashboard/ need no code; the core reads them from bothub.json.
import calc from './nodes/calc.js';
import profile from './nodes/profile.js';
import achievements from './nodes/achievements.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { calc, profile, achievements },
  tasks,
};
