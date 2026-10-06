// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/<name>.js -> blocks (definition: nodes/<name>.json)
//   the menu's selects -> components.pick, its page buttons -> components.page
// commands/ and dashboard/ need no code; the core reads them from bothub.json.
import menu, { page, pick } from './nodes/menu.js';
import send from './nodes/send.js';
import manage from './nodes/manage.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { menu, send, manage },
  components: { pick, page },
};
