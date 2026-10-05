// Service "econ": bets from the bot's Economy module (ctx.economy, the same
// balances as /balance). Settings: currencyKey (the currency, a dropdown of the
// Economy currencies; empty: the default one), min_bet, max_bet (empty: no
// limit). Answers name the currency as the Economy module does ("🪙 Coins").
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

/** The bet as a whole number within the limits, or { error }. */
export function betOf(ctx, v, required = true) {
  const s = String(v ?? '').trim();
  if (!s) return required ? { error: '❌ Name a bet.' } : { bet: 0 };
  const bet = Math.floor(Number(s));
  const min = Number(setting(ctx, 'min_bet', '') || 1);
  const max = Number(setting(ctx, 'max_bet', '') || 0);
  if (!(bet >= 1)) return { error: '❌ The bet must be a number from 1.' };
  if (bet < min) return { error: `❌ The lowest bet is ${money(ctx, min)}.` };
  if (max && bet > max) return { error: `❌ The highest bet is ${money(ctx, max)}.` };
  return { bet };
}

/** Takes the bet; error text when the balance is too low. */
export async function take(ctx, guild, user, bet) {
  if (!bet) return null;
  try {
    await wallet(ctx).remove(guild, user, bet);
    return null;
  } catch (err) {
    if (String(err?.message ?? err).includes('not_enough')) return `❌ Not enough ${currencyName(ctx)}: you have ${money(ctx, await wallet(ctx).get(guild, user))}.`;
    throw err;
  }
}

/** Pays out (0: nothing) and answers the new balance. */
export async function pay(ctx, guild, user, amount) {
  return amount > 0 ? wallet(ctx).add(guild, user, Math.floor(amount)) : wallet(ctx).get(guild, user);
}
