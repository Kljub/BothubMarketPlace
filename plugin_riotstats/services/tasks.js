// Service "tasks" ("scheduler"): "tick" every 5 minutes checks the next
// tracked players for new competitive matches (services/tracker.js).
import { tick } from './tracker.js';

export const tasks = {
  async tick(ctx) {
    await tick(ctx);
  },
};
