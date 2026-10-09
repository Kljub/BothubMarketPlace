// Service "auto": moves the game on until a human has to act. Bots play their
// turns, answer Deny windows, and windows close when nobody is left to
// answer (or their time is up). Pure: no storage, no Discord.
import { botAct, botsReact } from './ai.js';
import { GameError, cur, endTurn, resolvePending, resolveSalute, waitingFor } from './engine.js';

const BOT_STEPS = 40;

export function settle(g, env) {
  for (let guard = 0; guard < 2000; guard++) {
    if (g.phase !== 'play') return;
    if (g.salute) resolveSalute(g, env);
    if (g.pending) {
      if (botsReact(g, env)) continue;
      if (!waitingFor(g).length || env.now >= g.pending.deadline) {
        resolvePending(g, env);
        continue;
      }
      return;
    }
    const p = cur(g);
    if (!p.bot) return;
    const key = `${g.round}:${g.turn}`;
    if (g.botTurn !== key) {
      g.botTurn = key;
      g.botSteps = 0;
    }
    let acted = false;
    if (g.botSteps++ < BOT_STEPS) {
      try {
        acted = botAct(g, env, g.turn);
      } catch (err) {
        if (!(err instanceof GameError)) throw err;
        acted = false;
      }
    }
    if (!acted && !g.pending) endTurn(g, env, g.turn);
  }
}
