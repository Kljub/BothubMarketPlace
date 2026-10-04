// Service "tasks" ("scheduler"): "tick" runs every minute and starts a check
// round when the interval of the settings passed (or a new website has no
// result yet), so a changed interval counts at once.
import { due, runRound } from './monitor.js';
import { setting } from './util.js';

export const tasks = {
  async tick(ctx) {
    if (!setting(ctx, 'channel', null)?.id || !(await due(ctx))) return;
    await runRound(ctx, setting(ctx, 'language', 'en'));
  },
};
