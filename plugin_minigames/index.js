// Entry file ("main" in bothub.json): joins the layers into the plugin object.
import dicebet from './nodes/dicebet.js';
import fivedice from './nodes/fivedice.js';
import highlow from './nodes/highlow.js';
import scratchcard from './nodes/scratchcard.js';
import dos from './nodes/dos.js';
import mastermind from './nodes/mastermind.js';
import hangman from './nodes/hangman.js';
import matchpairs from './nodes/matchpairs.js';
import lightsout from './nodes/lightsout.js';
import beg from './nodes/beg.js';
import fish from './nodes/fish.js';
import { components } from './services/interactions.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { dicebet, fivedice, highlow, scratchcard, dos, mastermind, hangman, matchpairs, lightsout, beg, fish },
  components,
  tasks,
};
