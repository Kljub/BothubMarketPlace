// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/*.js -> blocks, services/interactions.js -> components, services/tasks.js -> tasks.
import solo from './nodes/solo.js';
import duel from './nodes/duel.js';
import { components } from './services/interactions.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { solo, duel },
  components,
  tasks,
};
