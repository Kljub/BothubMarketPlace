// Service "core": games in storage "g:<id>" = { id, kind, guild, user, at,
// ... }, open ones in "games"; the dice of every game (rng.next, tests set
// it); puzzle rewards with a cooldown per member ("pr:<guild>:<user>").
import { money, wallet } from './econ.js';
import { readJson, setting, writeJson } from './util.js';

export const rng = { next: Math.random };
export const roll = (sides) => 1 + Math.floor(rng.next() * sides);
export const pick = (list) => list[Math.floor(rng.next() * list.length)];

export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function newGame(ctx, kind, guild, user, fields) {
  const g = { id: ctx.utils.uuid().replace(/-/g, '').slice(0, 12), kind, guild, user, at: Date.now(), ...fields };
  await writeJson(ctx, `g:${g.id}`, g);
  await writeJson(ctx, 'games', [...(await readJson(ctx, 'games', [])), g.id]);
  return g;
}

export const loadGame = (ctx, id) => readJson(ctx, `g:${String(id).split(':')[0]}`, null);

export async function saveGame(ctx, g) {
  g.at = Date.now();
  await writeJson(ctx, `g:${g.id}`, g);
}

export async function endGame(ctx, g) {
  await ctx.storage.delete(`g:${g.id}`);
  await writeJson(ctx, 'games', (await readJson(ctx, 'games', [])).filter((x) => x !== g.id));
}

/** Ephemeral error answer of a block. */
export async function no(ctx, interaction, text) {
  if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
  return { port: 'failed', results: { '': text } };
}

export const say = (ctx, ev, text) => ctx.interaction.reply(ev.handle, text, { ephemeral: true });

/** Guild and user of a command run, or an error text. */
export function who(vars, interaction) {
  const guild = vars['server.id'];
  const user = vars['user.id'];
  if (!guild || !user || !interaction) return { error: '❌ Only as a command on a server.' };
  return { guild, user };
}

/** Reward of a solved puzzle: "puzzle_reward" once per "puzzle_cooldown_minutes". */
export async function puzzleReward(ctx, guild, user) {
  const amount = Math.floor(Number(setting(ctx, 'puzzle_reward', '50') || 0));
  if (amount <= 0) return '';
  const key = `pr:${guild}:${user}`;
  const cooldown = Number(setting(ctx, 'puzzle_cooldown_minutes', 60)) * 60_000;
  const last = Number((await ctx.storage.get(key)) ?? 0);
  if (cooldown && Date.now() - last < cooldown) return `\nNext reward <t:${Math.floor((last + cooldown) / 1000)}:R>.`;
  await ctx.storage.set(key, String(Date.now()));
  await wallet(ctx).add(guild, user, amount);
  return `\nReward: ${money(ctx, amount)}.`;
}

/** Cooldown check for /beg and /fish: text when still waiting, else null (and starts it). */
export async function cooldown(ctx, name, guild, user, minutes) {
  const key = `cd:${name}:${guild}:${user}`;
  const ms = Number(minutes) * 60_000;
  const last = Number((await ctx.storage.get(key)) ?? 0);
  if (ms && Date.now() - last < ms) return `⏳ Try again <t:${Math.floor((last + ms) / 1000)}:R>.`;
  await ctx.storage.set(key, String(Date.now()));
  return null;
}
