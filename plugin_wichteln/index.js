// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/start.js -> block, services/interactions.js -> buttons and the wish list modal,
//   services/tasks.js -> tasks.
import start from './nodes/start.js';
import { components, modals } from './services/interactions.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { start },
  components,
  modals,
  tasks,
};
