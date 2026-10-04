// Buttons and selects of all games, by key.
import { duelComponents } from './duel.js';
import { luckComponents } from './luck.js';
import { puzzleComponents } from './puzzles.js';

export const components = { ...duelComponents, ...luckComponents, ...puzzleComponents };
