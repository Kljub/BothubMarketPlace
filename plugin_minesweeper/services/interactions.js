// Field clicks and 🔥 cash out; only the player of the round may click.
import { embed } from './blocks.js';
import { money, pay } from './econ.js';
import { board, GRID, multiplierAt } from './game.js';
import { readJson, setting, writeJson } from './util.js';

export async function finish(ctx, r) {
  await ctx.storage.delete(`ms:${r.id}`);
  await ctx.storage.delete(`open:${r.guild}:${r.user}`);
  await writeJson(ctx, 'rounds', (await readJson(ctx, 'rounds', [])).filter((x) => x !== r.id));
}

async function load(ctx, ev, id) {
  const r = await readJson(ctx, `ms:${id}`, null);
  if (!r) {
    await ctx.interaction.reply(ev.handle, '⌛ This round is over.', { ephemeral: true });
    return null;
  }
  if (ev.user.id !== r.user) {
    await ctx.interaction.reply(ev.handle, '❌ This is not your round. Start one with /minesweeper.', { ephemeral: true });
    return null;
  }
  return r;
}

async function cashOut(ctx, ev, r, outcome) {
  const payout = Math.floor(r.bet * multiplierAt(r.mineCount, r.revealed.length, Number(setting(ctx, 'rtp', 97))));
  const balance = await pay(ctx, r.guild, r.user, payout);
  await finish(ctx, r);
  const text = `${outcome === 'cleared' ? 'All diamonds found! ' : ''}Paid out ${money(ctx, payout)}. Balance: ${money(ctx, balance)}`;
  await ctx.interaction.update(ev.handle, { embeds: [embed(ctx, r, outcome, text)], components: board(r, true) });
}

export const components = {
  async cell(ctx, ev) {
    const [id, at] = String(ev.data).split(':');
    const r = await load(ctx, ev, id);
    if (!r) return;
    const i = Number(at);
    if (!(i >= 0 && i < GRID) || r.revealed.includes(i)) return ctx.interaction.update(ev.handle, { embeds: [embed(ctx, r)], components: board(r) });
    if (r.mines.includes(i)) {
      await finish(ctx, r);
      const balance = await ctx.economy.get(r.guild, r.user);
      return ctx.interaction.update(ev.handle, { embeds: [embed(ctx, r, 'boom', `Bet lost. Balance: ${money(ctx, balance)}`)], components: board(r, true) });
    }
    r.revealed.push(i);
    r.at = Date.now();
    if (r.revealed.length === GRID - r.mineCount) return cashOut(ctx, ev, r, 'cleared');
    await writeJson(ctx, `ms:${r.id}`, r);
    await ctx.interaction.update(ev.handle, { embeds: [embed(ctx, r)], components: board(r) });
  },
  async cashout(ctx, ev) {
    const r = await load(ctx, ev, ev.data);
    if (!r) return;
    if (!r.revealed.length) return ctx.interaction.reply(ev.handle, '❌ Find at least one diamond first.', { ephemeral: true });
    await cashOut(ctx, ev, r, 'cashout');
  },
};
