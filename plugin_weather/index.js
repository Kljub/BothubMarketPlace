// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/<name>.js -> blocks (definition: nodes/<name>.json)
// commands/ and dashboard/ need no code; the core reads them from bothub.json.
import current from './nodes/current.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { current },
};
