// Service "tasks": "expire" (every minute) ends games untouched for 10
// minutes (chess: a day, trivia: two minutes). Duels and Connect 4 pay the
// bets back, high-low cashes out its current value, a scratch card pays its
// prize; puzzles just end.
import { refundDuel } from './duel.js';
import { cashOut, scratchPrize } from './luck.js';
import { endGame } from './core.js';
import { readJson } from './util.js';
import { CHESS_IDLE_MS } from './chess.js';
import { TRIVIA_IDLE_MS } from './trivia.js';

const idleOf = (kind) => (kind === 'chess' ? CHESS_IDLE_MS : kind === 'trivia' ? TRIVIA_IDLE_MS : IDLE_MS);

export const IDLE_MS = 600_000;

export const tasks = {
  async expire(ctx) {
    const now = Date.now();
    for (const id of await readJson(ctx, 'games', [])) {
      const g = await readJson(ctx, `g:${id}`, null);
      if (g && now - g.at < idleOf(g.kind)) continue;
      if (g?.kind === 'dicebet' || g?.kind === 'dos' || g?.kind === 'connect4') await refundDuel(ctx, g);
      if (g?.kind === 'chess') for (const u of [g.user, g.opponent].filter(Boolean)) await ctx.storage.delete(`chess:${g.guild}:${u}`);
      if (g?.kind === 'highlow') await cashOut(ctx, g);
      if (g?.kind === 'scratch') await scratchPrize(ctx, g);
      await endGame(ctx, g ?? { id });
    }
  },
};
