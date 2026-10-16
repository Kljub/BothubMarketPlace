// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/<name>.js -> blocks, services/interactions.js -> components
//   (the buttons "bl" and selects "bls" of the private life panel).
import start from './nodes/start.js';
import profile from './nodes/profile.js';
import top from './nodes/top.js';
import { components } from './services/interactions.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { start, profile, top },
  components,
};
