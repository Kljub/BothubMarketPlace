// Entry file ("main" in bothub.json): blocks for /form and /form-panel,
// the buttons (open, accept, decline) and the form modal.
import open from './nodes/open.js';
import panel from './nodes/panel.js';
import { components, modals } from './services/interactions.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { open, panel },
  components,
  modals,
};
