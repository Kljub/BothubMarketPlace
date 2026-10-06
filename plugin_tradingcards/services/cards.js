// Service "cards": the cards of the settings, packs, collections, trades.
//
// Storage (per server and member):
//   "col:<guild>:<user>"  = { "<card key>": count }
//   "pack:<guild>:<user>" = time of the last free pack (ms)
//   "trade:<id>"          = an open trade offer (15 minutes)
import { readJson, writeJson } from './storage.js';
import { setting } from './util.js';

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const RARITY = {
  common: { emoji: '⚪', name: 'Common', weight: 60, color: '#9ca3af' },
  uncommon: { emoji: '🟢', name: 'Uncommon', weight: 25, color: '#22c55e' },
  rare: { emoji: '🔵', name: 'Rare', weight: 10, color: '#3b82f6' },
  epic: { emoji: '🟣', name: 'Epic', weight: 4, color: '#a855f7' },
  legendary: { emoji: '🟡', name: 'Legendary', weight: 1, color: '#f59e0b' },
};
export const TRADE_MS = 15 * 60_000;

/** A readable problem for the member. */
export class CardError extends Error {}

export const keyOf = (name) => String(name ?? '').trim().toLowerCase();

/** The cards of the settings (with a name and a picture or link). */
export function cards(ctx) {
  const seen = new Set();
  const out = [];
  for (const c of setting(ctx, 'cards', [])) {
    const key = keyOf(c?.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name: String(c.name).trim(), rarity: RARITIES.includes(c.rarity) ? c.rarity : 'common', file: String(c.file ?? ''), image: /^https:\/\//.test(String(c.image ?? '')) ? String(c.image) : '', description: String(c.description ?? ''), set: String(c.set ?? '').trim() });
  }
  return out;
}

export function findCard(list, name) {
  const k = keyOf(name);
  return list.find((c) => c.key === k) ?? list.find((c) => c.key.startsWith(k) && k.length >= 2) ?? null;
}

/** Draws a pack: a rarity by weight (only rarities that have cards), then a card of it. */
export function drawPack(list, size, random = Math.random) {
  const by = Object.fromEntries(RARITIES.map((r) => [r, list.filter((c) => c.rarity === r)]));
  const pool = RARITIES.filter((r) => by[r].length);
  if (!pool.length) return [];
  const total = pool.reduce((s, r) => s + RARITY[r].weight, 0);
  const out = [];
  for (let i = 0; i < size; i++) {
    let roll = random() * total;
    let rarity = pool[pool.length - 1];
    for (const r of pool) {
      roll -= RARITY[r].weight;
      if (roll < 0) {
        rarity = r;
        break;
      }
    }
    const group = by[rarity];
    out.push(group[Math.floor(random() * group.length) % group.length]);
  }
  return out;
}

export const collection = (ctx, g, u) => readJson(ctx, `col:${g}:${u}`, {});
export const saveCollection = (ctx, g, u, col) => writeJson(ctx, `col:${g}:${u}`, col);

/** Adds (or with a negative count removes) cards; false when the member has too few. */
export async function change(ctx, g, u, key, n) {
  const col = await collection(ctx, g, u);
  const next = (col[key] ?? 0) + n;
  if (next < 0) return false;
  if (next === 0) delete col[key];
  else col[key] = next;
  await saveCollection(ctx, g, u, col);
  return true;
}

/** A pack is free once per cooldown; otherwise it costs coins (when a price is set). Returns how it was paid. */
export async function payForPack(ctx, g, u, now = Date.now()) {
  const hours = Number(setting(ctx, 'free_pack_hours', 24)) || 0;
  const price = Number(setting(ctx, 'pack_price', 0)) || 0;
  const last = Number((await ctx.storage.get(`pack:${g}:${u}`)) ?? 0);
  if (hours > 0 && now - last >= hours * 3_600_000) {
    await ctx.storage.set(`pack:${g}:${u}`, String(now));
    return { paid: 'free' };
  }
  if (price > 0) {
    try {
      await ctx.economy.remove(g, u, price);
    } catch (err) {
      if (String(err?.message ?? err).includes('not_enough')) throw new CardError(`A pack costs **${price}** coins, you do not have enough.${hours > 0 ? ` Next free pack <t:${Math.floor((last + hours * 3_600_000) / 1000)}:R>.` : ''}`);
      throw new CardError('Buying packs is not set up (the Economy module and the permission to take coins are needed).');
    }
    return { paid: price };
  }
  if (hours > 0) throw new CardError(`Your next free pack is ready <t:${Math.floor((last + hours * 3_600_000) / 1000)}:R>.`);
  throw new CardError('Packs are not set up (no free packs, no price).');
}

/** The lines of a collection, rarest first, with the completion. */
export function collectionText(list, col) {
  const owned = list.filter((c) => (col[c.key] ?? 0) > 0);
  const lines = [];
  for (const r of [...RARITIES].reverse()) {
    const mine = owned.filter((c) => c.rarity === r);
    if (!mine.length) continue;
    lines.push(`${RARITY[r].emoji} **${RARITY[r].name}** (${mine.length}/${list.filter((c) => c.rarity === r).length})`);
    lines.push(mine.map((c) => `${c.name}${col[c.key] > 1 ? ` ×${col[c.key]}` : ''}`).join(', '));
  }
  const total = Object.values(col).reduce((s, n) => s + n, 0);
  return { text: lines.join('\n') || 'No cards yet. Open a pack!', unique: owned.length, total, of: list.length, percent: list.length ? Math.round((owned.length / list.length) * 100) : 0 };
}

/** Message of one card: the picture (an upload is sent as the file), rarity, description. */
export function cardMessage(ctx, card, extra = '') {
  const r = RARITY[card.rarity];
  const e = { color: r.color, title: `${r.emoji} ${card.name}`, description: [`**${r.name}**${card.set ? ` · ${card.set}` : ''}`, card.description, extra].filter(Boolean).join('\n').slice(0, 4000) };
  if (card.file) e.image_url = 'attachment';
  else if (card.image) e.image_url = card.image;
  return { message: { embeds: [e] }, file: card.file || undefined };
}

// ---------- trades ----------

export async function newTrade(ctx, offer) {
  const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  await writeJson(ctx, `trade:${id}`, { ...offer, at: Date.now() });
  return id;
}

export async function takeTrade(ctx, id) {
  const t = await readJson(ctx, `trade:${id}`, null);
  if (t) await ctx.storage.delete(`trade:${id}`);
  return t && Date.now() - t.at < TRADE_MS ? t : null;
}

export const peekTrade = (ctx, id) => readJson(ctx, `trade:${id}`, null);
