// Fake HenrikDev and Riot APIs for the tests. `state` holds what changes
// between ticks: Valorant history/matches, LoL and TFT match IDs and ranks.
import { createTestContext } from '#sdk-testing';
import manifest from '../bothub.json' with { type: 'json' };

export const GUILD = '800000000000000001';
export const ANN = '700000000000000001';
export const BEN = '700000000000000002';
export const CHANNEL = '900000000000000001';
export const CARD = '9fb348bc-41a0-91ad-8a3e-818035c4e561';

export const vars = (user = ANN) => ({ 'server.id': GUILD, 'user.id': user, 'channel.id': CHANNEL });

/** A stored Valorant match of player p1. */
export const valoMatch = (id, { won = true, agent = 'Jett', k = 20, d = 10, a = 5, mode = 'Competitive', map = 'Ascent', at = '2026-10-09T20:00:00Z' } = {}) => ({
  meta: { id, map: { id: 'm', name: map }, version: 'x', mode, started_at: at, season: { id: 's', short: 'e10a1' }, region: 'eu', cluster: 'Frankfurt' },
  stats: { puuid: 'p1', team: 'Red', level: 213, character: { id: 'c', name: agent }, tier: 13, score: 5500, kills: k, deaths: d, assists: a, shots: { head: 25, body: 70, leg: 5 }, damage: { made: 3300, received: 2500 } },
  teams: won ? { red: 13, blue: 9 } : { red: 9, blue: 13 },
});
/** A Valorant competitive RR change. */
export const valoEntry = (id, tier, rr, change, date) => ({ match_id: id, tier: { id: tier, name: '' }, rr, last_change: change, elo: tier * 100 + rr, map: { id: 'm', name: 'Ascent' }, season: { id: 's', short: 'e10a1' }, refunded_rr: 0, was_derank_protected: false, date });

/** A LoL match-v5 DTO with player r1. */
export const lolMatch = (id, { win = true, champ = 'Jinx', cid = 222, k = 10, d = 2, a = 8, q = 420, cs = 200, dur = 1800, at = 1760000000000 } = {}) => ({
  metadata: { matchId: id, participants: ['r1'] },
  info: { gameDuration: dur, gameEndTimestamp: at, queueId: q, participants: [{ puuid: 'other', championName: 'Ahri', win: !win }, { puuid: 'r1', championName: champ, championId: cid, kills: k, deaths: d, assists: a, win, totalMinionsKilled: cs - 20, neutralMinionsKilled: 20, teamPosition: 'BOTTOM', totalDamageDealtToChampions: 25000, pentaKills: 0 }] },
});
/** A TFT match DTO with player r1. */
export const tftMatch = (id, { place = 1, q = 1100, at = 1760000000000 } = {}) => ({
  metadata: { match_id: id },
  info: { game_datetime: at, queue_id: q, tft_set_number: 15, participants: [{ puuid: 'r1', placement: place, level: 8, total_damage_to_players: 120, traits: [{ name: 'TFT15_Sniper', num_units: 4, style: 2, tier_current: 2 }, { name: 'TFT15_BattleAcademia', num_units: 3, style: 1, tier_current: 1 }, { name: 'TFT15_Duelist', num_units: 1, style: 0, tier_current: 0 }] }] },
});
const lorMatch = (id, outcome) => ({ metadata: { match_id: id }, info: { game_mode: 'Constructed', game_type: 'Ranked', game_start_time_utc: '2026-10-09T20:00:00Z', total_turn_count: 14, players: [{ puuid: 'r1', factions: ['faction_Demacia_Name', 'faction_ShadowIsles_Name'], game_outcome: outcome }] } });

export const freshState = () => ({
  history: [], matches: [],
  lolIds: ['L3', 'L2', 'L1'], lol: { L1: lolMatch('L1'), L2: lolMatch('L2', { win: false, champ: 'Ezreal', cid: 81, k: 3, d: 7, a: 4, q: 450 }), L3: lolMatch('L3', { k: 12, d: 3, a: 6 }) },
  solo: { queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 50, wins: 30, losses: 20 },
  tftIds: ['T2', 'T1'], tft: { T1: tftMatch('T1', { place: 5 }), T2: tftMatch('T2', { place: 1, q: 1160 }) },
  tftRank: { queueType: 'RANKED_TFT', tier: 'PLATINUM', rank: 'IV', leaguePoints: 10, wins: 3, losses: 20 },
});

const json = (data) => ({ json: data });
const notFound = { status: 404, json: { errors: [{ code: 22, message: 'Account not found', status: 404 }] } };

function henrik(state, seen) {
  return (req) => {
    seen.push(req);
    if (req.headers.Authorization !== 'hd-key') return { status: 403, json: { errors: [{ code: 0, message: 'Invalid API Key', status: 403 }] } };
    const path = decodeURIComponent(new URL(req.url).pathname);
    if (path.startsWith('/valorant/v2/account/')) {
      const [name, tag] = path.split('/').slice(4);
      if (name.toLowerCase() === 'kljub' && tag.toLowerCase() === 'euw') return json({ status: 200, data: { puuid: 'p1', region: 'eu', account_level: 213, name: 'Kljub', tag: 'EUW', card: CARD, title: 'Pro', platforms: ['PC'], updated_at: '' } });
      if (name === 'Ben' && tag === '1234') return json({ status: 200, data: { puuid: 'p2', region: 'eu', account_level: 40, name: 'Ben', tag: '1234', card: CARD, title: '', platforms: ['PC'], updated_at: '' } });
      return notFound;
    }
    if (path === '/valorant/v3/by-puuid/mmr/eu/pc/p1') {
      return json({ status: 200, data: { account: { name: 'Kljub', tag: 'EUW', puuid: 'p1' }, current: { tier: { id: 13, name: 'Gold 2' }, rr: 54, last_change: 18, elo: 1254, games_needed_for_rating: 0, rank_protection_shields: 0, leaderboard_placement: null }, peak: { season: { id: 's', short: 'e9a3' }, ranking_schema: 'x', tier: { id: 18, name: 'Diamond 1' }, rr: 10 }, seasonal: [{ season: { id: 's', short: 'e10a1' }, wins: 11, games: 20, end_tier: { id: 13, name: 'Gold 2' }, end_rr: 54, ranking_schema: 'x', act_wins: [] }] } });
    }
    if (path === '/valorant/v3/by-puuid/mmr/eu/pc/p2') {
      return json({ status: 200, data: { account: {}, current: { tier: { id: 20, name: 'Diamond 3' }, rr: 80, last_change: -5, elo: 2080, games_needed_for_rating: 0, rank_protection_shields: 0 }, peak: null, seasonal: [] } });
    }
    if (path === '/valorant/v2/by-puuid/mmr-history/eu/pc/p1') return json({ status: 200, data: { account: {}, history: state.history } });
    if (path === '/valorant/v1/by-puuid/stored-matches/eu/p1') {
      const list = state.matches.filter((m) => !req.query.mode || m.meta.mode.toLowerCase() === req.query.mode);
      return json({ status: 200, results: { total: list.length, returned: list.length, before: 0, after: 0 }, data: list.slice(0, Number(req.query.size) || 99) });
    }
    if (path.includes('/p2')) return json({ status: 200, data: path.includes('stored') ? [] : { account: {}, history: [] } });
    return { status: 404, json: { errors: [{ code: 0, message: 'Endpoint not found', status: 404 }] } };
  };
}

/** The Riot API: key "riot-key"; Kljub#EUW is r1 on EUW; Ben#1234 is r2 (unranked). */
function riot(state, seen) {
  return (req) => {
    seen.push(req);
    if (req.headers['X-Riot-Token'] !== 'riot-key') return { status: 403, json: { status: { message: 'Forbidden', status_code: 403 } } };
    const host = new URL(req.url).hostname.split('.')[0];
    const path = decodeURIComponent(new URL(req.url).pathname);
    const nf = { status: 404, json: { status: { message: 'Data not found', status_code: 404 } } };
    if (path.startsWith('/riot/account/v1/accounts/by-riot-id/')) {
      const [name, tag] = path.split('/').slice(6);
      if (name.toLowerCase() === 'kljub' && tag.toLowerCase() === 'euw') return json({ puuid: 'r1', gameName: 'Kljub', tagLine: 'EUW' });
      if (name === 'Ben' && tag === '1234') return json({ puuid: 'r2', gameName: 'Ben', tagLine: '1234' });
      return nf;
    }
    if (/^\/riot\/account\/v1\/region\/by-game\/(lol|tft)\//.test(path)) return json({ puuid: 'r1', game: 'lol', region: 'euw1' });
    if (path.startsWith('/riot/account/v1/active-shards/by-game/lor/')) return json({ puuid: 'r1', game: 'lor', activeShard: 'europe' });
    if (host === 'euw1') {
      const unranked = path.includes('/r2');
      if (path.startsWith('/lol/summoner/v4/summoners/by-puuid/') || path.startsWith('/tft/summoner/v1/')) return json({ puuid: 'r1', summonerLevel: 321, profileIconId: 29 });
      if (path.startsWith('/lol/league/v4/entries/by-puuid/')) return json(unranked ? [] : [state.solo]);
      if (path.startsWith('/tft/league/v1/by-puuid/')) return json(unranked ? [] : [state.tftRank]);
      if (path.startsWith('/lol/champion-mastery/v4/')) return json([{ championId: 222, championLevel: 12, championPoints: 345678 }, { championId: 81, championLevel: 7, championPoints: 120000 }]);
      return nf;
    }
    if (host === 'europe') {
      if (path === '/lol/match/v5/matches/by-puuid/r1/ids') {
        const ids = req.query.queue ? state.lolIds.filter((id) => String(state.lol[id].info.queueId) === req.query.queue) : state.lolIds;
        return json(ids.slice(0, Number(req.query.count) || 20));
      }
      if (path.startsWith('/lol/match/v5/matches/')) return state.lol[path.split('/').pop()] ? json(state.lol[path.split('/').pop()]) : nf;
      if (path === '/tft/match/v1/matches/by-puuid/r1/ids') return json(state.tftIds.slice(0, Number(req.query.count) || 20));
      if (path.startsWith('/tft/match/v1/matches/')) return state.tft[path.split('/').pop()] ? json(state.tft[path.split('/').pop()]) : nf;
      if (path === '/lor/match/v1/matches/by-puuid/r1/ids') return json(['R2', 'R1']);
      if (path === '/lor/match/v1/matches/R1') return json(lorMatch('R1', 'win'));
      if (path === '/lor/match/v1/matches/R2') return json(lorMatch('R2', 'loss'));
      if (path.includes('/r2/')) return json([]);
    }
    return nf;
  };
}

export function ctxWith(state = freshState(), { config = {}, secrets = { HENRIKDEV_API_KEY: 'hd-key', RIOT_API_KEY: 'riot-key' }, seen = [] } = {}) {
  const web = { 'api.henrikdev.xyz': henrik(state, seen) };
  for (const h of manifest.services.hosts) if (h.endsWith('.api.riotgames.com')) web[h] = riot(state, seen);
  return createTestContext({
    id: 'plugin_riotstats', permissions: manifest.sdk.permissions, manifest: { id: 'plugin_riotstats', secrets: manifest.services.secrets },
    hosts: manifest.services.hosts, secrets, web, config,
  });
}
