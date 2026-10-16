// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/<name>.js -> blocks, services/interactions.js -> components
//   (the answer buttons "mq"), services/tasks.js -> tasks.
import start from './nodes/start.js';
import stop from './nodes/stop.js';
import top from './nodes/top.js';
import { components } from './services/interactions.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { start, stop, top },
  components,
  tasks,
};
