// Service "tasks" ("scheduler"): "tick" runs every minute. It closes Deny
// windows and salutes whose time is up, ends the turn of a player who waits
// longer than the turn limit, closes lobbies after 15 minutes and games that
// nobody touched for an hour.
import { cur, endTurn, resolveSalute } from './engine.js';
import { dropGame, listGames, loadGame, refreshTable, withGame } from './flow.js';

const LOBBY_MS = 15 * 60_000;
const IDLE_MS = 60 * 60_000;

export const tasks = {
  async tick(ctx) {
    const now = Date.now();
    for (const id of await listGames(ctx)) {
      const g = await loadGame(ctx, id);
      if (!g) {
        await dropGame(ctx, { id });
        continue;
      }
      if ((g.phase === 'lobby' && now - g.at > LOBBY_MS) || now - g.at > IDLE_MS) {
        g.phase = 'closed';
        await refreshTable(ctx, g);
        await dropGame(ctx, g);
        continue;
      }
      if (g.phase !== 'play') continue;
      const late = (g.pending && now >= g.pending.deadline)
        || (g.salute && now >= g.salute.deadline)
        || (!g.pending && !cur(g).bot && now - g.turnAt > g.cfg.turnMin * 60_000);
      if (!late) continue;
      await withGame(ctx, id, (game, e) => {
        if (game.salute && e.now >= game.salute.deadline) resolveSalute(game, e, true);
        if (game.phase === 'play' && !game.pending && !cur(game).bot && e.now - game.turnAt > game.cfg.turnMin * 60_000) endTurn(game, e, game.turn, true);
      }, { touch: false }).catch((err) => ctx.logger.warn(`tick ${id}: ${err?.message ?? err}`));
    }
  },
};
