// Service "tasks" ("scheduler"): "tick" runs every minute and ends rounds
// nobody solved within the round time (services/game.js).
import { tick } from './game.js';

export const tasks = {
  tick: (ctx) => tick(ctx),
};
