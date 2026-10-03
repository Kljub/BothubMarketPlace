// Service "tracking": the anime a bot follows, in ctx.storage (one JSON
// list per bot). Entry: { id, title, cover, url, next } where next is the
// next episode AniList knew of at the last check.
import { readJson, writeJson } from './storage.js';

const KEY = 'tracked';
export const MAX_TRACKED = 50;

export async function list(ctx) {
  const items = await readJson(ctx, KEY, []);
  return Array.isArray(items) ? items : [];
}

export async function save(ctx, items) {
  await writeJson(ctx, KEY, items.slice(0, MAX_TRACKED));
}

/** Finds a tracked anime by AniList ID or by (part of) its title. */
export function find(items, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return null;
  const id = Number(q.replace(/^#/, ''));
  return items.find((t) => Number.isInteger(id) && t.id === id) ?? items.find((t) => t.title.toLowerCase() === q) ?? items.find((t) => t.title.toLowerCase().includes(q)) ?? null;
}
