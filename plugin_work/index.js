// Entry file ("main" in bothub.json): joins the layers into the plugin object.
import list from './nodes/list.js';
import accept from './nodes/accept.js';
import leave from './nodes/leave.js';
import work from './nodes/work.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { list, accept, leave, work },
};
