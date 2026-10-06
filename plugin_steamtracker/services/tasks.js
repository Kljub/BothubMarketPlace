// Service "tasks" ("scheduler"): "tick" every 30 minutes checks the games.
import { checkAll } from './tracker.js';
import { setting } from './util.js';

export const tasks = {
  async tick(ctx) {
    if (!setting(ctx, 'games', []).length) return;
    await checkAll(ctx);
  },
};
