// Service "steam": Dead by Daylight statistics from the official Steam Web
// API (the same numbers sites like deadbystats.eu show). The API key is the
// admin's secret STEAM_API_KEY: the install creates it empty under Admin →
// API / Secrets, shared with this plugin; the bot adds it to the request
// ("secrets.use"), the plugin never sees it.
//
// A player is a SteamID64, a profile link or a custom URL name
// (steamcommunity.com/id/<name>). Their Steam profile and game details must be
// public, else Steam answers without statistics.

export const API = 'https://api.steampowered.com';
export const APP_ID = '381210';
export const KEY_SECRET = 'STEAM_API_KEY';
export const NOT_SET_UP = 'DBD Stats is not set up yet. An admin pastes a Steam Web API key (steamcommunity.com/dev/apikey) into the secret STEAM_API_KEY under Admin → API / Secrets.';
const AUTH = { secret: KEY_SECRET, format: 'query', param: 'key' };

/** A readable problem for the member. */
export class StatsError extends Error {}

async function get(ctx, path, query) {
  let res;
  try {
    res = await ctx.http.secret({ url: `${API}${path}`, query, auth: AUTH });
  } catch (err) {
    const key = String(err?.message ?? err);
    if (key.includes('sdk.secret.not_shared')) throw new StatsError(NOT_SET_UP);
    if (key.includes('sdk.http.timeout')) throw new StatsError('Steam did not answer in time. Try again in a moment.');
    throw err;
  }
  if (res.status === 401 || res.status === 403) {
    // GetUserStatsForGame answers 403 for private profiles too; the caller tells them apart.
    return { status: res.status, json: res.json };
  }
  if (res.status === 429) throw new StatsError('Steam: too many requests right now. Try again in a minute.');
  if (res.status >= 400 && res.status !== 400 && res.status !== 500) throw new StatsError(`Steam answered with HTTP ${res.status}.`);
  return res;
}

/** SteamID64 of a name, link or ID; null when Steam knows no such player. */
export async function resolvePlayer(ctx, input) {
  const raw = String(input ?? '').trim();
  const profile = /steamcommunity\.com\/profiles\/(\d{17})/i.exec(raw);
  if (profile) return profile[1];
  if (/^\d{17}$/.test(raw)) return raw;
  const vanity = (/steamcommunity\.com\/id\/([^/?#\s]+)/i.exec(raw)?.[1] ?? raw).slice(0, 64);
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(vanity)) return null;
  const res = await get(ctx, '/ISteamUser/ResolveVanityURL/v1/', { vanityurl: vanity });
  if (res.status === 401 || res.status === 403) throw new StatsError('Steam refused the API key (wrong or revoked key).');
  const r = res.json?.response;
  return r?.success === 1 && /^\d{17}$/.test(String(r.steamid)) ? String(r.steamid) : null;
}

/** Name, avatar and profile link. */
export async function playerSummary(ctx, steamId) {
  const res = await get(ctx, '/ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId });
  const p = res.json?.response?.players?.[0];
  return p ? { name: String(p.personaname ?? steamId), avatar: String(p.avatarfull ?? ''), url: String(p.profileurl ?? `https://steamcommunity.com/profiles/${steamId}`), visible: p.communityvisibilitystate === 3 } : null;
}

/** The DBD stats as { name: value }; null when they are not public. */
export async function dbdStats(ctx, steamId) {
  const res = await get(ctx, '/ISteamUserStats/GetUserStatsForGame/v2/', { appid: APP_ID, steamid: steamId });
  const list = res.json?.playerstats?.stats;
  if (!Array.isArray(list)) return null;
  const stats = {};
  for (const s of list) if (s && typeof s.name === 'string') stats[s.name] = Number(s.value) || 0;
  stats.achievements = Array.isArray(res.json.playerstats.achievements) ? res.json.playerstats.achievements.length : 0;
  return stats;
}

/** Playtime in minutes (all, last two weeks); null when game details are private. */
export async function playtime(ctx, steamId) {
  const res = await get(ctx, '/IPlayerService/GetOwnedGames/v1/', { steamid: steamId, include_played_free_games: '1', 'appids_filter[0]': APP_ID });
  const g = res.json?.response?.games?.find?.((x) => String(x.appid) === APP_ID);
  return g ? { total: Number(g.playtime_forever) || 0, twoWeeks: Number(g.playtime_2weeks) || 0 } : null;
}

const n = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
const hours = (min) => `${Math.floor(min / 60).toLocaleString('en-US')}h ${min % 60}m`;

/** The numbers of the answer (Steam stat names of Dead by Daylight). */
export function summarize(stats, time) {
  const s = (k) => stats[k] ?? 0;
  const escapes = s('DBD_Escape') + s('DBD_EscapeKO') + s('DBD_EscapeThroughHatch');
  const kills = s('DBD_SacrificedCampers') + s('DBD_KilledCampers');
  const bp = s('DBD_BloodwebPoints');
  return {
    bloodpoints: n(bp),
    bpMostOneCharacter: n(s('DBD_MaxBloodwebPointsOneCategory')),
    playtime: time ? hours(time.total) : 'private',
    twoWeeks: time ? hours(time.twoWeeks) : 'private',
    bpPerHour: time && time.total >= 60 ? n(bp / (time.total / 60)) : '—',
    escapes: n(escapes),
    escapesGates: n(s('DBD_Escape')),
    escapesCrawling: n(s('DBD_EscapeKO')),
    escapesHatch: n(s('DBD_EscapeThroughHatch')),
    generators: n(s('DBD_GeneratorPct_float')),
    heals: n(s('DBD_HealPct_float')),
    unhooks: n(s('DBD_UnhookOrHeal')),
    skillChecks: n(s('DBD_SkillCheckSuccess')),
    totems: n(s('DBD_DLC3_Camper_Stat1')),
    gates: n(s('DBD_DLC7_Camper_Stat2')),
    kills: n(kills),
    sacrificed: n(s('DBD_SacrificedCampers')),
    killed: n(s('DBD_KilledCampers')),
    hatchesClosed: n(s('DBD_Chapter13_Slasher_Stat1')),
    basementHooks: n(s('DBD_DLC6_Slasher_Stat2')),
    achievements: n(stats.achievements),
  };
}

/** The embed of /dbd-stats. */
export function statsEmbed(player, sum, color) {
  return {
    color,
    title: `🩸 ${player.name} — Dead by Daylight`,
    url: player.url,
    thumbnail_url: player.avatar || undefined,
    fields: [
      { name: 'Bloodpoints', value: `${sum.bloodpoints}\nMost on one character: ${sum.bpMostOneCharacter}`, inline: true },
      { name: 'Time played', value: `${sum.playtime}\nLast 2 weeks: ${sum.twoWeeks}\nBP per hour: ${sum.bpPerHour}`, inline: true },
      { name: 'Achievements', value: sum.achievements, inline: true },
      { name: '🏃 Survivor', value: `**${sum.escapes}** escapes (gates ${sum.escapesGates} · crawling ${sum.escapesCrawling} · hatch ${sum.escapesHatch})\nGenerators repaired: ${sum.generators}\nHealed: ${sum.heals} · Unhooked/picked up: ${sum.unhooks}\nSkill checks: ${sum.skillChecks} · Totems cleansed: ${sum.totems}\nExit gates opened: ${sum.gates}` },
      { name: '🔪 Killer', value: `**${sum.kills}** kills (sacrificed ${sum.sacrificed} · killed ${sum.killed})\nHatches closed: ${sum.hatchesClosed}\nBasement hooks: ${sum.basementHooks}` },
    ],
    footer: 'Steam statistics · deadbystats.eu has the full breakdown',
  };
}
