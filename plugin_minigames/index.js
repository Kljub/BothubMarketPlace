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
import game2048 from './nodes/game2048.js';
import connect4 from './nodes/connect4.js';
import chess from './nodes/chess.js';
import chessmove from './nodes/chessmove.js';
import trivia from './nodes/trivia.js';
import { components } from './services/interactions.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { dicebet, fivedice, highlow, scratchcard, dos, mastermind, hangman, matchpairs, lightsout, beg, fish, game2048, connect4, chess, chessmove, trivia },
  components,
  tasks,
};
