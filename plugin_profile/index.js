// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/<name>.js -> blocks, services/interactions.js -> components + modals.
import edit from './nodes/edit.js';
import show from './nodes/show.js';
import { components, modals } from './services/interactions.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { show, edit },
  components,
  modals,
};
