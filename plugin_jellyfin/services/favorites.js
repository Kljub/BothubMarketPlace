// Service "favorites": the linked member's Jellyfin favorites (the Plex
// plugin's watchlist). The admin's API key acts for the member's Jellyfin
// user, so no member token is needed.
import { account } from './accounts.js';
import { jf, mapItem, searchLibraries } from './jellyfin.js';

/** The member's favorite movies and shows: { items } or { error }. */
export async function list(ctx, userId) {
  const acc = await account(ctx, userId);
  if (!acc) return { error: 'not_linked' };
  const res = await jf(ctx, '/Items', { userId: acc.userId, isFavorite: 'true', recursive: 'true', includeItemTypes: 'Movie,Series', sortBy: 'SortName', fields: 'ProductionYear', limit: '200' }, acc.server);
  if (!res.ok) return { error: res.error };
  return { items: (res.json?.Items ?? []).map((m) => mapItem(m, acc.server)), account: acc };
}

/** The first hit for a title in the shared libraries of the member's server: { item, account } or { error }. */
export async function find(ctx, userId, title) {
  const acc = await account(ctx, userId);
  if (!acc) return { error: 'not_linked' };
  const res = await searchLibraries(ctx, title);
  if (!res.ok) return { error: res.error };
  const mine = res.items.filter((i) => i.server === acc.server);
  const item = mine.find((i) => i.title.toLowerCase() === String(title).toLowerCase()) ?? mine[0];
  return item ? { item, account: acc } : { error: 'not_found' };
}

/** Marks an item (key "n:<id>") as favorite or not. */
export async function change(ctx, acc, key, add) {
  const id = String(key).split(':').pop();
  const res = await jf(ctx, `/UserFavoriteItems/${id}`, { userId: acc.userId }, acc.server, { method: add ? 'POST' : 'DELETE' });
  return res.ok ? {} : { error: res.error };
}
