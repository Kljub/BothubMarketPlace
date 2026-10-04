// Service "econ": bets from the bot's Economy module (ctx.economy, the same
// balances as /balance). Settings: currency (name in the answers), min_bet,
// max_bet (empty: no limit).
import { setting } from './util.js';

export const money = (ctx, n) => `**${Math.floor(Number(n)).toLocaleString('en-US')}** ${setting(ctx, 'currency', 'coins')}`;

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
    await ctx.economy.remove(guild, user, bet);
    return null;
  } catch (err) {
    if (String(err?.message ?? err).includes('not_enough')) return `❌ Not enough ${setting(ctx, 'currency', 'coins')}: you have ${money(ctx, await ctx.economy.get(guild, user))}.`;
    throw err;
  }
}

/** Pays out (0: nothing) and answers the new balance. */
export async function pay(ctx, guild, user, amount) {
  return amount > 0 ? ctx.economy.add(guild, user, Math.floor(amount)) : ctx.economy.get(guild, user);
}
