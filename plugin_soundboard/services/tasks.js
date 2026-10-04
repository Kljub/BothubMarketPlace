// Service "tasks": "idle" (every minute) leaves the voice channel of servers
// where nothing played for a minute, so the bot does not hang around.
import { readJson } from './util.js';

const IDLE_MS = 60_000;

export const tasks = {
  async idle(ctx) {
    const guilds = await ctx.guild.list().catch(() => []);
    for (const g of guilds) {
      const state = await ctx.voice.state(g.id).catch(() => null);
      if (!state?.channelId || state.playing) continue;
      const last = await readJson(ctx, `last:${g.id}`, 0);
      if (Date.now() - last >= IDLE_MS) await ctx.voice.leave(g.id).catch(() => undefined);
    }
  },
};
