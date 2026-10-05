// Small earnings with a cooldown: /beg (low risk: a chance for a few coins)
// and /fish (a catch from the table below, scaled by "fish_scale" %).
import { money, wallet } from './econ.js';
import { cooldown, no, pick, rng, who } from './core.js';
import { setting } from './util.js';

const DONORS = ['A kind stranger', 'Your grandma', 'A passing knight', 'A rich cat', 'The bot owner', 'A lost tourist', 'A street musician'];

export async function beg(ctx, { vars, interaction }) {
  const { guild, user, error } = who(vars, interaction);
  if (error) return no(ctx, interaction, error);
  const wait = await cooldown(ctx, 'beg', guild, user, setting(ctx, 'beg_cooldown_minutes', 5));
  if (wait) return no(ctx, interaction, wait);
  const min = Math.max(0, Math.floor(Number(setting(ctx, 'beg_min', '1') || 0)));
  const max = Math.max(min, Math.floor(Number(setting(ctx, 'beg_max', '50') || 0)));
  let amount = 0;
  if (rng.next() * 100 < Number(setting(ctx, 'beg_chance', 70))) amount = min + Math.floor(rng.next() * (max - min + 1));
  if (amount) await wallet(ctx).add(guild, user, amount);
  const text = amount ? `🙏 ${pick(DONORS)} gave you ${money(ctx, amount)}.` : `🙅 ${pick(DONORS)} walked past. Nothing this time.`;
  await ctx.interaction.reply(interaction, text);
  return { port: 'replied', results: { '': amount } };
}

/** Catch table: emoji, name, chance, smallest and biggest value. */
export const CATCHES = [
  ['👢', 'an old boot', 0.3, 0, 0], ['🐟', 'a fish', 0.4, 10, 30], ['🐠', 'a tropical fish', 0.2, 30, 80],
  ['🐡', 'a pufferfish', 0.08, 80, 200], ['🦈', 'a shark', 0.02, 300, 600],
];

export function catchOf(r = rng.next()) {
  for (const c of CATCHES) {
    if (r < c[2]) return c;
    r -= c[2];
  }
  return CATCHES[0];
}

export async function fish(ctx, { vars, interaction }) {
  const { guild, user, error } = who(vars, interaction);
  if (error) return no(ctx, interaction, error);
  const wait = await cooldown(ctx, 'fish', guild, user, setting(ctx, 'fish_cooldown_minutes', 10));
  if (wait) return no(ctx, interaction, wait);
  const [emoji, name, , lo, hi] = catchOf();
  const value = Math.floor((lo + Math.floor(rng.next() * (hi - lo + 1))) * (Number(setting(ctx, 'fish_scale', 100)) / 100));
  if (value > 0) await wallet(ctx).add(guild, user, value);
  await ctx.interaction.reply(interaction, `🎣 You caught ${emoji} ${name}${value > 0 ? ` worth ${money(ctx, value)}` : ''}!`);
  return { port: 'replied', results: { '': value } };
}
