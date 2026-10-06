// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/calc.js -> blocks calc and profile (definitions: nodes/<name>.json)
// commands/ and dashboard/ need no code; the core reads them from bothub.json.
import calc from './nodes/calc.js';
import profile from './nodes/profile.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { calc, profile },
};
