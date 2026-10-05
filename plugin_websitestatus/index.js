// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/site_status.js, nodes/check_now.js -> blocks, services/tasks.js -> tasks.
import siteStatus from './nodes/site_status.js';
import checkNow from './nodes/check_now.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { site_status: siteStatus, check_now: checkNow },
  tasks,
};
