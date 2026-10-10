// Service "tracker": the task "tick" (every 5 minutes) checks the next few
// tracked players and posts their new matches: Valorant competitive matches
// with RR, LoL and TFT matches with LP, and rank ups or downs. Tracked are the
// linked members (one setting per game) and the Riot IDs of the settings
// list. The first check of a player only remembers the newest match, so
// nothing old is posted.
//
// Storage: "s:<game>:<puuid>" = { m (newest match ID), rank, at },
// "cur" = position of the round robin.
import { accountFor, RANKED, stateKey } from './games.js';
import { mmrHistory, parseRiotId, riotId, StatsError, storedMatches } from './henrik.js';
import { lang } from './i18n.js';
import { allLinks } from './links.js';
import * as lol from './lol.js';
import { match, matchIds, platformOf, rget } from './riot.js';
import * as tft from './tft.js';
import { matchPost as valoPost } from './valorant.js';
import { readJson, writeJson } from './storage.js';
import { setting } from './util.js';

export const PER_TICK = 8;
const MAX_POSTS = 3;
const LOL_RANKED = { 420: 'solo', 440: 'flex' };

/** Which games are tracked for linked members (settings). */
const linkedGames = (ctx) => RANKED.filter((g) => setting(ctx, `track_${g}`, true) !== false);

/** Who is tracked: [{ game, name, tag, channel, user }], one entry per game and Riot ID. */
export function trackedPlayers(ctx, links) {
  const max = Math.max(1, Math.min(100, Number(setting(ctx, 'max_tracked', 30)) || 30));
  const out = new Map();
  const add = (game, id, channel, user) => {
    const key = `${game}:${riotId(id).toLowerCase()}`;
    if (out.size < max && !out.has(key)) out.set(key, { game, name: id.name, tag: id.tag, channel, user });
  };
  for (const e of setting(ctx, 'players', [])) {
    const id = parseRiotId(e?.riot_id);
    if (!id) continue;
    const games = RANKED.includes(e.game) ? [e.game] : RANKED;
    for (const g of games) add(g, id, e.channel?.id ?? null, null);
  }
  const games = linkedGames(ctx);
  for (const l of links) for (const g of games) add(g, l, null, l.user);
  return [...out.values()];
}

/** The new entries after the remembered one (newest first in), oldest first out. */
export function freshEntries(list, last, idOf = (x) => x) {
  const idx = list.findIndex((x) => idOf(x) === last);
  return (idx === -1 ? list.slice(0, 1) : list.slice(0, idx)).slice(0, MAX_POSTS).reverse();
}

async function send(ctx, channel, embed, p, opts) {
  const ping = opts.ping && p.user;
  await ctx.message.send(channel, { content: ping ? `<@${p.user}>` : undefined, embeds: [embed], mentionUsers: ping ? true : undefined });
}

/** Valorant: competitive RR history; returns the number of posts. */
async function checkValorant(ctx, p, acc, prev, opts) {
  const history = await mmrHistory(ctx, acc, opts.platform);
  const newest = history[0] ?? null;
  const state = { ...(prev ?? {}), m: newest?.match_id ?? null, at: Date.now() };
  if (newest) state.rank = { tier: Number(newest.tier?.id) || 0, rr: Number(newest.rr) || 0, elo: Number(newest.elo) || 0 };
  let posted = 0;
  const channel = p.channel ?? opts.channel;
  if (prev && prev.m !== undefined && newest && newest.match_id !== prev.m && channel) {
    const fresh = freshEntries(history, prev.m, (h) => h.match_id);
    const details = opts.matches ? await storedMatches(ctx, acc, 'competitive', 5).catch(() => []) : [];
    let tier = Number(prev.rank?.tier) || 0;
    for (const h of fresh) {
      const now = Number(h.tier?.id) || 0;
      const rankChanged = tier >= 3 && now >= 3 && now !== tier;
      if (opts.matches || (opts.rank && rankChanged)) {
        const m = details.find((x) => x.meta.id === h.match_id) ?? null;
        await send(ctx, channel, valoPost(opts.lang, acc, h, tier, m, opts.color), p, opts).then(() => posted++, () => undefined);
      }
      tier = now;
    }
  }
  await writeJson(ctx, stateKey('valorant', acc.puuid), state);
  return posted;
}

const entryOf = (e) => (e ? { tier: e.tier, rank: e.rank, leaguePoints: Number(e.leaguePoints) || 0, wins: Number(e.wins) || 0, losses: Number(e.losses) || 0 } : null);

/** The ranked entries now (one request). */
async function rankNow(ctx, game, acc) {
  const path = game === 'lol' ? `/lol/league/v4/entries/by-puuid/${acc.puuid}` : `/tft/league/v1/by-puuid/${acc.puuid}`;
  const entries = await rget(ctx, game, platformOf(acc), path);
  const list = Array.isArray(entries) ? entries : [];
  return game === 'lol'
    ? { solo: entryOf(list.find((e) => e.queueType === 'RANKED_SOLO_5x5')), flex: entryOf(list.find((e) => e.queueType === 'RANKED_FLEX_SR')) }
    : { ranked: entryOf(list.find((e) => e.queueType === 'RANKED_TFT')) };
}

/** LoL and TFT: new match IDs, then the matches and the rank once. */
async function checkRiot(ctx, game, p, acc, prev, opts) {
  const ids = await matchIds(ctx, game, acc, MAX_POSTS);
  const state = { ...(prev ?? {}), m: ids[0] ?? null, at: Date.now() };
  let posted = 0;
  const channel = p.channel ?? opts.channel;
  // First check: the rank too, so the first ranked post shows the LP change.
  if (!prev?.rank) state.rank = await rankNow(ctx, game, acc);
  if (prev && prev.m !== undefined && ids[0] && ids[0] !== prev.m) {
    const fresh = freshEntries(ids, prev.m);
    const loaded = [];
    for (const id of fresh) {
      const m = await match(ctx, game, acc, id);
      const c = m ? (game === 'lol' ? lol.compact(m, acc.puuid) : tft.compact(m, acc.puuid)) : null;
      if (c) loaded.push(c);
    }
    const ranked = loaded.filter((m) => (game === 'lol' ? LOL_RANKED[m.q] : m.q === 1100));
    if (ranked.length) state.rank = await rankNow(ctx, game, acc);
    if (channel) {
      for (const m of loaded) {
        const slot = game === 'lol' ? LOL_RANKED[m.q] : m.q === 1100 ? 'ranked' : null;
        // The rank change belongs to the newest ranked match of its queue.
        const last = slot && ranked.filter((x) => (game === 'lol' ? LOL_RANKED[x.q] : 'ranked') === slot).at(-1) === m;
        const before = last ? prev.rank?.[slot] ?? null : null;
        const after = last ? state.rank?.[slot] ?? null : null;
        const changed = before && after && lol.rankName(before) !== lol.rankName(after);
        if (opts.matches || (opts.rank && changed)) {
          const embed = game === 'lol' ? lol.matchPost(opts.lang, acc, m, before, after, opts.color) : tft.matchPost(opts.lang, acc, m, before, after, opts.color);
          await send(ctx, channel, embed, p, opts).then(() => posted++, () => undefined);
        }
      }
    }
  }
  await writeJson(ctx, stateKey(game, acc.puuid), state);
  return posted;
}

/** Checks one tracked player in one game; returns the number of posts. */
export async function checkPlayer(ctx, p, opts) {
  const acc = await accountFor(ctx, p.game, p);
  const prev = await readJson(ctx, stateKey(p.game, acc.puuid), null);
  return p.game === 'valorant' ? checkValorant(ctx, p, acc, prev, opts) : checkRiot(ctx, p.game, p, acc, prev, opts);
}

/** One tick: the next PER_TICK players of the round robin. */
export async function tick(ctx) {
  const opts = {
    lang: lang(ctx),
    platform: setting(ctx, 'platform', 'pc') === 'console' ? 'console' : 'pc',
    channel: setting(ctx, 'channel', null)?.id ?? null,
    matches: setting(ctx, 'notify_matches', true) !== false,
    rank: setting(ctx, 'notify_rank', true) !== false,
    ping: setting(ctx, 'ping_members', false) === true,
    color: String(setting(ctx, 'color', '#ff4655')),
  };
  const players = trackedPlayers(ctx, await allLinks(ctx));
  if (!players.length) return 0;
  const start = Math.max(0, Number(await ctx.storage.get('cur')) || 0) % players.length;
  const turn = [];
  for (let i = 0; i < Math.min(PER_TICK, players.length); i++) turn.push(players[(start + i) % players.length]);
  await ctx.storage.set('cur', String((start + turn.length) % players.length));
  // A missing or refused key fails every player of that API the same way.
  const dead = new Set();
  let posted = 0;
  for (const p of turn) {
    const api = p.game === 'valorant' ? 'henrik' : p.game;
    if (dead.has(api)) continue;
    try {
      posted += await checkPlayer(ctx, p, opts);
    } catch (err) {
      if (!(err instanceof StatsError)) throw err;
      if (err.code.startsWith('err.not_set_up') || err.code.startsWith('err.bad_') || err.code === 'err.rate') dead.add(api);
    }
  }
  return posted;
}
