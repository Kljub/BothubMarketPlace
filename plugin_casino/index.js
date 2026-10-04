// Entry file ("main" in bothub.json): joins the layers into the plugin object.
import coinflip from './nodes/coinflip.js';
import dice from './nodes/dice.js';
import slots from './nodes/slots.js';
import roulette from './nodes/roulette.js';
import blackjack from './nodes/blackjack.js';
import { components } from './services/interactions.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { coinflip, dice, slots, roulette, blackjack },
  components,
  tasks,
};
