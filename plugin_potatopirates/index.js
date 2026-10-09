// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/start.js           block "start" (/potatopirates)
//   services/interactions.js buttons and selects of the table and the hand
//   services/tasks.js        task "tick" (time limits)
// The rules live in services/engine.js, the bots in services/ai.js.
import start from './nodes/start.js';
import { components } from './services/interactions.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { start },
  components,
  tasks,
};
