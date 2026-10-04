// Service "tasks": "expire" (every minute) ends games untouched for 5
// minutes and pays the bets back.
import { endGame } from './blocks.js';
import { refund } from './interactions.js';
import { readJson } from './util.js';

export const tasks = {
  async expire(ctx) {
    const now = Date.now();
    for (const id of await readJson(ctx, 'games', [])) {
      const g = await readJson(ctx, `g:${id}`, null);
      if (g && now - g.at < 300_000) continue;
      if (g) await refund(ctx, g);
      await endGame(ctx, g ?? { id });
    }
  },
};
