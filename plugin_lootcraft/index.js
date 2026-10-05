// Entry file ("main" in bothub.json): joins the layers into the plugin object.
import mine from './nodes/mine.js';
import inventory from './nodes/inventory.js';
import recipes from './nodes/recipes.js';
import smelt from './nodes/smelt.js';
import craft from './nodes/craft.js';
import sell from './nodes/sell.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { mine, inventory, recipes, smelt, craft, sell },
};
