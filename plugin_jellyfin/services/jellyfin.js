// Service "jellyfin": the Jellyfin servers and Jellyseerr through the admin's
// secrets (Admin -> API / Secrets, shared with this plugin), sent with
// ctx.http.secret:
//   JELLYFIN_URL + JELLYFIN_KEY, JELLYFIN_URL_2 + JELLYFIN_KEY_2 … _5
//                  up to five Jellyfin servers: address and API key
//                  (Dashboard → API Keys), sent as query parameter ApiKey
//                  (the one way Jellyfin accepts a bare key without legacy
//                  authorization)
//   JELLYSEERR_URL + JELLYSEERR_KEY  address incl. /api/v1, API key (header X-Api-Key)
// Library and item references carry the server: "2:<id>" is item <id> of
// server 2; a bare "<id>" means server 1. Jellyfin IDs are 32 hex digits.
// The bot adds the secret; the plugin never sees it (so no poster URLs with
// the key either: posters are loaded as plugin files).
import { readJson, writeJson } from './storage.js';
import { setting } from './util.js';

const JSON_HEADERS = { Accept: 'application/json' };
export const FIELDS = 'Overview,Genres,ProductionYear,CommunityRating,RunTimeTicks,ParentId';
const VIDEO_TYPES = 'Movie,Series';

/** Secrets of the server slots 1..5: address and API key. */
export const SERVERS = [1, 2, 3, 4, 5].map((n) => (n === 1 ? { url: 'JELLYFIN_URL', key: 'JELLYFIN_KEY' } : { url: `JELLYFIN_URL_${n}`, key: `JELLYFIN_KEY_${n}` }));
export const authOf = (server) => ({ secret: (SERVERS[server - 1] ?? SERVERS[0]).key, format: 'query', param: 'ApiKey' });

/** Jellyfin IDs without dashes, lower case. */
export const normId = (id) => String(id ?? '').replace(/-/g, '').toLowerCase();

/** "<id>" -> {server: 1, id}, "2:<id>" -> {server: 2, id}; null when malformed. */
export function parseRef(ref) {
  const m = /^(?:([1-5]):)?([0-9a-f]{32}|[0-9a-f-]{36})$/i.exec(String(ref ?? '').trim());
  return m ? { server: Number(m[1] ?? 1), id: normId(m[2]) } : null;
}

export const refOf = (server, id) => `${server}:${normId(id)}`;

/** How a reference is shown: server 1 without prefix. */
export const showRef = (ref) => (String(ref).startsWith('1:') ? String(ref).slice(2) : String(ref));

/** A Jellyfin call to one server (1..5); { ok, status, json } or { ok: false, error }. */
export async function jf(ctx, path, query, server = 1, { method, json } = {}) {
  try {
    const slot = SERVERS[server - 1] ?? SERVERS[0];
    const res = await ctx.http.secret({ url: slot.url, path, query, method, json, headers: JSON_HEADERS, auth: authOf(server) });
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'unauthorized', status: res.status };
    if (res.status >= 400) return { ok: false, error: `http_${res.status}`, status: res.status };
    return { ok: true, status: res.status, json: res.json };
  } catch (err) {
    return { ok: false, error: String(err?.key ?? err?.message ?? 'network_error') };
  }
}

export async function jellyseerr(ctx, method, path, { query, json } = {}) {
  try {
    const res = await ctx.http.secret({ url: 'JELLYSEERR_URL', method, path, query, json, headers: JSON_HEADERS, auth: { secret: 'JELLYSEERR_KEY', header: 'X-Api-Key', format: 'plain' } });
    if (res.status >= 400) return { ok: false, error: `http_${res.status}`, status: res.status };
    return { ok: true, status: res.status, json: res.json ?? {} };
  } catch (err) {
    return { ok: false, error: String(err?.key ?? err?.message ?? 'network_error') };
  }
}

/** A slot the admin has not connected: its secrets are missing or not shared. */
const notConnected = (res) => !res.ok && /not_shared|not_found|unknown/.test(String(res.error));

/**
 * The connected servers: [{ server, ok, name, id, version, error }]. Slots
 * without secrets are left out; slot 1 is always listed so a missing
 * JELLYFIN_URL still gives a readable error.
 */
export async function servers(ctx) {
  const out = [];
  for (let n = 1; n <= SERVERS.length; n++) {
    const info = await jf(ctx, '/System/Info', undefined, n);
    if (n > 1 && notConnected(info)) continue;
    const j = info.json ?? {};
    out.push({ server: n, ok: info.ok, error: info.error, name: String(j.ServerName ?? `Server ${n}`), id: normId(j.Id), version: String(j.Version ?? '?') });
  }
  return out;
}

/** Human text for a failed call. */
export function errorText(res) {
  const e = String(res?.error ?? '');
  if (e === 'unauthorized') return 'Jellyfin refused the API key (check JELLYFIN_KEY under Admin → API / Secrets; Jellyfin → Dashboard → API Keys).';
  if (e === 'sdk.secret.not_shared') return 'The Jellyfin secrets are not set up or not shared with this plugin (JELLYFIN_URL and JELLYFIN_KEY under Admin → API / Secrets).';
  if (e === 'sdk.secret.not_a_url') return 'The secret with the server address does not hold a URL (e.g. http://192.168.1.10:8096).';
  if (e.includes('timeout')) return 'The server did not answer in time.';
  if (e.startsWith('http_')) return `The server answered with HTTP ${e.slice(5)}.`;
  return 'The server could not be reached.';
}

/** Libraries the bot owner shared (settings "libraries": ["1:<id>", …]), normalized; [] = none. */
export function allowedLibraries(ctx) {
  const out = [];
  const raw = setting(ctx, 'libraries', []);
  for (const part of Array.isArray(raw) ? raw : String(raw ?? '').split(/[\s,]+/)) {
    const ref = parseRef(part);
    if (ref && !out.includes(refOf(ref.server, ref.id))) out.push(refOf(ref.server, ref.id));
  }
  return out;
}

const ticksToMin = (t) => (Number(t) > 0 ? Math.round(Number(t) / 600_000_000) : null);

export function mapItem(m, server = 1) {
  const episode = m.Type === 'Episode' && m.SeriesName;
  return {
    key: refOf(server, m.Id),
    server,
    title: episode ? `${m.SeriesName} – ${m.Name ?? ''}` : String(m.Name ?? 'Unknown'),
    year: m.ProductionYear != null ? String(m.ProductionYear) : '',
    summary: String(m.Overview ?? '').slice(0, 500),
    section: m.library ?? '',
    type: String(m.Type ?? ''),
    genres: (m.Genres ?? []).filter(Boolean),
    rating: m.CommunityRating != null ? Math.round(Number(m.CommunityRating) * 10) / 10 : null,
    duration: ticksToMin(m.RunTimeTicks),
    // Image of the item (an episode shows its show's poster).
    image: normId(episode && m.SeriesId ? m.SeriesId : m.Id),
  };
}

/**
 * The poster of an item as a plugin file ("storage.files"), scaled by
 * Jellyfin; the key stays in the bot. null when there is none.
 */
export async function poster(ctx, item) {
  if (!item?.image) return null;
  try {
    const slot = SERVERS[(item.server ?? 1) - 1] ?? SERVERS[0];
    const res = await ctx.http.secret({ url: slot.url, path: `/Items/${item.image}/Images/Primary`, query: { maxHeight: '600', quality: '90' }, auth: authOf(item.server ?? 1), saveAs: 'file' });
    return res.file ?? null;
  } catch {
    return null;
  }
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
    '.library': libraryName || '—',
    '.key': showRef(item.key),
  };
}

/** Libraries of every connected server: [{ id: "n:<id>", server, serverName, title, type }]. */
export async function sections(ctx) {
  const list = await servers(ctx);
  const out = [];
  let firstError = null;
  for (const s of list) {
    const res = await jf(ctx, '/Library/VirtualFolders', undefined, s.server);
    if (!res.ok) {
      firstError ??= res;
      continue;
    }
    for (const d of Array.isArray(res.json) ? res.json : []) {
      if (!d.ItemId) continue;
      out.push({ id: refOf(s.server, d.ItemId), server: s.server, serverName: s.name, title: String(d.Name ?? ''), type: String(d.CollectionType ?? 'mixed') });
    }
  }
  if (!out.length && firstError) return firstError;
  return { ok: true, sections: out, servers: list.length };
}

/** Names of the shared libraries ("n:<id>" -> name), cached by the library task. */
export const libraryNames = (ctx) => readJson(ctx, 'libnames', {});

const cleanPath = (p) => String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

/** The folders of each library of a server: [{ id: "n:<id>", paths }], cached 30 minutes. */
async function libraryPaths(ctx, server) {
  const key = `locs:${server}`;
  const cached = await readJson(ctx, key, null);
  if (cached && Date.now() - cached.at < 30 * 60_000) return cached.libs;
  const res = await jf(ctx, '/Library/VirtualFolders', undefined, server);
  if (!res.ok) return [];
  const libs = (Array.isArray(res.json) ? res.json : []).filter((d) => d.ItemId)
    .map((d) => ({ id: refOf(server, d.ItemId), paths: (d.Locations ?? []).map(cleanPath).filter(Boolean) }));
  await writeJson(ctx, key, { libs, at: Date.now() });
  return libs;
}

/**
 * The library of an item, "n:<id>": the library whose folder holds the
 * item's file (Jellyfin lists no library among an item's ancestors).
 * Cached per item for a day; null when it is in no library.
 */
export async function libraryOf(ctx, server, itemId) {
  const key = `lib:${server}:${normId(itemId)}`;
  const cached = await readJson(ctx, key, null);
  if (cached && Date.now() - cached.at < 86_400_000) return cached.lib;
  const res = await jf(ctx, '/Items', { ids: normId(itemId), fields: 'Path' }, server);
  if (!res.ok) return null;
  const path = cleanPath(res.json?.Items?.[0]?.Path);
  let lib = null;
  let best = 0;
  for (const l of await libraryPaths(ctx, server)) {
    for (const p of l.paths) {
      if ((path === p || path.startsWith(`${p}/`)) && p.length > best) {
        lib = l.id;
        best = p.length;
      }
    }
  }
  await writeJson(ctx, key, { lib, at: Date.now() });
  return lib;
}

export async function searchLibraries(ctx, title) {
  const out = [];
  const names = await libraryNames(ctx);
  for (const ref of allowedLibraries(ctx)) {
    const { server, id } = parseRef(ref);
    const res = await jf(ctx, '/Items', { parentId: id, recursive: 'true', searchTerm: String(title).slice(0, 100), includeItemTypes: VIDEO_TYPES, fields: FIELDS, limit: '10' }, server);
    if (res.ok) out.push(...(res.json?.Items ?? []).map((m) => ({ ...mapItem(m, server), section: ref, library: names[ref] ?? '' })));
    else if (res.error === 'unauthorized') return { ok: false, error: res.error };
  }
  return { ok: true, items: out };
}

/** A random item of one allowed library (or any allowed one), skipping `exclude`. Unwatched needs a Jellyfin user. */
export async function randomItem(ctx, { library, genre, unwatched, exclude, userId } = {}) {
  const allowed = allowedLibraries(ctx);
  if (!allowed.length) return { ok: false, error: 'no_libraries' };
  const wanted = parseRef(library);
  const ref = wanted && allowed.includes(refOf(wanted.server, wanted.id)) ? refOf(wanted.server, wanted.id) : allowed[Math.floor(Math.random() * allowed.length)];
  const { server, id } = parseRef(ref);
  const query = { parentId: id, recursive: 'true', sortBy: 'Random', limit: '5', includeItemTypes: VIDEO_TYPES, fields: FIELDS };
  if (unwatched && userId) Object.assign(query, { userId, isPlayed: 'false' });
  if (genre) query.genres = String(genre).slice(0, 50);
  const res = await jf(ctx, '/Items', query, server);
  if (!res.ok) return res;
  const items = (res.json?.Items ?? []).map((m) => mapItem(m, server));
  return { ok: true, item: items.find((i) => i.key !== exclude) ?? items[0] ?? null, library: ref };
}

/** Playbacks in the shared libraries of every connected server. */
export async function sessions(ctx) {
  const allowed = allowedLibraries(ctx);
  const list = [];
  let firstError = null;
  let anyOk = false;
  for (const s of await servers(ctx)) {
    if (!s.ok) {
      firstError ??= s;
      continue;
    }
    const res = await jf(ctx, '/Sessions', { activeWithinSeconds: '960' }, s.server);
    if (!res.ok) {
      firstError ??= res;
      continue;
    }
    anyOk = true;
    for (const x of Array.isArray(res.json) ? res.json : []) {
      const item = x.NowPlayingItem;
      if (!item?.Id) continue;
      if (!allowed.includes(await libraryOf(ctx, s.server, item.Id))) continue;
      const title = item.Type === 'Episode' && item.SeriesName ? `${item.SeriesName} – ${item.Name}` : String(item.Name ?? '');
      list.push({ title, year: item.ProductionYear ?? '', user: String(x.UserName ?? '?'), state: x.PlayState?.IsPaused ? 'paused' : 'playing', server: s.name });
    }
  }
  if (!anyOk && firstError) return firstError;
  return { ok: true, sessions: list };
}

/** The genres a Jellyfin user watched last (newest 50 played movies and episodes' shows). */
export async function watchedGenres(ctx, server, userId) {
  const res = await jf(ctx, '/Items', { userId, isPlayed: 'true', recursive: 'true', includeItemTypes: 'Movie,Series', sortBy: 'DatePlayed', sortOrder: 'Descending', limit: '50', fields: 'Genres' }, server);
  if (!res.ok) return res;
  const counts = {};
  for (const m of res.json?.Items ?? []) for (const g of m.Genres ?? []) counts[g] = (counts[g] ?? 0) + 1;
  return { ok: true, counts };
}

/** Server slot of a Jellyfin server ID (webhooks); 1 when unknown. */
export async function serverOf(ctx, serverId) {
  if (!serverId) return 1;
  const key = `srv:${normId(serverId).slice(0, 64)}`;
  const cached = Number(await ctx.storage.get(key));
  if (cached >= 1 && cached <= SERVERS.length) return cached;
  const found = (await servers(ctx)).find((s) => s.id === normId(serverId))?.server ?? 1;
  await ctx.storage.set(key, String(found));
  return found;
}

/**
 * Options of the settings field "libraries": every library of the connected
 * servers as "Server:Library" (ctx.config.setOptions), and their names for
 * the answers. Keeps the old list when no server answers.
 */
export async function refreshLibraryOptions(ctx) {
  const res = await sections(ctx);
  if (!res.ok || !res.sections.length) return 0;
  const list = res.sections.slice(0, 200);
  await writeJson(ctx, 'libnames', Object.fromEntries(list.map((s) => [s.id, s.title.slice(0, 60)])));
  return ctx.config.setOptions('libraries', list.map((s) => ({ value: s.id, label: `${s.serverName}:${s.title}`.slice(0, 100) })));
}
