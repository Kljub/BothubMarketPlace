// Service "riot": the official Riot Games API for League of Legends, TFT and
// Legends of Runeterra. Keys are admin secrets the plugin never sees
// ("secrets.use", header X-Riot-Token): RIOT_API_KEY for LoL and LoR,
// RIOT_TFT_API_KEY for TFT (a TFT app has its own key; without it the
// RIOT_API_KEY is used, a development key works for every game).
//
// Riot encrypts PUUIDs per key, so accounts are cached per game:
// "ra:<game>:<riot id>" = { puuid, name, tag, platform, at } (6 hours).
import { riotId, StatsError } from './henrik.js';
import { readJson, writeJson } from './storage.js';

export const KEYS = { lol: ['RIOT_API_KEY'], lor: ['RIOT_API_KEY'], tft: ['RIOT_TFT_API_KEY', 'RIOT_API_KEY'] };

/** LoL/TFT servers ("platforms") and the regional host of their matches. */
export const PLATFORMS = {
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
  kr: 'asia', jp1: 'asia',
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe', me1: 'europe',
  oc1: 'sea', sg2: 'sea', tw2: 'sea', vn2: 'sea',
};
export const REGIONS = ['americas', 'asia', 'europe', 'sea'];
/** Legends of Runeterra shards (its own regional hosts). */
const LOR_REGIONS = ['americas', 'europe', 'sea', 'apac'];
export const SERVER_NAMES = {
  na1: 'NA', br1: 'BR', la1: 'LAN', la2: 'LAS', kr: 'KR', jp1: 'JP', euw1: 'EUW', eun1: 'EUNE', tr1: 'TR', ru: 'RU', me1: 'ME',
  oc1: 'OCE', sg2: 'SEA', tw2: 'TW', vn2: 'VN', americas: 'Americas', europe: 'Europe', sea: 'SEA', apac: 'APAC',
};
const ACCOUNT_TTL = 6 * 3600 * 1000;

/** GET of the Riot API with the game's key; JSON, or null on 404. */
export async function rget(ctx, game, host, path, query) {
  let res = null;
  for (const secret of KEYS[game]) {
    try {
      res = await ctx.http.secret({ url: `https://${host}.api.riotgames.com${path}`, query, auth: { secret, header: 'X-Riot-Token', format: 'plain' } });
      break;
    } catch (err) {
      const key = String(err?.message ?? err);
      if (key.includes('sdk.secret.not_shared')) continue;
      if (key.includes('sdk.http.timeout')) throw new StatsError('err.timeout');
      if (key.includes('sdk.http.too_big')) throw new StatsError('err.http', { status: 'too big' });
      throw err;
    }
  }
  if (!res) throw new StatsError(game === 'tft' ? 'err.not_set_up_tft' : 'err.not_set_up_riot');
  if (res.status >= 200 && res.status < 300) return res.json;
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) throw new StatsError('err.bad_riot_key');
  if (res.status === 429) throw new StatsError('err.rate');
  throw new StatsError('err.http', { status: res.status });
}

/** The account of a Riot ID for one game, with its server (LoL/TFT) or shard (LoR). */
export async function riotAccount(ctx, game, id, fallbackRegion, now = Date.now()) {
  const key = `ra:${game}:${riotId(id).toLowerCase()}`.slice(0, 128);
  const cached = await readJson(ctx, key, null);
  if (cached && now - cached.at < ACCOUNT_TTL) return cached;
  const home = REGIONS.includes(fallbackRegion) ? fallbackRegion : 'europe';
  const enc = encodeURIComponent;
  const d = await rget(ctx, game, home, `/riot/account/v1/accounts/by-riot-id/${enc(id.name)}/${enc(id.tag)}`);
  if (!d?.puuid) throw new StatsError('err.not_found', { id: riotId(id) });
  let platform = null;
  if (game === 'lor') {
    const s = await rget(ctx, game, home, `/riot/account/v1/active-shards/by-game/lor/by-puuid/${d.puuid}`);
    platform = String(s?.activeShard ?? '').toLowerCase() || null;
  } else {
    const r = await rget(ctx, game, home, `/riot/account/v1/region/by-game/${game}/by-puuid/${d.puuid}`);
    platform = String(r?.region ?? '').toLowerCase() || null;
  }
  const acc = { puuid: String(d.puuid), name: String(d.gameName ?? id.name), tag: String(d.tagLine ?? id.tag), platform, at: now };
  await writeJson(ctx, key, acc);
  return acc;
}

/** The regional host of an account's matches; a StatsError when the API has none. */
export function regionOf(game, acc) {
  const region = game === 'lor' ? acc.platform : PLATFORMS[acc.platform];
  if (!region || !(game === 'lor' ? LOR_REGIONS : REGIONS).includes(region)) throw new StatsError('err.no_server', { id: riotId(acc), server: acc.platform ?? '?' });
  return region;
}

/** The server host (LoL/TFT); a StatsError when unknown. */
export function platformOf(acc) {
  if (!PLATFORMS[acc.platform]) throw new StatsError('err.no_server', { id: riotId(acc), server: acc.platform ?? '?' });
  return acc.platform;
}

/** Match IDs, newest first. */
export async function matchIds(ctx, game, acc, count, query = {}) {
  const region = regionOf(game, acc);
  const path = game === 'lol' ? `/lol/match/v5/matches/by-puuid/${acc.puuid}/ids`
    : game === 'tft' ? `/tft/match/v1/matches/by-puuid/${acc.puuid}/ids`
      : `/lor/match/v1/matches/by-puuid/${acc.puuid}/ids`;
  const q = game === 'lor' ? {} : { count: String(count), ...query };
  const ids = await rget(ctx, game, region, path, q);
  return (Array.isArray(ids) ? ids.map(String) : []).slice(0, count);
}

/** One match (full DTO) or null. */
export async function match(ctx, game, acc, id) {
  const region = regionOf(game, acc);
  const path = game === 'lol' ? `/lol/match/v5/matches/${encodeURIComponent(id)}`
    : game === 'tft' ? `/tft/match/v1/matches/${encodeURIComponent(id)}`
      : `/lor/match/v1/matches/${encodeURIComponent(id)}`;
  return rget(ctx, game, region, path);
}

/**
 * Compact match summaries, newest first, cached in "rm:<game>:<puuid>"
 * (max. 20): only matches not seen before are loaded (max. `load` per call).
 */
export async function recentMatches(ctx, game, acc, count, compact, { load = 10, query = {} } = {}) {
  const key = `rm:${game}:${acc.puuid}`.slice(0, 128);
  const cache = await readJson(ctx, key, []);
  const ids = await matchIds(ctx, game, acc, count, query);
  const known = new Map(cache.map((m) => [m.id, m]));
  const missing = ids.filter((id) => !known.has(id)).slice(0, load);
  const loaded = await Promise.all(missing.map((id) => match(ctx, game, acc, id).catch((err) => {
    if (err instanceof StatsError && (err.code === 'err.rate' || err.code === 'err.timeout')) return null;
    throw err;
  })));
  for (const m of loaded) {
    const c = m ? compact(m, acc.puuid) : null;
    if (c) known.set(c.id, c);
  }
  const list = ids.map((id) => known.get(id)).filter(Boolean);
  const keep = [...known.values()].sort((a, b) => b.at - a.at).slice(0, 20);
  await writeJson(ctx, key, keep);
  return list;
}
