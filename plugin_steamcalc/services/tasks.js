// Service "tasks" ("scheduler"): "tick" every 30 minutes posts new Steam
// achievements of the tracked players.
import { trackAchievements } from './achievements.js';

export const tasks = {
  async tick(ctx) {
    await trackAchievements(ctx);
  },
};
