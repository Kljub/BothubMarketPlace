// Service "steam": profile, games and account value of a Steam player from
// the official Steam Web API (key: the admin's secret STEAM_API_KEY, the bot
// adds it, the plugin never sees it) and the Steam store (prices, no key).
//
// A player is a SteamID64, a profile link or a custom URL name
// (steamcommunity.com/id/<name>). Games, playtime and friends need a public
// profile ("Game details" public); the value counts the current store prices.

export const API = 'https://api.steampowered.com';
export const STORE = 'https://store.steampowered.com';
export const KEY_SECRET = 'STEAM_API_KEY';
export const NOT_SET_UP = 'Steam Calc is not set up yet. An admin pastes a Steam Web API key (steamcommunity.com/dev/apikey) into the secret STEAM_API_KEY under Admin → API / Secrets.';
const AUTH = { secret: KEY_SECRET, format: 'query', param: 'key' };
/** Prices of at most this many games (most played first); more take too long. */
export const PRICE_GAMES = 600;
const PRICE_BATCH = 100;

/** A readable problem for the member. */
export class SteamError extends Error {}

async function call(ctx, url, query, auth) {
  let res;
  try {
    res = await ctx.http.secret({ url, query, ...(auth ? { auth: AUTH } : {}) });
  } catch (err) {
    const key = String(err?.message ?? err);
    if (key.includes('sdk.secret.not_shared')) throw new SteamError(NOT_SET_UP);
    if (key.includes('sdk.http.timeout')) throw new SteamError('Steam did not answer in time. Try again in a moment.');
    throw err;
  }
  if (res.status === 429) throw new SteamError('Steam: too many requests right now. Try again in a minute.');
  return res;
}
const api = (ctx, path, query) => call(ctx, `${API}${path}`, query, true);

/** SteamID64 of a name, link or ID; null when Steam knows no such player. */
export async function resolvePlayer(ctx, input) {
  const raw = String(input ?? '').trim();
  const profile = /steamcommunity\.com\/profiles\/(\d{17})/i.exec(raw);
  if (profile) return profile[1];
  if (/^\d{17}$/.test(raw)) return raw;
  const vanity = (/steamcommunity\.com\/id\/([^/?#\s]+)/i.exec(raw)?.[1] ?? raw).slice(0, 64);
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(vanity)) return null;
  const res = await api(ctx, '/ISteamUser/ResolveVanityURL/v1/', { vanityurl: vanity });
  if (res.status === 401 || res.status === 403) throw new SteamError('Steam refused the API key (wrong or revoked key).');
  const r = res.json?.response;
  return r?.success === 1 && /^\d{17}$/.test(String(r.steamid)) ? String(r.steamid) : null;
}

const STATES = ['Offline', 'Online', 'Busy', 'Away', 'Snooze', 'Looking to trade', 'Looking to play'];

/** Name, avatar, link, status, country, account age. */
export async function summary(ctx, steamId) {
  const p = (await api(ctx, '/ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId })).json?.response?.players?.[0];
  if (!p) return null;
  return {
    name: String(p.personaname ?? steamId),
    avatar: String(p.avatarfull ?? ''),
    url: String(p.profileurl ?? `https://steamcommunity.com/profiles/${steamId}`),
    public: p.communityvisibilitystate === 3,
    status: p.gameextrainfo ? `🎮 Playing ${p.gameextrainfo}` : (STATES[Number(p.personastate) || 0] ?? 'Offline'),
    country: String(p.loccountrycode ?? ''),
    created: Number(p.timecreated) || 0,
  };
}

/** Level, badges and XP (0 when private). */
export async function level(ctx, steamId) {
  const [lv, badges] = await Promise.all([
    api(ctx, '/IPlayerService/GetSteamLevel/v1/', { steamid: steamId }),
    api(ctx, '/IPlayerService/GetBadges/v1/', { steamid: steamId }),
  ]);
  return {
    level: Number(lv.json?.response?.player_level) || 0,
    badges: Array.isArray(badges.json?.response?.badges) ? badges.json.response.badges.length : 0,
    xp: Number(badges.json?.response?.player_xp) || 0,
  };
}

/** VAC and game bans. */
export async function bans(ctx, steamId) {
  const b = (await api(ctx, '/ISteamUser/GetPlayerBans/v1/', { steamids: steamId })).json?.players?.[0];
  return { vac: Number(b?.NumberOfVACBans) || 0, game: Number(b?.NumberOfGameBans) || 0, days: Number(b?.DaysSinceLastBan) || 0, community: b?.CommunityBanned === true };
}

/** Friends (null when the friend list is private). */
export async function friends(ctx, steamId) {
  const res = await api(ctx, '/ISteamUser/GetFriendList/v1/', { steamid: steamId, relationship: 'friend' });
  return res.status === 200 && Array.isArray(res.json?.friendslist?.friends) ? res.json.friendslist.friends.length : null;
}

/** Owned games, most played first (null when game details are private). */
export async function games(ctx, steamId) {
  const r = (await api(ctx, '/IPlayerService/GetOwnedGames/v1/', { steamid: steamId, include_appinfo: '1', include_played_free_games: '1' })).json?.response;
  if (!r || !Array.isArray(r.games)) return null;
  return r.games
    .map((g) => ({ appid: Number(g.appid), name: String(g.name ?? g.appid), minutes: Number(g.playtime_forever) || 0, twoWeeks: Number(g.playtime_2weeks) || 0 }))
    .sort((a, b) => b.minutes - a.minutes);
}

/**
 * Store prices of games in one country (cc, e.g. "de"): { appid: { initial,
 * final, currency, discount } } in cents; free or delisted games are missing.
 */
export async function prices(ctx, appids, cc) {
  const out = {};
  const list = appids.slice(0, PRICE_GAMES);
  const batches = [];
  for (let i = 0; i < list.length; i += PRICE_BATCH) batches.push(list.slice(i, i + PRICE_BATCH));
  // Two at a time: the store allows about 200 requests per 5 minutes.
  for (let i = 0; i < batches.length; i += 2) {
    const answers = await Promise.all(batches.slice(i, i + 2).map((b) => call(ctx, `${STORE}/api/appdetails`, { appids: b.join(','), filters: 'price_overview', cc }, false).catch(() => null)));
    for (const res of answers) {
      for (const [id, v] of Object.entries(res?.json ?? {})) {
        const p = v?.success ? v.data?.price_overview : null;
        if (p && Number.isFinite(Number(p.final))) out[id] = { initial: Number(p.initial) || Number(p.final), final: Number(p.final), currency: String(p.currency ?? ''), discount: Number(p.discount_percent) || 0 };
      }
    }
  }
  return out;
}

const n = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
export const hours = (min) => `${n(Math.floor(min / 60))} h`;
export const money = (cents, currency) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
};

/** Account value and playtime numbers of a game list with prices. */
export function calc(list, priceMap) {
  let value = 0;
  let full = 0;
  let priced = 0;
  let currency = '';
  for (const g of list) {
    const p = priceMap[g.appid];
    if (!p) continue;
    value += p.final;
    full += p.initial;
    priced += 1;
    currency ||= p.currency;
  }
  const minutes = list.reduce((s, g) => s + g.minutes, 0);
  const played = list.filter((g) => g.minutes > 0).length;
  return {
    games: list.length, played, unplayed: list.length - played, priced, minutes,
    twoWeeks: list.reduce((s, g) => s + g.twoWeeks, 0),
    value, full, currency,
    perHour: minutes >= 60 && value ? value / (minutes / 60) : 0,
    top: list.slice(0, 5),
  };
}
