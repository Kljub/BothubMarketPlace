// Node plugin.plugin_anisearch.untrack: stops following an anime (AniList
// ID or title). Ports: next (removed), not_found.
import { find, list, save } from '../services/tracking.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function untrack(ctx, { config }) {
  const items = await list(ctx);
  const hit = find(items, config.title);
  if (!hit) return { port: 'not_found' };
  await save(ctx, items.filter((t) => t.id !== hit.id));
  return { results: { '': hit.title, '.id': String(hit.id) } };
}
