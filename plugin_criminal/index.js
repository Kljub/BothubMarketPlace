// Entry file ("main" in bothub.json): joins the layers into the plugin object.
import steal from './nodes/steal.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { steal },
};
