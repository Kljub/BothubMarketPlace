// Service "econ": sales are paid into the bot's Economy module (ctx.economy,
// the same balances as /balance). Setting currencyKey: the currency (a dropdown
// of the Economy currencies; empty: the default one). Answers name the
// currency as the Economy module does ("🪙 Coins").
import { setting } from './util.js';

/** Key of the chosen currency (undefined: the default one). */
export const currencyKey = (ctx) => setting(ctx, 'currencyKey', '') || undefined;

// Names of the Economy currencies ("" = the default one), read at most once a minute.
const names = new Map();
let namesAt = 0;
async function loadNames(ctx) {
  if (Date.now() - namesAt < 60_000) return;
  namesAt = Date.now();
  try {
    names.clear();
    for (const c of await ctx.economy.currencies()) {
      const label = `${c.emoji && !c.emoji.startsWith('<') ? `${c.emoji} ` : ''}${c.name}`;
      names.set(c.key, label);
      if (c.default) names.set('', label);
    }
  } catch {
    // older host without economy.currencies(): the plain word below
  }
}

/** Name of the chosen currency, e.g. "🪙 Coins". */
export const currencyName = (ctx) => names.get(currencyKey(ctx) ?? '') ?? 'coins';

/** ctx.economy with the chosen currency (the bank always uses the default one). */
export function wallet(ctx) {
  const c = () => currencyKey(ctx);
  const ready = (fn) => async (...args) => {
    await loadNames(ctx);
    return fn(...args);
  };
  return {
    get: ready((g, u) => ctx.economy.get(g, u, c())),
    add: ready((g, u, n) => ctx.economy.add(g, u, n, c())),
    remove: ready((g, u, n) => ctx.economy.remove(g, u, n, c())),
    transfer: ready((g, from, to, n) => ctx.economy.transfer(g, from, to, n, c())),
    leaderboard: ready((g, limit) => ctx.economy.leaderboard(g, limit, c())),
    bank: ready((g, u) => ctx.economy.bank(g, u)),
    bankTransfer: ready((g, from, to, n) => ctx.economy.bankTransfer(g, from, to, n)),
  };
}

export const money = (ctx, n) => `**${Math.floor(Number(n)).toLocaleString('en-US')}** ${currencyName(ctx)}`;
