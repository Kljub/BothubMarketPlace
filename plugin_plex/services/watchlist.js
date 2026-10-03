// Service "watchlist": the member's Plex watchlist on Plex Discover
// (https://discover.provider.plex.tv, "http.outbound", services.hosts),
// with the member's own token from /plex-link (accounts.js, tok:<id>).
import { clientId, tokenOf } from './accounts.js';

const DISCOVER = 'https://discover.provider.plex.tv';

const headers = (ctx, token) => ({
  Accept: 'application/json',
  'X-Plex-Client-Identifier': clientId(ctx),
  'X-Plex-Product': 'BotHub',
  'X-Plex-Token': token,
});

/** The token or a reason: { token } | { error: 'not_linked' }. */
async function auth(ctx, userId) {
  const token = userId ? await tokenOf(ctx, userId) : null;
  return token ? { token } : { error: 'not_linked' };
}

const item = (m) => ({ key: String(m.ratingKey ?? ''), title: String(m.title ?? 'Unknown'), year: m.year != null ? String(m.year) : '', type: String(m.type ?? '') });

function failed(res) {
  if (res.status === 401) return { error: 'not_linked' }; // token revoked: link again
  return { error: `http_${res.status}` };
}

/** The watchlist: { items } | { error }. */
export async function list(ctx, userId) {
  const a = await auth(ctx, userId);
  if (a.error) return a;
  const res = await ctx.http.get(`${DISCOVER}/library/sections/watchlist/all?includeCollections=1&includeExternalMedia=1`, { headers: headers(ctx, a.token) });
  if (res.status >= 400) return failed(res);
  return { items: (res.json?.MediaContainer?.Metadata ?? []).map(item) };
}

/** First movie or show on Plex Discover for a title: { item } | { error: 'not_found' | … }. */
export async function find(ctx, userId, title) {
  const a = await auth(ctx, userId);
  if (a.error) return a;
  const q = new URLSearchParams({ query: String(title).slice(0, 100), limit: '10', searchTypes: 'movies,tv', searchProviders: 'discover', includeMetadata: '1' });
  const res = await ctx.http.get(`${DISCOVER}/library/search?${q}`, { headers: headers(ctx, a.token) });
  if (res.status >= 400) return failed(res);
  // SearchResults: [{ SearchResult: [{ Metadata }] }] (older answers: Metadata directly).
  const hits = [];
  for (const group of res.json?.MediaContainer?.SearchResults ?? []) {
    for (const r of group?.SearchResult ?? []) if (r?.Metadata) hits.push(r.Metadata);
  }
  hits.push(...(res.json?.MediaContainer?.Metadata ?? []));
  const movies = hits.filter((m) => m?.ratingKey && (m.type === 'movie' || m.type === 'show'));
  const exact = movies.find((m) => String(m.title ?? '').toLowerCase() === String(title).trim().toLowerCase());
  const hit = exact ?? movies[0];
  return hit ? { item: item(hit), token: a.token } : { error: 'not_found' };
}

/** Adds or removes one title (ratingKey of Plex Discover). */
export async function change(ctx, token, key, add) {
  const action = add ? 'addToWatchlist' : 'removeFromWatchlist';
  const res = await ctx.http.put(`${DISCOVER}/actions/${action}?ratingKey=${encodeURIComponent(key)}`, undefined, { headers: headers(ctx, token) });
  return res.status >= 400 ? failed(res) : { ok: true };
}
