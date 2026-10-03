// Service "plex": the Plex server and Overseerr through the admin's API
// endpoints (Admin -> API / Secrets, shared with this plugin):
//   PLEX_API       base URL of the Plex server (e.g. http://plex.lan:32400),
//                  secret = Plex token, header X-Plex-Token (scheme "plain")
//   OVERSEERR_API  base URL incl. /api/v1, secret = API key, header X-Api-Key
// The bot adds the secret; the plugin never sees it (so no poster URLs with
// the token either).
import { setting } from './util.js';

const JSON_HEADERS = { Accept: 'application/json' };

/** A Plex call; { ok, status, json } or { ok: false, error }. */
export async function plex(ctx, path, query) {
  try {
    const res = await ctx.http.endpoint('PLEX_API', { path, query, headers: JSON_HEADERS });
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'unauthorized', status: res.status };
    if (res.status >= 400) return { ok: false, error: `http_${res.status}`, status: res.status };
    return { ok: true, status: res.status, json: res.json };
  } catch (err) {
    return { ok: false, error: String(err?.key ?? err?.message ?? 'network_error') };
  }
}

export async function overseerr(ctx, method, path, { query, json } = {}) {
  try {
    const res = await ctx.http.endpoint('OVERSEERR_API', { method, path, query, json, headers: JSON_HEADERS });
    if (res.status >= 400) return { ok: false, error: `http_${res.status}`, status: res.status };
    return { ok: true, status: res.status, json: res.json ?? {} };
  } catch (err) {
    return { ok: false, error: String(err?.key ?? err?.message ?? 'network_error') };
  }
}

/** Human text for a failed call. */
export function errorText(res) {
  const e = String(res?.error ?? '');
  if (e === 'unauthorized') return 'Plex refused the token (check PLEX_API under Admin → API / Secrets).';
  if (e === 'sdk.http.not_shared') return 'The API endpoint is not shared with this plugin (Admin → Plugins).';
  if (e.includes('timeout')) return 'The server did not answer in time.';
  if (e.startsWith('http_')) return `The server answered with HTTP ${e.slice(5)}.`;
  return 'The server could not be reached.';
}

/** Library section IDs the bot owner shared (settings "libraries", comma separated); [] = none. */
export function allowedLibraries(ctx) {
  return String(setting(ctx, 'libraries', '')).split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^\d{1,6}$/.test(s));
}

export function mapItem(m) {
  return {
    key: String(m.ratingKey ?? ''),
    title: String(m.title ?? 'Unknown'),
    year: m.year != null ? String(m.year) : '',
    summary: String(m.summary ?? '').slice(0, 500),
    section: String(m.librarySectionID ?? ''),
    type: String(m.type ?? ''),
    genres: (m.Genre ?? []).map((g) => g.tag).filter(Boolean),
    rating: m.audienceRating ?? m.rating ?? null,
    duration: m.duration ? Math.round(m.duration / 60000) : null,
  };
}

/** Block results of one item. */
export function itemResults(item, libraryName) {
  return {
    '': item.title,
    '.year': item.year || '—',
    '.summary': item.summary || '—',
    '.genres': item.genres.slice(0, 5).join(', ') || '—',
    '.rating': item.rating != null ? String(item.rating) : '—',
    '.duration': item.duration != null ? `${item.duration} min` : '—',
    '.library': libraryName || item.section || '—',
    '.key': item.key,
  };
}

export async function sections(ctx) {
  const res = await plex(ctx, '/library/sections');
  if (!res.ok) return res;
  const dirs = res.json?.MediaContainer?.Directory ?? [];
  return { ok: true, sections: dirs.map((d) => ({ id: String(d.key), title: String(d.title ?? ''), type: String(d.type ?? '') })) };
}

export async function searchLibraries(ctx, title) {
  const out = [];
  for (const id of allowedLibraries(ctx)) {
    const res = await plex(ctx, `/library/sections/${id}/all`, { title: String(title).slice(0, 100) });
    if (res.ok) out.push(...(res.json?.MediaContainer?.Metadata ?? []).map(mapItem));
    else if (res.error === 'unauthorized') return { ok: false, error: res.error };
  }
  return { ok: true, items: out };
}

/** A random item of one allowed library (or any allowed one), skipping `exclude`. */
export async function randomItem(ctx, { library, genre, unwatched, exclude } = {}) {
  const allowed = allowedLibraries(ctx);
  if (!allowed.length) return { ok: false, error: 'no_libraries' };
  const id = library && allowed.includes(String(library)) ? String(library) : allowed[Math.floor(Math.random() * allowed.length)];
  const query = { sort: 'random', 'X-Plex-Container-Start': '0', 'X-Plex-Container-Size': '5' };
  if (unwatched) query.unwatched = '1';
  if (genre) query.genre = String(genre).slice(0, 50);
  const res = await plex(ctx, `/library/sections/${id}/all`, query);
  if (!res.ok) return res;
  const items = (res.json?.MediaContainer?.Metadata ?? []).map(mapItem);
  return { ok: true, item: items.find((i) => i.key !== exclude) ?? items[0] ?? null, library: id };
}

export async function sessions(ctx) {
  const res = await plex(ctx, '/status/sessions');
  if (!res.ok) return res;
  const allowed = allowedLibraries(ctx);
  const list = (res.json?.MediaContainer?.Metadata ?? [])
    .filter((s) => allowed.includes(String(s.librarySectionID ?? '')))
    .map((s) => ({ title: String(s.grandparentTitle ? `${s.grandparentTitle} – ${s.title}` : s.title ?? ''), year: s.year ?? '', user: s.User?.title ?? '?', state: s.Player?.state ?? '' }));
  return { ok: true, sessions: list };
}
