// Service "tasks": "expire" (every minute) ends rounds untouched for 10
// minutes: found diamonds are paid out, a round without any gives the bet back.
import { finish } from './interactions.js';
import { multiplierAt } from './game.js';
import { readJson, setting } from './util.js';

const IDLE_MS = 600_000;

export const tasks = {
  async expire(ctx) {
    const now = Date.now();
    for (const id of await readJson(ctx, 'rounds', [])) {
      const r = await readJson(ctx, `ms:${id}`, null);
      if (r && now - r.at < IDLE_MS) continue;
      if (r) {
        const back = r.revealed.length ? Math.floor(r.bet * multiplierAt(r.mineCount, r.revealed.length, Number(setting(ctx, 'rtp', 97)))) : r.bet;
        await ctx.economy.add(r.guild, r.user, back);
        await finish(ctx, r);
      } else {
        await finish(ctx, { id, guild: '', user: '' });
      }
    }
  },
};
