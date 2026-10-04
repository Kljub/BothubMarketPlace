// Entry file ("main" in bothub.json): joins the layers into the plugin object.
import play from './nodes/play.js';
import { components } from './services/interactions.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { play },
  components,
  tasks,
};
