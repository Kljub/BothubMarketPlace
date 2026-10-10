// Service "valorant": Valorant numbers and embeds from the HenrikDev data. No requests here.
import { riotId } from './henrik.js';
import { t } from './i18n.js';

// Competitive tiers (Episode 5+ table of valorant-api.com): id -> name, color.
const TIER_NAMES = ['Unranked', 'Unused 1', 'Unused 2',
  'Iron 1', 'Iron 2', 'Iron 3', 'Bronze 1', 'Bronze 2', 'Bronze 3', 'Silver 1', 'Silver 2', 'Silver 3',
  'Gold 1', 'Gold 2', 'Gold 3', 'Platinum 1', 'Platinum 2', 'Platinum 3', 'Diamond 1', 'Diamond 2', 'Diamond 3',
  'Ascendant 1', 'Ascendant 2', 'Ascendant 3', 'Immortal 1', 'Immortal 2', 'Immortal 3', 'Radiant'];
const TIER_COLORS = { Iron: '#868986', Bronze: '#a5855d', Silver: '#bbc2c2', Gold: '#eccf56', Platinum: '#59a9b6', Diamond: '#b489c4', Ascendant: '#6ae2af', Immortal: '#bb3d65', Radiant: '#ffffaa' };
const TIER_TABLE = '03621f52-342b-cf4e-4f86-9350a49c6d04';

export const tierName = (id, L = 'en') => (Number(id) >= 3 && TIER_NAMES[Number(id)] ? TIER_NAMES[Number(id)] : t(L, 'unranked'));
export const tierColor = (id) => TIER_COLORS[TIER_NAMES[Number(id)]?.split(' ')[0]] ?? null;
export const tierIcon = (id) => (Number(id) >= 3 && Number(id) <= 27 ? `https://media.valorant-api.com/competitivetiers/${TIER_TABLE}/${Number(id)}/largeicon.png` : undefined);
export const cardArt = (card, kind = 'wideart') => (/^[0-9a-f-]{36}$/i.test(card ?? '') ? `https://media.valorant-api.com/playercards/${card}/${kind}.png` : undefined);
export const trackerUrl = (acc) => `https://tracker.gg/valorant/profile/riot/${encodeURIComponent(riotId(acc))}/overview`;

const signed = (n) => (Number(n) > 0 ? `+${Number(n)}` : String(Number(n) || 0));
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const fixed = (n) => (Number.isFinite(n) ? n.toFixed(2) : '0.00');
const unix = (iso) => Math.floor(Date.parse(iso) / 1000);

/** Win, loss or draw of a stored match, from the player's view; null without rounds (deathmatch). */
export function outcome(m) {
  const own = String(m.stats?.team ?? '').toLowerCase();
  const red = Number(m.teams?.red);
  const blue = Number(m.teams?.blue);
  if (!(own === 'red' || own === 'blue') || !Number.isFinite(red) || !Number.isFinite(blue) || red + blue === 0) return null;
  const mine = own === 'red' ? red : blue;
  const theirs = own === 'red' ? blue : red;
  return { result: mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw', score: `${mine}–${theirs}`, rounds: red + blue };
}

/** The numbers of one match. */
export function matchNumbers(m) {
  const s = m.stats;
  const o = outcome(m);
  const shots = (s.shots?.head ?? 0) + (s.shots?.body ?? 0) + (s.shots?.leg ?? 0);
  return {
    agent: String(s.character?.name ?? '?'), map: String(m.meta.map?.name ?? '?'), mode: String(m.meta.mode ?? ''),
    k: Number(s.kills) || 0, d: Number(s.deaths) || 0, a: Number(s.assists) || 0,
    acs: o ? Math.round((Number(s.score) || 0) / o.rounds) : Number(s.score) || 0,
    hs: pct(s.shots?.head ?? 0, shots), outcome: o, at: unix(m.meta.started_at),
  };
}

/** Totals over stored matches. */
export function summarize(matches) {
  const sum = { games: 0, w: 0, l: 0, k: 0, d: 0, a: 0, head: 0, shots: 0, damage: 0, score: 0, rounds: 0, agents: {}, maps: {} };
  for (const m of matches) {
    const s = m.stats;
    const o = outcome(m);
    sum.games++;
    if (o?.result === 'win') sum.w++;
    if (o?.result === 'loss') sum.l++;
    sum.k += Number(s.kills) || 0;
    sum.d += Number(s.deaths) || 0;
    sum.a += Number(s.assists) || 0;
    sum.head += s.shots?.head ?? 0;
    sum.shots += (s.shots?.head ?? 0) + (s.shots?.body ?? 0) + (s.shots?.leg ?? 0);
    if (o) {
      sum.damage += Number(s.damage?.made) || 0;
      sum.score += Number(s.score) || 0;
      sum.rounds += o.rounds;
    }
    const agent = String(s.character?.name ?? '?');
    sum.agents[agent] = (sum.agents[agent] ?? 0) + 1;
    const map = String(m.meta.map?.name ?? '?');
    const mp = (sum.maps[map] ??= { w: 0, l: 0 });
    if (o?.result === 'win') mp.w++;
    if (o?.result === 'loss') mp.l++;
  }
  return {
    games: sum.games, w: sum.w, l: sum.l, rate: pct(sum.w, sum.w + sum.l),
    kd: fixed(sum.k / Math.max(1, sum.d)), kda: fixed((sum.k + sum.a) / Math.max(1, sum.d)),
    hs: pct(sum.head, sum.shots), adr: Math.round(sum.damage / Math.max(1, sum.rounds)), acs: Math.round(sum.score / Math.max(1, sum.rounds)),
    agents: Object.entries(sum.agents).sort((a, b) => b[1] - a[1]).slice(0, 3),
    maps: Object.entries(sum.maps).sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l) || b[1].w - a[1].w).slice(0, 4),
  };
}

/** Rank now, peak, season from MMR v3 (null: no ranked data). */
export function rankOf(data, L) {
  const cur = data?.current;
  const tier = Number(cur?.tier?.id) || 0;
  const seasons = Array.isArray(data?.seasonal) ? data.seasonal : [];
  const season = seasons.at(-1) ?? null;
  return {
    tier, name: tierName(tier, L), rr: Number(cur?.rr) || 0, change: Number(cur?.last_change) || 0, elo: Number(cur?.elo) || 0,
    needed: Number(cur?.games_needed_for_rating) || 0, place: Number(cur?.leaderboard_placement?.rank) || 0,
    peak: data?.peak?.tier?.id >= 3 ? { name: tierName(data.peak.tier.id, L), season: String(data.peak.season?.short ?? '') } : null,
    season: season ? { short: String(season.season?.short ?? ''), wins: Number(season.wins) || 0, games: Number(season.games) || 0 } : null,
  };
}

/** The embed of /valorant. */
export function statsEmbed(L, acc, rank, sum, color) {
  const fields = [];
  if (rank) {
    const lines = [rank.tier >= 3 ? `**${rank.name}** · ${rank.rr} RR` : `**${t(L, 'unranked')}**`];
    if (rank.tier < 3 && rank.needed) lines.push(t(L, 'placements', { n: rank.needed }));
    if (rank.change) lines.push(t(L, 'last_game', { change: signed(rank.change) }));
    if (rank.place) lines.push(t(L, 'leaderboard_place', { n: rank.place }));
    if (rank.peak) lines.push(t(L, 'peak', { tier: rank.peak.name, season: rank.peak.season }));
    fields.push({ name: t(L, 'rank'), value: lines.join('\n'), inline: true });
  }
  fields.push({ name: t(L, 'account'), value: t(L, 'level', { n: acc.level, region: acc.region.toUpperCase() }), inline: true });
  if (rank?.season?.games) {
    fields.push({ name: t(L, 'season', { season: rank.season.short }), value: t(L, 'season_line', { wins: rank.season.wins, games: rank.season.games, rate: pct(rank.season.wins, rank.season.games) }), inline: true });
  }
  if (sum.games) {
    fields.push({ name: t(L, 'recent', { n: sum.games }), value: t(L, 'recent_line', sum) });
    fields.push({ name: t(L, 'agents'), value: sum.agents.map(([a, n]) => `${a} ×${n}`).join('\n') || '—', inline: true });
    fields.push({ name: t(L, 'maps'), value: sum.maps.map(([map, r]) => t(L, 'map_line', { map, w: r.w, l: r.l })).join('\n') || '—', inline: true });
  } else {
    fields.push({ name: t(L, 'recent', { n: 0 }), value: t(L, 'no_recent') });
  }
  return {
    color: (rank && tierColor(rank.tier)) || color,
    title: `🎯 ${riotId(acc)}${acc.title ? ` · ${acc.title}` : ''}`.slice(0, 256),
    url: trackerUrl(acc),
    thumbnail_url: rank ? tierIcon(rank.tier) : undefined,
    image_url: cardArt(acc.card),
    fields,
    footer: { text: t(L, 'footer') },
  };
}

const ICON = { win: '🟢', loss: '🔴', draw: '⚪' };

/** One line of /valorant-matches. */
export function matchLine(L, m) {
  const n = matchNumbers(m);
  const head = n.outcome ? `${ICON[n.outcome.result]} **${n.map}** ${n.outcome.score}` : `🔹 **${n.map}**`;
  return `${head} · ${n.mode} · ${n.agent} · ${n.k}/${n.d}/${n.a} · ACS ${n.acs} · HS ${n.hs} % · <t:${n.at}:R>`;
}

/** The embed of /valorant-matches. */
export function matchesEmbed(L, acc, matches, mode, color) {
  return {
    color,
    title: `🎯 ${t(L, 'matches_title', { id: riotId(acc) })}`.slice(0, 256),
    url: trackerUrl(acc),
    thumbnail_url: cardArt(acc.card, 'smallart'),
    description: matches.length ? matches.map((m) => matchLine(L, m)).join('\n').slice(0, 4000) : t(L, 'matches_none', { id: riotId(acc), mode: mode || t(L, 'mode.all') }),
    footer: { text: t(L, 'footer') },
  };
}

/** The tracker post of a new competitive match (m: stored match, may be missing). */
export function matchPost(L, acc, h, prevTier, m, color) {
  const tier = Number(h.tier?.id) || 0;
  const lines = [];
  const n = m ? matchNumbers(m) : null;
  if (n) lines.push(t(L, 'post_line', n));
  lines.push(t(L, 'post_rr', { tier: tierName(tier, L), rr: Number(h.rr) || 0, change: signed(h.last_change) }));
  if (prevTier && tier !== prevTier && tier >= 3) lines.push(t(L, tier > prevTier ? 'post_rank_up' : 'post_rank_down', { from: tierName(prevTier, L), to: tierName(tier, L) }));
  const result = n?.outcome?.result ?? (Number(h.last_change) > 0 ? 'win' : Number(h.last_change) < 0 ? 'loss' : 'draw');
  const map = n?.map ?? String(h.map?.name ?? '?');
  return {
    color: result === 'win' ? '#22c55e' : result === 'loss' ? '#ef4444' : color,
    title: `${ICON[result]} ${riotId(acc)}: ${t(L, result)}${n?.outcome ? ` ${n.outcome.score}` : ''} · ${map}`.slice(0, 256),
    url: trackerUrl(acc),
    thumbnail_url: tierIcon(tier),
    description: lines.join('\n'),
    footer: { text: t(L, 'footer') },
    timestamp: true,
  };
}
