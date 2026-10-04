// Service "tasks": "expire" (every minute) ends games untouched for 10
// minutes. Duels pay the bets back, high-low cashes out its current value,
// a scratch card pays its prize; puzzles just end.
import { refundDuel } from './duel.js';
import { cashOut, scratchPrize } from './luck.js';
import { endGame } from './core.js';
import { readJson } from './util.js';

export const IDLE_MS = 600_000;

export const tasks = {
  async expire(ctx) {
    const now = Date.now();
    for (const id of await readJson(ctx, 'games', [])) {
      const g = await readJson(ctx, `g:${id}`, null);
      if (g && now - g.at < IDLE_MS) continue;
      if (g?.kind === 'dicebet' || g?.kind === 'dos') await refundDuel(ctx, g);
      if (g?.kind === 'highlow') await cashOut(ctx, g);
      if (g?.kind === 'scratch') await scratchPrize(ctx, g);
      await endGame(ctx, g ?? { id });
    }
  },
};
