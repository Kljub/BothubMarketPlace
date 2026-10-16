// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/translate.js -> blocks, events/reactionAdd.js -> Quick-Translation.
import translate from './nodes/translate.js';
import reactionAdd from './events/reactionAdd.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { translate },
  events: { reactionAdd },
};
