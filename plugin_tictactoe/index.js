// Entry file ("main" in bothub.json): joins the layers into the plugin object.
import start from './nodes/start.js';
import { components } from './services/interactions.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { start },
  components,
  tasks,
};
