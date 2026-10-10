// Service "games": one interface over the four games, so blocks, the
// tracker and the leaderboard do not care which API a game uses.
//   valorant: HenrikDev API (services/henrik.js, services/valorant.js)
//   lol, tft, lor: official Riot API (services/riot.js, lol.js, tft.js, lor.js)
//
// Rank and tracker state per game and account:
// "s:<game>:<puuid>" = { m (newest match ID, tracker), rank, at }.
import * as henrik from './henrik.js';
import * as lol from './lol.js';
import * as lor from './lor.js';
import * as tft from './tft.js';
import * as valo from './valorant.js';
import { t } from './i18n.js';
import { recentMatches, riotAccount } from './riot.js';
import { readJson, writeJson } from './storage.js';
import { setting } from './util.js';

export const GAMES = ['valorant', 'lol', 'tft', 'lor'];
export const RANKED = ['valorant', 'lol', 'tft'];
export const GAME_NAMES = { valorant: 'Valorant', lol: 'League of Legends', tft: 'Teamfight Tactics', lor: 'Legends of Runeterra' };
export const MODES = {
  valorant: ['competitive', 'unrated', 'swiftplay', 'spikerush', 'deathmatch', 'teamdeathmatch', 'premier', 'all'],
  lol: ['all', 'ranked', 'flex', 'normal', 'quickplay', 'aram', 'arena'],
  tft: ['all', 'ranked', 'normal', 'hyperroll', 'doubleup'],
  lor: ['all'],
};
const TFT_QUEUES = { ranked: 1100, normal: 1090, hyperroll: 1130, doubleup: 1160 };

const color = (ctx) => String(setting(ctx, 'color', '#ff4655'));
const platform = (ctx) => (setting(ctx, 'platform', 'pc') === 'console' ? 'console' : 'pc');
const riotRegion = (ctx) => String(setting(ctx, 'riot_region', 'europe'));
const link = (url, label) => [[{ type: 'link', url, label, emoji: '📊' }]];

/** The account of a Riot ID in one game (cached). */
export async function accountFor(ctx, game, id) {
  try {
    return game === 'valorant' ? await henrik.account(ctx, id) : await riotAccount(ctx, game, id, riotRegion(ctx));
  } catch (err) {
    if (err instanceof henrik.StatsError) err.params.id ??= henrik.riotId(id);
    throw err;
  }
}

/** The cached account without a request (leaderboard); null when never loaded. */
export function cachedAccount(ctx, game, id) {
  const rid = henrik.riotId(id).toLowerCase();
  return readJson(ctx, (game === 'valorant' ? `a:${rid}` : `ra:${game}:${rid}`).slice(0, 128), null);
}

export const stateKey = (game, puuid) => `s:${game}:${puuid}`.slice(0, 128);

/** Saves the rank for the leaderboard (keeps the tracker's match ID). */
export async function rememberRank(ctx, game, puuid, rank) {
  const prev = await readJson(ctx, stateKey(game, puuid), null);
  await writeJson(ctx, stateKey(game, puuid), { ...(prev ?? {}), rank, at: Date.now() });
}

const entry = (e) => (e ? { tier: e.tier, rank: e.rank, leaguePoints: Number(e.leaguePoints) || 0, wins: Number(e.wins) || 0, losses: Number(e.losses) || 0 } : null);

/** The rank now (one or two requests), for link and leaderboard. */
export async function currentRank(ctx, game, acc) {
  if (game === 'valorant') {
    const d = await henrik.mmr(ctx, acc, platform(ctx));
    const r = d ? valo.rankOf(d, 'en') : null;
    return r ? { tier: r.tier, rr: r.rr, elo: r.elo } : null;
  }
  if (game === 'lol') {
    const p = await lol.profile(ctx, acc);
    return { solo: entry(p.solo), flex: entry(p.flex) };
  }
  if (game === 'tft') return { ranked: entry((await tft.profile(ctx, acc)).ranked) };
  return null;
}

/** Leaderboard value and text of a saved rank (score -1: unranked). */
export function rankView(L, game, rank) {
  if (game === 'valorant') {
    const ok = Number(rank?.tier) >= 3;
    return { score: ok ? Number(rank.elo) || Number(rank.tier) * 100 + (Number(rank.rr) || 0) : -1, text: ok ? `**${valo.tierName(rank.tier, L)}** · ${Number(rank.rr) || 0} RR` : t(L, 'unranked') };
  }
  const e = game === 'lol' ? rank?.solo : rank?.ranked;
  return { score: lol.rankScore(e), text: e ? `**${lol.rankName(e)}** · ${e.leaguePoints} LP` : t(L, 'unranked') };
}

/** /valorant, /lol, /tft, /lor: { message, results }. */
export async function stats(ctx, L, game, acc) {
  if (game === 'valorant') {
    const size = Math.max(5, Math.min(50, Number(setting(ctx, 'matches_window', 20)) || 20));
    const data = await henrik.mmr(ctx, acc, platform(ctx));
    const rank = data ? valo.rankOf(data, L) : null;
    if (rank) await rememberRank(ctx, game, acc.puuid, { tier: rank.tier, rr: rank.rr, elo: rank.elo });
    const sum = valo.summarize(await henrik.storedMatches(ctx, acc, 'competitive', size));
    return {
      message: { embeds: [valo.statsEmbed(L, acc, rank, sum, color(ctx))], components: link(valo.trackerUrl(acc), 'tracker.gg') },
      results: { '.rank': rank?.name ?? t(L, 'unranked'), '.points': String(rank?.rr ?? 0), '.winrate': String(sum.rate), '.kda': sum.kda, '.games': String(sum.games) },
    };
  }
  if (game === 'lol') {
    const [prof, list] = await Promise.all([lol.profile(ctx, acc), recentMatches(ctx, 'lol', acc, 10, lol.compact)]);
    await rememberRank(ctx, game, acc.puuid, { solo: entry(prof.solo), flex: entry(prof.flex) });
    const sum = lol.summarize(list);
    return {
      message: { embeds: [lol.statsEmbed(L, acc, prof, sum, color(ctx))], components: link(lol.opggUrl(acc), 'OP.GG') },
      results: { '.rank': prof.solo ? lol.rankName(prof.solo) : t(L, 'unranked'), '.points': String(prof.solo?.leaguePoints ?? 0), '.winrate': String(sum.rate), '.kda': sum.kda, '.games': String(sum.games) },
    };
  }
  if (game === 'tft') {
    const [prof, list] = await Promise.all([tft.profile(ctx, acc), recentMatches(ctx, 'tft', acc, 10, tft.compact)]);
    await rememberRank(ctx, game, acc.puuid, { ranked: entry(prof.ranked) });
    const sum = tft.summarize(list);
    return {
      message: { embeds: [tft.statsEmbed(L, acc, prof, sum, color(ctx))], components: link(tft.lolchessUrl(acc), 'lolchess.gg') },
      results: { '.rank': prof.ranked ? lol.rankName(prof.ranked) : t(L, 'unranked'), '.points': String(prof.ranked?.leaguePoints ?? 0), '.winrate': String(sum.top4), '.kda': sum.avg, '.games': String(sum.games) },
    };
  }
  const list = await recentMatches(ctx, 'lor', acc, 10, lor.compact);
  const sum = lor.summarize(list);
  return { message: { embeds: [lor.statsEmbed(L, acc, list, color(ctx))] }, results: { '.rank': '', '.points': '0', '.winrate': String(sum.rate), '.kda': '', '.games': String(sum.games) } };
}

/** /valorant-matches, /lol-matches, /tft-matches: { message, count }. */
export async function matches(ctx, L, game, acc, rawMode) {
  const modes = MODES[game];
  const mode = modes.includes(String(rawMode ?? '').toLowerCase()) ? String(rawMode).toLowerCase() : modes[0];
  if (game === 'valorant') {
    const list = await henrik.storedMatches(ctx, acc, mode === 'all' ? '' : mode, 8);
    return { message: { embeds: [valo.matchesEmbed(L, acc, list, mode === 'all' ? '' : mode, color(ctx))], components: link(valo.trackerUrl(acc), 'tracker.gg') }, count: list.length };
  }
  if (game === 'lol') {
    const q = lol.QUEUE_FILTER[mode];
    const list = await recentMatches(ctx, 'lol', acc, 8, lol.compact, { query: q ? { queue: String(q) } : {} });
    return { message: { embeds: [lol.matchesEmbed(L, acc, list, color(ctx))], components: link(lol.opggUrl(acc), 'OP.GG') }, count: list.length };
  }
  if (game === 'tft') {
    const q = TFT_QUEUES[mode];
    const list = (await recentMatches(ctx, 'tft', acc, q ? 20 : 8, tft.compact)).filter((m) => !q || m.q === q).slice(0, 8);
    return { message: { embeds: [tft.matchesEmbed(L, acc, list, color(ctx))], components: link(tft.lolchessUrl(acc), 'lolchess.gg') }, count: list.length };
  }
  const list = await recentMatches(ctx, 'lor', acc, 10, lor.compact);
  return { message: { embeds: [lor.statsEmbed(L, acc, list, color(ctx))] }, count: list.length };
}
