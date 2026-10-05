// Loot & Craft: members mine (/mine, with cooldown) and find ores, coal and
// gems; /smelt turns ores into bars, /craft turns bars into items, /sell pays
// the item value into the Economy module. The bot owner can replace items,
// drops and recipes on the settings page; empty lists use the defaults below.
// Storage: "inv:<guild>:<user>" = { item: count }, "mine:<guild>:<user>" = last mining time.
import { money, wallet } from './econ.js';
import { readJson, setting, writeJson } from './util.js';

export const DEFAULT_ITEMS = [
  { key: 'stone', name: 'Stone', emoji: '🪨', value: 1 },
  { key: 'coal', name: 'Coal', emoji: '⚫', value: 3 },
  { key: 'copper_ore', name: 'Copper ore', emoji: '🟠', value: 5 },
  { key: 'iron_ore', name: 'Iron ore', emoji: '⚪', value: 10 },
  { key: 'gold_ore', name: 'Gold ore', emoji: '🟡', value: 25 },
  { key: 'diamond', name: 'Diamond', emoji: '💎', value: 150 },
  { key: 'copper_bar', name: 'Copper bar', emoji: '🟫', value: 16 },
  { key: 'iron_bar', name: 'Iron bar', emoji: '🔩', value: 30 },
  { key: 'gold_bar', name: 'Gold bar', emoji: '🪙', value: 70 },
  { key: 'copper_wire', name: 'Copper wire', emoji: '🧵', value: 40 },
  { key: 'iron_sword', name: 'Iron sword', emoji: '⚔️', value: 110 },
  { key: 'gold_ring', name: 'Gold ring', emoji: '💍', value: 360 },
];
export const DEFAULT_DROPS = [
  { item: 'stone', weight: 40, min: 1, max: 4 },
  { item: 'coal', weight: 25, min: 1, max: 3 },
  { item: 'copper_ore', weight: 18, min: 1, max: 3 },
  { item: 'iron_ore', weight: 10, min: 1, max: 2 },
  { item: 'gold_ore', weight: 5, min: 1, max: 1 },
  { item: 'diamond', weight: 2, min: 1, max: 1 },
];
export const DEFAULT_RECIPES = [
  { kind: 'smelt', output: 'copper_bar', amount: 1, inputs: 'copper_ore:2, coal:1' },
  { kind: 'smelt', output: 'iron_bar', amount: 1, inputs: 'iron_ore:2, coal:1' },
  { kind: 'smelt', output: 'gold_bar', amount: 1, inputs: 'gold_ore:2, coal:2' },
  { kind: 'craft', output: 'copper_wire', amount: 1, inputs: 'copper_bar:2' },
  { kind: 'craft', output: 'iron_sword', amount: 1, inputs: 'iron_bar:3, stone:2' },
  { kind: 'craft', output: 'gold_ring', amount: 1, inputs: 'gold_bar:2, diamond:1' },
];

const keyOf = (v) => String(v ?? '').trim().toLowerCase();
const int = (v, min, max, fb) => Math.max(min, Math.min(max, Math.floor(Number(v)) || fb));

export function items(ctx) {
  const own = setting(ctx, 'items', []).filter((i) => keyOf(i?.key) && String(i?.name ?? '').trim());
  return (own.length ? own : DEFAULT_ITEMS).map((i) => ({ key: keyOf(i.key), name: String(i.name).trim(), emoji: i.emoji || '📦', value: int(i.value, 0, 1e9, 0) }));
}

export function drops(ctx) {
  const own = setting(ctx, 'drops', []).filter((d) => keyOf(d?.item));
  return (own.length ? own : DEFAULT_DROPS).map((d) => {
    const min = int(d.min, 1, 1000, 1);
    return { item: keyOf(d.item), weight: int(d.weight, 0, 1e6, 1), min, max: Math.max(min, int(d.max, 1, 1000, min)) };
  }).filter((d) => d.weight > 0);
}

/** "copper_ore:2, coal:1" -> [{ item, count }]; bad parts are left out. */
export function parseInputs(text) {
  return String(text ?? '').split(',').map((p) => p.trim().split(':')).filter(([k]) => keyOf(k))
    .map(([k, n]) => ({ item: keyOf(k), count: int(n, 1, 1000, 1) }));
}

export function recipeTable(ctx) {
  const own = setting(ctx, 'recipes', []).filter((r) => keyOf(r?.output));
  return (own.length ? own : DEFAULT_RECIPES).map((r) => ({ kind: r.kind === 'craft' ? 'craft' : 'smelt', output: keyOf(r.output), amount: int(r.amount, 1, 1000, 1), inputs: parseInputs(r.inputs) }))
    .filter((r) => r.inputs.length);
}

const findItem = (all, v) => all.find((i) => i.key === keyOf(v) || i.name.toLowerCase() === keyOf(v));
const label = (all, key, n) => {
  const i = all.find((x) => x.key === key);
  return `${n !== undefined ? `${n}× ` : ''}${i ? `${i.emoji} ${i.name}` : key}`;
};

/** One mining run: `rolls` weighted draws of the drop table. */
export function rollDrops(table, rolls, rng = Math.random) {
  const total = table.reduce((s, d) => s + d.weight, 0);
  const out = {};
  for (let r = 0; r < rolls && total > 0; r++) {
    let x = rng() * total;
    const d = table.find((t) => (x -= t.weight) < 0) ?? table.at(-1);
    out[d.item] = (out[d.item] ?? 0) + d.min + Math.floor(rng() * (d.max - d.min + 1));
  }
  return out;
}

/** How often a recipe fits into the inventory. */
export function maxTimes(inv, recipe) {
  return Math.min(...recipe.inputs.map((i) => Math.floor((inv[i.item] ?? 0) / i.count)));
}

async function answer(ctx, interaction, ok, message, result = '') {
  if (interaction) {
    await ctx.interaction.reply(interaction, message, { ephemeral: !ok || typeof message === 'string' });
    return { port: ok ? 'replied' : 'failed', results: { '': result } };
  }
  return { port: ok ? 'next' : 'failed', results: { '': result } };
}

const who = (vars) => (vars['server.id'] && vars['user.id'] ? [vars['server.id'], vars['user.id']] : null);
const invKey = (g, u) => `inv:${g}:${u}`;
const clean = (inv) => Object.fromEntries(Object.entries(inv).filter(([, n]) => n > 0));

export async function mine(ctx, { vars, interaction }, rng = Math.random) {
  const id = who(vars);
  if (!id) return answer(ctx, interaction, false, '❌ Only on a server.');
  const [g, u] = id;
  const cooldown = int(setting(ctx, 'mine_cooldown_minutes', 30), 1, 1440, 30) * 60_000;
  const last = Number(await ctx.storage.get(`mine:${g}:${u}`)) || 0;
  if (Date.now() < last + cooldown) return answer(ctx, interaction, false, `⏳ Your pickaxe rests. Mine again <t:${Math.floor((last + cooldown) / 1000)}:R>.`);
  await ctx.storage.set(`mine:${g}:${u}`, String(Date.now()));
  const found = rollDrops(drops(ctx), int(setting(ctx, 'mine_rolls', 3), 1, 10, 3), rng);
  const inv = await readJson(ctx, invKey(g, u), {});
  for (const [k, n] of Object.entries(found)) inv[k] = (inv[k] ?? 0) + n;
  await writeJson(ctx, invKey(g, u), clean(inv));
  const all = items(ctx);
  const lines = Object.entries(found).map(([k, n]) => `• ${label(all, k, n)}`);
  return answer(ctx, interaction, true, { embeds: [{ color: '#a16207', title: '⛏️ You went mining', description: `${lines.join('\n')}\n\nSee /inventory · smelt with /smelt.` }] }, Object.entries(found).map(([k, n]) => `${k}:${n}`).join(','));
}

export async function inventory(ctx, { vars, interaction }) {
  const id = who(vars);
  if (!id) return answer(ctx, interaction, false, '❌ Only on a server.');
  const inv = await readJson(ctx, invKey(...id), {});
  const all = items(ctx);
  const rows = Object.entries(inv).filter(([, n]) => n > 0).sort((a, b) => (findItem(all, b[0])?.value ?? 0) * b[1] - (findItem(all, a[0])?.value ?? 0) * a[1]);
  if (!rows.length) return answer(ctx, interaction, true, '🎒 Your bag is empty. Start with /mine.', '0');
  await wallet(ctx).get(...id); // loads the currency name
  const worth = rows.reduce((s, [k, n]) => s + (findItem(all, k)?.value ?? 0) * n, 0);
  const lines = rows.map(([k, n]) => `${label(all, k, n)}${findItem(all, k)?.value ? ` · ${money(ctx, findItem(all, k).value * n)}` : ''}`);
  return answer(ctx, interaction, true, { embeds: [{ color: '#5865f2', title: '🎒 Inventory', description: `${lines.join('\n').slice(0, 3900)}\n\nWorth: ${money(ctx, worth)}` }] }, String(worth));
}

export async function recipes(ctx, { interaction }) {
  const all = items(ctx);
  const line = (r) => `${label(all, r.output, r.amount)} ← ${r.inputs.map((i) => label(all, i.item, i.count)).join(' + ')}`;
  const rs = recipeTable(ctx);
  const smelt = rs.filter((r) => r.kind === 'smelt').map(line);
  const craft = rs.filter((r) => r.kind === 'craft').map(line);
  const description = [smelt.length ? `**🔥 /smelt**\n${smelt.join('\n')}` : '', craft.length ? `**🛠️ /craft**\n${craft.join('\n')}` : ''].filter(Boolean).join('\n\n');
  return answer(ctx, interaction, true, { embeds: [{ color: '#f97316', title: '📜 Recipes', description: description.slice(0, 4000) || 'No recipes.' }] }, String(rs.length));
}

async function make(ctx, { config, vars, interaction }, kind) {
  const id = who(vars);
  if (!id) return answer(ctx, interaction, false, '❌ Only on a server.');
  const all = items(ctx);
  const want = findItem(all, config.item)?.key ?? keyOf(config.item);
  const recipe = recipeTable(ctx).find((r) => r.kind === kind && r.output === want);
  if (!recipe) return answer(ctx, interaction, false, `❌ No ${kind === 'smelt' ? 'smelting' : 'crafting'} recipe for that. See /recipes.`);
  const inv = await readJson(ctx, invKey(...id), {});
  const can = maxTimes(inv, recipe);
  const asked = keyOf(config.amount) === 'all' ? can : int(config.amount, 1, 1000, 1);
  if (can < 1 || asked > can) {
    const need = recipe.inputs.map((i) => `${label(all, i.item, i.count * Math.max(1, asked))} (you have ${inv[i.item] ?? 0})`).join(', ');
    return answer(ctx, interaction, false, `❌ Not enough materials: ${need}.`);
  }
  for (const i of recipe.inputs) inv[i.item] -= i.count * asked;
  inv[recipe.output] = (inv[recipe.output] ?? 0) + recipe.amount * asked;
  await writeJson(ctx, invKey(...id), clean(inv));
  const used = recipe.inputs.map((i) => label(all, i.item, i.count * asked)).join(' + ');
  return answer(ctx, interaction, true, { embeds: [{ color: kind === 'smelt' ? '#ef4444' : '#22c55e', title: kind === 'smelt' ? '🔥 Smelted' : '🛠️ Crafted', description: `${label(all, recipe.output, recipe.amount * asked)}\nUsed: ${used}` }] }, String(recipe.amount * asked));
}

export const smelt = (ctx, args) => make(ctx, args, 'smelt');
export const craft = (ctx, args) => make(ctx, args, 'craft');

export async function sell(ctx, { config, vars, interaction }) {
  const id = who(vars);
  if (!id) return answer(ctx, interaction, false, '❌ Only on a server.');
  const all = items(ctx);
  const inv = await readJson(ctx, invKey(...id), {});
  const every = keyOf(config.item) === 'all';
  const chosen = every ? all.filter((i) => i.value > 0 && inv[i.key] > 0) : [findItem(all, config.item)].filter(Boolean);
  if (!chosen.length) return answer(ctx, interaction, false, every ? '❌ You have nothing to sell.' : '❌ Unknown item. See /inventory.');
  let total = 0;
  const sold = [];
  for (const it of chosen) {
    const have = inv[it.key] ?? 0;
    const n = every || keyOf(config.amount) === 'all' || !String(config.amount ?? '').trim() ? have : int(config.amount, 1, 1e6, 1);
    if (!it.value) return answer(ctx, interaction, false, `❌ ${label(all, it.key)} cannot be sold.`);
    if (n < 1 || n > have) return answer(ctx, interaction, false, `❌ You have only ${label(all, it.key, have)}.`);
    inv[it.key] = have - n;
    total += n * it.value;
    sold.push(label(all, it.key, n));
  }
  await writeJson(ctx, invKey(...id), clean(inv));
  const balance = await wallet(ctx).add(...id, total);
  return answer(ctx, interaction, true, { embeds: [{ color: '#22c55e', title: '💰 Sold', description: `${sold.join(', ').slice(0, 3000)}\nfor ${money(ctx, total)}\nBalance: ${money(ctx, balance)}` }] }, String(total));
}
