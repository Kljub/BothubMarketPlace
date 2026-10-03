// Service "plex": the Plex servers and Overseerr through the admin's API
// endpoints (Admin -> API / Secrets, shared with this plugin):
//   PLEX_API, PLEX_API_2 … PLEX_API_5
//                  up to five Plex servers ("Sign in with Plex" on the App
//                  Store page fills the next free one): base URL, secret =
//                  Plex token, header X-Plex-Token (scheme "plain")
//   OVERSEERR_API  base URL incl. /api/v1, secret = API key, header X-Api-Key
// Library and item references carry the server: "2:5" is library 5 of
// server 2; a bare "5" means server 1 (settings from before 1.1.0 stay valid).
// The bot adds the secret; the plugin never sees it (so no poster URLs with
// the token either).
import { setting } from './util.js';

const JSON_HEADERS = { Accept: 'application/json' };

/** Endpoint keys of the server slots 1..5. */
export const SERVERS = ['PLEX_API', 'PLEX_API_2', 'PLEX_API_3', 'PLEX_API_4', 'PLEX_API_5'];

/** "5" -> {server: 1, id: "5"}, "2:5" -> {server: 2, id: "5"}; null when malformed. */
export function parseRef(ref) {
  const m = /^(?:([1-5]):)?(\d{1,6})$/.exec(String(ref ?? '').trim());
  return m ? { server: Number(m[1] ?? 1), id: m[2] } : null;
}

/** Normalized "n:id" of a reference. */
export const refOf = (server, id) => `${server}:${id}`;

/** How a reference is shown: server 1 without prefix. */
export const showRef = (ref) => (String(ref).startsWith('1:') ? String(ref).slice(2) : String(ref));

/** A Plex call to one server (1..5); { ok, status, json } or { ok: false, error }. */
export async function plex(ctx, path, query, server = 1) {
  try {
    const res = await ctx.http.endpoint(SERVERS[server - 1] ?? SERVERS[0], { path, query, headers: JSON_HEADERS });
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

/** A slot the admin has not connected: the endpoint is missing or not shared. */
const notConnected = (res) => !res.ok && /not_shared|not_found|unknown/.test(String(res.error));

/**
 * The connected servers: [{ server, ok, name, machine, version, error }].
 * Slots without an endpoint are left out; slot 1 is always listed so a
 * missing PLEX_API still gives a readable error.
 */
export async function servers(ctx) {
  const out = [];
  for (let n = 1; n <= SERVERS.length; n++) {
    const root = await plex(ctx, '/', undefined, n);
    if (n > 1 && notConnected(root)) continue;
    const mc = root.json?.MediaContainer ?? {};
    out.push({ server: n, ok: root.ok, error: root.error, name: String(mc.friendlyName ?? `Server ${n}`), machine: String(mc.machineIdentifier ?? ''), version: String(mc.version ?? '?') });
  }
  return out;
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

/** Libraries the bot owner shared (settings "libraries": "5, 2:3"), normalized to "n:id"; [] = none. */
export function allowedLibraries(ctx) {
  const out = [];
  for (const part of String(setting(ctx, 'libraries', '')).split(/[\s,]+/)) {
    const ref = parseRef(part);
    if (ref && !out.includes(refOf(ref.server, ref.id))) out.push(refOf(ref.server, ref.id));
  }
  return out;
}

export function mapItem(m, server = 1) {
  return {
    key: refOf(server, String(m.ratingKey ?? '')),
    server,
    title: String(m.title ?? 'Unknown'),
    year: m.year != null ? String(m.year) : '',
    summary: String(m.summary ?? '').slice(0, 500),
    section: refOf(server, String(m.librarySectionID ?? '')),
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
    '.library': libraryName || showRef(item.section) || '—',
    '.key': showRef(item.key),
  };
}

/** Libraries of every connected server: [{ id: "n:key", server, serverName, title, type }]. */
export async function sections(ctx) {
  const list = await servers(ctx);
  const out = [];
  let firstError = null;
  for (const s of list) {
    const res = await plex(ctx, '/library/sections', undefined, s.server);
    if (!res.ok) {
      firstError ??= res;
      continue;
    }
    for (const d of res.json?.MediaContainer?.Directory ?? []) {
      out.push({ id: refOf(s.server, String(d.key)), server: s.server, serverName: s.name, title: String(d.title ?? ''), type: String(d.type ?? '') });
    }
  }
  if (!out.length && firstError) return firstError;
  return { ok: true, sections: out, servers: list.length };
}

export async function searchLibraries(ctx, title) {
  const out = [];
  for (const ref of allowedLibraries(ctx)) {
    const { server, id } = parseRef(ref);
    const res = await plex(ctx, `/library/sections/${id}/all`, { title: String(title).slice(0, 100) }, server);
    if (res.ok) out.push(...(res.json?.MediaContainer?.Metadata ?? []).map((m) => mapItem(m, server)));
    else if (res.error === 'unauthorized') return { ok: false, error: res.error };
  }
  return { ok: true, items: out };
}

/** A random item of one allowed library (or any allowed one), skipping `exclude`. */
export async function randomItem(ctx, { library, genre, unwatched, exclude } = {}) {
  const allowed = allowedLibraries(ctx);
  if (!allowed.length) return { ok: false, error: 'no_libraries' };
  const wanted = parseRef(library);
  const ref = wanted && allowed.includes(refOf(wanted.server, wanted.id)) ? refOf(wanted.server, wanted.id) : allowed[Math.floor(Math.random() * allowed.length)];
  const { server, id } = parseRef(ref);
  const query = { sort: 'random', 'X-Plex-Container-Start': '0', 'X-Plex-Container-Size': '5' };
  if (unwatched) query.unwatched = '1';
  if (genre) query.genre = String(genre).slice(0, 50);
  const res = await plex(ctx, `/library/sections/${id}/all`, query, server);
  if (!res.ok) return res;
  const items = (res.json?.MediaContainer?.Metadata ?? []).map((m) => mapItem(m, server));
  return { ok: true, item: items.find((i) => i.key !== exclude) ?? items[0] ?? null, library: ref };
}

/** Playbacks in the shared libraries of every connected server. */
export async function sessions(ctx) {
  const allowed = allowedLibraries(ctx);
  const list = [];
  let firstError = null;
  let anyOk = false;
  for (const s of await servers(ctx)) {
    const res = await plex(ctx, '/status/sessions', undefined, s.server);
    if (!res.ok) {
      firstError ??= res;
      continue;
    }
    anyOk = true;
    for (const x of res.json?.MediaContainer?.Metadata ?? []) {
      if (!allowed.includes(refOf(s.server, String(x.librarySectionID ?? '')))) continue;
      list.push({ title: String(x.grandparentTitle ? `${x.grandparentTitle} – ${x.title}` : x.title ?? ''), year: x.year ?? '', user: x.User?.title ?? '?', state: x.Player?.state ?? '', server: s.name });
    }
  }
  if (!anyOk && firstError) return firstError;
  return { ok: true, sessions: list };
}

/** Watch history of every connected server (newest first, 50 per server). */
export async function history(ctx) {
  const out = [];
  let firstError = null;
  let anyOk = false;
  for (const s of await servers(ctx)) {
    const res = await plex(ctx, '/status/sessions/history/all', { sort: 'viewedAt:desc', 'X-Plex-Container-Size': '50' }, s.server);
    if (!res.ok) {
      firstError ??= res;
      continue;
    }
    anyOk = true;
    out.push(...(res.json?.MediaContainer?.Metadata ?? []));
  }
  if (!anyOk && firstError) return firstError;
  return { ok: true, json: { MediaContainer: { Metadata: out } } };
}

/** Server slot of a Plex machine identifier (webhooks); 1 when unknown. */
export async function serverOf(ctx, machine) {
  if (!machine) return 1;
  const key = `srv:${String(machine).slice(0, 64)}`;
  const cached = Number(await ctx.storage.get(key));
  if (cached >= 1 && cached <= SERVERS.length) return cached;
  const found = (await servers(ctx)).find((s) => s.machine === machine)?.server ?? 1;
  await ctx.storage.set(key, String(found));
  return found;
}
