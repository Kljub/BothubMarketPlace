// Entry file ("main" in bothub.json): joins the layers into the plugin object.
import imagine from './nodes/imagine.js';
import img2img from './nodes/img2img.js';
import { components } from './services/buttons.js';
import { refreshOptions, tasks } from './services/options.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  async onEnable(ctx) {
    await refreshOptions(ctx);
  },
  blocks: { imagine, img2img },
  components,
  tasks,
};
