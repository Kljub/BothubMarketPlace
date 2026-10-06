// Service "achievements": Steam achievements of a player in a game, with
// names, icons and how many players have each (global percentages), and the
// tracker: the players of the settings are checked every 30 minutes; new
// achievements in their recently played games are posted.
//
// Storage: "ach:<steamid64>" = { <appid>: newest unlock time (seconds) }.
import { API, resolvePlayer, SteamError, summary } from './steam.js';
import { setting } from './util.js';

const AUTH = { secret: 'STEAM_API_KEY', format: 'query', param: 'key' };
const STORE = 'https://store.steampowered.com';

async function get(ctx, path, query, auth = true) {
  const res = await ctx.http.secret({ url: `${API}${path}`, query, ...(auth ? { auth: AUTH } : {}) });
  if (res.status === 429) throw new SteamError('Steam: too many requests right now. Try again in a minute.');
  return res;
}

/** App ID of a game: ID, store link or name (store search); null when none. */
export async function findGame(ctx, input) {
  const raw = String(input ?? '').trim();
  const link = /store\.steampowered\.com\/app\/(\d{1,10})/i.exec(raw);
  if (link) return Number(link[1]);
  if (/^\d{1,10}$/.test(raw)) return Number(raw);
  if (raw.length < 2) return null;
  const res = await ctx.http.secret({ url: `${STORE}/api/storesearch/`, query: { term: raw.slice(0, 100), cc: 'us', l: 'english' } });
  const id = res.json?.items?.[0]?.id;
  return Number(id) > 0 ? Number(id) : null;
}

/**
 * Achievements of a player in a game: [{ id, name, description, icon,
 * unlocked, time, percent }], or null (no achievements / game details
 * private / game not owned) with the reason.
 */
export async function playerAchievements(ctx, steamId, appid) {
  const [mine, schema, global] = await Promise.all([
    get(ctx, '/ISteamUserStats/GetPlayerAchievements/v1/', { steamid: steamId, appid: String(appid), l: 'english' }),
    get(ctx, '/ISteamUserStats/GetSchemaForGame/v2/', { appid: String(appid), l: 'english' }),
    get(ctx, '/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/', { gameid: String(appid) }).catch(() => null),
  ]);
  const stats = mine.json?.playerstats;
  if (!stats?.success || !Array.isArray(stats.achievements)) {
    const why = String(stats?.error ?? '');
    return { list: null, game: String(stats?.gameName ?? appid), reason: /private/i.test(why) ? 'private' : /no stats/i.test(why) || mine.status === 400 ? 'none' : 'private' };
  }
  const icons = new Map((schema.json?.game?.availableGameStats?.achievements ?? []).map((a) => [a.name, a]));
  const pct = new Map((global?.json?.achievementpercentages?.achievements ?? []).map((a) => [a.name, Number(a.percent)]));
  const list = stats.achievements.map((a) => {
    const s = icons.get(a.apiname);
    return {
      id: String(a.apiname),
      name: String(a.name ?? s?.displayName ?? a.apiname),
      description: String(a.description ?? s?.description ?? ''),
      icon: String((a.achieved ? s?.icon : s?.icongray) ?? ''),
      unlocked: a.achieved === 1,
      time: Number(a.unlocktime) || 0,
      percent: pct.has(a.apiname) ? pct.get(a.apiname) : null,
    };
  });
  return { list, game: String(stats.gameName ?? schema.json?.game?.gameName ?? appid), reason: null };
}

const pctText = (p) => (p === null || p === undefined ? '' : ` · ${p < 1 ? p.toFixed(2) : p.toFixed(1)} % of players`);

/** The overview embed of /steam-achievements. */
export function achievementsEmbed(player, game, appid, list, color) {
  const done = list.filter((a) => a.unlocked);
  const pct = list.length ? Math.round((done.length / list.length) * 100) : 0;
  const bar = '▰'.repeat(Math.round(pct / 10)) + '▱'.repeat(10 - Math.round(pct / 10));
  const recent = [...done].sort((a, b) => b.time - a.time).slice(0, 5);
  const rarest = [...done].filter((a) => a.percent !== null).sort((a, b) => a.percent - b.percent).slice(0, 3);
  const next = list.filter((a) => !a.unlocked && a.percent !== null).sort((a, b) => b.percent - a.percent).slice(0, 3);
  const fields = [
    { name: '🏆 Progress', value: `**${done.length} / ${list.length}** (${pct} %)\n${bar}` },
    { name: '🕒 Latest', value: recent.length ? recent.map((a) => `**${a.name}** <t:${a.time}:R>`).join('\n') : '—', inline: true },
    { name: '💎 Rarest unlocked', value: rarest.length ? rarest.map((a) => `**${a.name}**${pctText(a.percent)}`).join('\n') : '—', inline: true },
  ];
  if (next.length) fields.push({ name: '🎯 Easiest still missing', value: next.map((a) => `**${a.name}**${pctText(a.percent)}`).join('\n') });
  return {
    color, title: `🏆 ${player.name} — ${game}`, url: `https://steamcommunity.com/profiles/${player.steamId}/stats/${appid}/achievements/`,
    thumbnail_url: recent[0]?.icon || player.avatar || undefined, fields,
  };
}

/** Achievements unlocked after the stored time, oldest first (max. 5). */
export function newUnlocks(list, since) {
  return list.filter((a) => a.unlocked && a.time > since).sort((a, b) => a.time - b.time).slice(-5);
}

/** Every 30 minutes: new achievements of the tracked players. */
export async function trackAchievements(ctx) {
  const channel = setting(ctx, 'achievement_channel', null)?.id;
  const players = setting(ctx, 'achievement_players', []).filter((p) => String(p?.player ?? '').trim());
  if (!channel || !players.length) return 0;
  const color = String(setting(ctx, 'color', '#1b2838'));
  let posted = 0;
  for (const entry of players.slice(0, 25)) {
    let steamId;
    try {
      steamId = await resolvePlayer(ctx, entry.player);
    } catch (err) {
      if (err instanceof SteamError) return posted; // not set up / Steam busy: next time
      throw err;
    }
    if (!steamId) continue;
    const recent = await get(ctx, '/IPlayerService/GetRecentlyPlayedGames/v1/', { steamid: steamId, count: '3' }).catch(() => null);
    const games = (recent?.json?.response?.games ?? []).slice(0, 3);
    if (!games.length) continue;
    const key = `ach:${steamId}`;
    const raw = await ctx.storage.get(key);
    const seen = raw ? JSON.parse(raw) : {};
    let player = null;
    for (const g of games) {
      const appid = String(g.appid);
      const res = await playerAchievements(ctx, steamId, appid).catch(() => null);
      if (!res?.list) continue;
      const newest = Math.max(0, ...res.list.filter((a) => a.unlocked).map((a) => a.time));
      // First check of a game: only remember, post nothing old.
      if (seen[appid] !== undefined) {
        const fresh = newUnlocks(res.list, seen[appid]);
        if (fresh.length) player ??= await summary(ctx, steamId);
        const done = res.list.filter((a) => a.unlocked).length;
        for (const a of fresh) {
          await ctx.message.send(channel, {
            embeds: [{
              color, title: `🏆 ${player?.name ?? entry.player} unlocked "${a.name}"`.slice(0, 256),
              url: `https://steamcommunity.com/profiles/${steamId}/stats/${appid}/achievements/`,
              description: `${a.description ? `${a.description}\n` : ''}**${res.game}** · ${done} / ${res.list.length}${pctText(a.percent)}`,
              thumbnail_url: a.icon || undefined, timestamp: true,
            }],
          }).then(() => posted++, () => undefined);
        }
      }
      seen[appid] = Math.max(seen[appid] ?? 0, newest);
    }
    await ctx.storage.set(key, JSON.stringify(seen));
  }
  return posted;
}
