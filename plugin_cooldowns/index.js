// Entry file ("main" in bothub.json): joins the layers into the plugin object.
import start from './nodes/start.js';
import list from './nodes/list.js';
import stop from './nodes/stop.js';
import { tasks } from './services/blocks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { start, list, stop },
  tasks,
};
