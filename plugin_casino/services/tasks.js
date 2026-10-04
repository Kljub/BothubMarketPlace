// Service "tasks": "expire" (every minute) plays blackjack hands left for 10
// minutes as "stand", so a bet is never stuck.
import { settle } from './interactions.js';
import { readJson } from './util.js';

export const tasks = {
  async expire(ctx) {
    const now = Date.now();
    for (const id of await readJson(ctx, 'hands', [])) {
      const s = await readJson(ctx, `bj:${id}`, null);
      if (s && now - s.at < 600_000) continue;
      if (s) await settle(ctx, s);
    }
  },
};
