// Entry file ("main" in bothub.json): joins the layers into the plugin object.
import heist from './nodes/heist.js';
import steal from './nodes/steal.js';
import { heistComponents, tasks } from './services/heist.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { steal, heist },
  components: heistComponents,
  tasks,
};
