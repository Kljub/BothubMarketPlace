// Entry file ("main" in bothub.json): joins the layers into the plugin object.
import ask from './nodes/ask.js';
import reset from './nodes/reset.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { ask, reset },
};
