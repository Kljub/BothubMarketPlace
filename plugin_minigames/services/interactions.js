// Buttons and selects of all games, by key.
import { duelComponents } from './duel.js';
import { luckComponents } from './luck.js';
import { puzzleComponents } from './puzzles.js';
import { boardComponents } from './boards.js';
import { chessComponents } from './chess.js';
import { triviaComponents } from './trivia.js';

export const components = { ...duelComponents, ...luckComponents, ...puzzleComponents, ...boardComponents, ...chessComponents, ...triviaComponents };
