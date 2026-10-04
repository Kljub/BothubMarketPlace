// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/<name>.js -> blocks (definition: nodes/<name>.json)
// commands/ and dashboard/ need no code; the core reads them from bothub.json.
import autotag from './nodes/autotag.js';
import img2img from './nodes/img2img.js';
import imagine from './nodes/imagine.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { imagine, img2img, autotag },
};
