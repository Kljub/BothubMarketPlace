// Service "henrik": Valorant data from the HenrikDev API (api.henrikdev.xyz),
// the common unofficial Valorant API (Riot gives match data only to approved
// apps). The key is the admin's secret HENRIKDEV_API_KEY: the install creates
// it empty under Admin → API / Secrets, shared with this plugin; the bot adds
// it to the Authorization header ("secrets.use"), the plugin never sees it.
//
// A basic key allows 30 requests per minute; requests HenrikDev has to ask
// Riot for in the background count too. Accounts are cached for 6 hours.
import { readJson, writeJson } from './storage.js';

export const API = 'https://api.henrikdev.xyz';
export const KEY_SECRET = 'HENRIKDEV_API_KEY';
const AUTH = { secret: KEY_SECRET, format: 'plain' };
const ACCOUNT_TTL = 6 * 3600 * 1000;

/** A problem the member can read; code is a text key of services/i18n.js. */
export class StatsError extends Error {
  constructor(code, params = {}) {
    super(code);
    this.code = code;
    this.params = params;
  }
}

/** GET of one endpoint; the "data" of the answer. */
export async function get(ctx, path, query) {
  let res;
  try {
    res = await ctx.http.secret({ url: `${API}${path}`, query, auth: AUTH });
  } catch (err) {
    const key = String(err?.message ?? err);
    if (key.includes('sdk.secret.not_shared')) throw new StatsError('err.not_set_up_valorant');
    if (key.includes('sdk.http.timeout')) throw new StatsError('err.timeout');
    if (key.includes('sdk.http.too_big')) throw new StatsError('err.http', { status: 'too big' });
    throw err;
  }
  if (res.status >= 200 && res.status < 300) return res.json?.data ?? null;
  const code = Number(res.json?.errors?.[0]?.code);
  if (res.status === 401 || res.status === 403) throw new StatsError('err.bad_key');
  if (res.status === 429) throw new StatsError('err.rate');
  if (code === 22 || (res.status === 404 && !code)) throw new StatsError('err.not_found');
  if (code === 23 || code === 24 || code === 25) throw new StatsError('err.no_data');
  throw new StatsError('err.http', { status: res.status });
}

/** { name, tag } of "Name#TAG" or a tracker.gg link; null when it is none. */
export function parseRiotId(input) {
  let raw = String(input ?? '').trim();
  const link = /tracker\.gg\/valorant\/profile\/riot\/([^/?#\s]+)/i.exec(raw);
  if (link) {
    try {
      raw = decodeURIComponent(link[1]);
    } catch {
      return null;
    }
  }
  const m = /^(.{3,16}?)\s*#\s*([A-Za-z0-9]{3,5})$/u.exec(raw);
  if (!m || /[#/\\?]/.test(m[1])) return null;
  return { name: m[1].trim(), tag: m[2] };
}

export const riotId = (a) => `${a.name}#${a.tag}`;
const enc = encodeURIComponent;

/** The account of a Riot ID: { puuid, name, tag, region, level, card, title }. */
export async function account(ctx, id, now = Date.now()) {
  const key = `a:${riotId(id).toLowerCase()}`.slice(0, 128);
  const cached = await readJson(ctx, key, null);
  if (cached && now - cached.at < ACCOUNT_TTL) return cached;
  const d = await get(ctx, `/valorant/v2/account/${enc(id.name)}/${enc(id.tag)}`);
  if (!d?.puuid) throw new StatsError('err.not_found');
  const acc = {
    puuid: String(d.puuid), name: String(d.name ?? id.name), tag: String(d.tag ?? id.tag),
    region: String(d.region ?? 'eu').toLowerCase(), level: Number(d.account_level) || 0,
    card: typeof d.card === 'string' ? d.card : String(d.card?.id ?? ''), title: String(d.title ?? ''), at: now,
  };
  await writeJson(ctx, key, acc);
  return acc;
}

/** Rank now, peak and seasons (MMR v3); null when the player has no ranked data. */
export async function mmr(ctx, acc, platform) {
  try {
    return await get(ctx, `/valorant/v3/by-puuid/mmr/${enc(acc.region)}/${enc(platform)}/${enc(acc.puuid)}`);
  } catch (err) {
    if (err instanceof StatsError && (err.code === 'err.no_data' || err.code === 'err.not_found')) return null;
    throw err;
  }
}

/** Competitive RR changes, newest first: { match_id, tier, rr, last_change, elo, map, date }. */
export async function mmrHistory(ctx, acc, platform) {
  let d;
  try {
    d = await get(ctx, `/valorant/v2/by-puuid/mmr-history/${enc(acc.region)}/${enc(platform)}/${enc(acc.puuid)}`);
  } catch (err) {
    if (err instanceof StatsError && (err.code === 'err.no_data' || err.code === 'err.not_found')) return [];
    throw err;
  }
  const list = Array.isArray(d?.history) ? d.history.filter((h) => h?.match_id) : [];
  return list.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

/** Matches HenrikDev has stored, newest first (mode e.g. "competitive"; "" for all). */
export async function storedMatches(ctx, acc, mode, size) {
  const query = { size: String(size) };
  if (mode) query.mode = mode;
  let d;
  try {
    d = await get(ctx, `/valorant/v1/by-puuid/stored-matches/${enc(acc.region)}/${enc(acc.puuid)}`, query);
  } catch (err) {
    if (err instanceof StatsError && (err.code === 'err.no_data' || err.code === 'err.not_found')) return [];
    throw err;
  }
  return (Array.isArray(d) ? d : []).filter((m) => m?.meta?.id && m.stats);
}
