// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/*.js -> blocks, services/interactions.js -> components, services/tasks.js -> tasks.
import play from './nodes/play.js';
import add from './nodes/add.js';
import remove from './nodes/remove.js';
import list from './nodes/list.js';
import panel from './nodes/panel.js';
import stop from './nodes/stop.js';
import { components } from './services/interactions.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { play, add, remove, list, panel, stop },
  components,
  tasks,
};
