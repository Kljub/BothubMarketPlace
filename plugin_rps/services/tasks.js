// Service "tasks": "expire" (every minute) ends duels that ran 2 minutes
// without both picks and pays the bets back. The message keeps its buttons;
// a later click answers "This duel is over".
import { DUEL_MS, endDuel, getDuel, refund } from './game.js';
import { readJson } from './util.js';

export const tasks = {
  async expire(ctx) {
    const now = Date.now();
    for (const id of await readJson(ctx, 'duels', [])) {
      const d = await getDuel(ctx, id);
      if (d && now - d.at < DUEL_MS) continue;
      if (d) await refund(ctx, d);
      await endDuel(ctx, d ?? { id });
    }
  },
};
