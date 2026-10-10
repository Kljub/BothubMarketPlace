// Service "lol": League of Legends profile, ranks, mastery and matches
// (services/riot.js does the requests), numbers and embeds.
import { championName } from './champions.js';
import { riotId } from './henrik.js';
import { t } from './i18n.js';
import { platformOf, rget, SERVER_NAMES } from './riot.js';

const CDRAGON = 'https://raw.communitydragon.org/latest/plugins';
export const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const DIVISIONS = { IV: 0, III: 1, II: 2, I: 3 };
const TIER_COLORS = { IRON: '#5c5c5c', BRONZE: '#8c5a3c', SILVER: '#8a9ba8', GOLD: '#cd8837', PLATINUM: '#4e9996', EMERALD: '#2aa876', DIAMOND: '#576bce', MASTER: '#9d4dc3', GRANDMASTER: '#cd4545', CHALLENGER: '#f4c874' };

export const QUEUES = {
  420: 'Ranked Solo/Duo', 440: 'Ranked Flex', 400: 'Normal Draft', 430: 'Normal Blind', 490: 'Quickplay', 450: 'ARAM',
  1700: 'Arena', 1710: 'Arena', 900: 'ARURF', 1900: 'URF', 1300: 'Nexus Blitz', 1020: 'One for All', 700: 'Clash', 720: 'ARAM Clash',
  830: 'Co-op vs AI', 840: 'Co-op vs AI', 850: 'Co-op vs AI', 870: 'Co-op vs AI', 880: 'Co-op vs AI', 890: 'Co-op vs AI', 0: 'Custom',
};
/** Choices of /lol-matches: queue IDs of the filter. */
export const QUEUE_FILTER = { ranked: 420, flex: 440, normal: 400, quickplay: 490, aram: 450, arena: 1700 };
const ROLES = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Mid', BOTTOM: 'Bot', UTILITY: 'Support' };

const cap = (s) => String(s).charAt(0) + String(s).slice(1).toLowerCase();
export const rankName = (e) => (e ? `${cap(e.tier)}${TIERS.indexOf(e.tier) >= 7 ? '' : ` ${e.rank}`}` : '');
/** Comparable number of a rank: tier, division, LP. */
export const rankScore = (e) => (e && TIERS.includes(e.tier) ? TIERS.indexOf(e.tier) * 400 + (TIERS.indexOf(e.tier) >= 7 ? 0 : (DIVISIONS[e.rank] ?? 0) * 100) + (Number(e.leaguePoints) || 0) : -1);
export const emblem = (tier) => (TIERS.includes(tier) ? `${CDRAGON}/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tier.toLowerCase()}.png` : undefined);
export const championIcon = (id) => `${CDRAGON}/rcp-be-lol-game-data/global/default/v1/champion-icons/${Number(id) || -1}.png`;
export const profileIcon = (id) => `${CDRAGON}/rcp-be-lol-game-data/global/default/v1/profile-icons/${Number(id) || 29}.jpg`;
export const opggUrl = (acc) => `https://op.gg/lol/summoners/${(SERVER_NAMES[acc.platform] ?? 'euw').toLowerCase()}/${encodeURIComponent(`${acc.name}-${acc.tag}`)}`;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const fixed = (n) => (Number.isFinite(n) ? n.toFixed(2) : '0.00');

/** Level, icon, ranked entries and top mastery. */
export async function profile(ctx, acc) {
  const p = platformOf(acc);
  const [summoner, entries, mastery] = await Promise.all([
    rget(ctx, 'lol', p, `/lol/summoner/v4/summoners/by-puuid/${acc.puuid}`),
    rget(ctx, 'lol', p, `/lol/league/v4/entries/by-puuid/${acc.puuid}`),
    rget(ctx, 'lol', p, `/lol/champion-mastery/v4/champion-masteries/by-puuid/${acc.puuid}/top`, { count: '3' }),
  ]);
  const list = Array.isArray(entries) ? entries : [];
  return {
    level: Number(summoner?.summonerLevel) || 0,
    icon: Number(summoner?.profileIconId) || 0,
    solo: list.find((e) => e.queueType === 'RANKED_SOLO_5x5') ?? null,
    flex: list.find((e) => e.queueType === 'RANKED_FLEX_SR') ?? null,
    mastery: (Array.isArray(mastery) ? mastery : []).map((m) => ({ id: Number(m.championId), level: Number(m.championLevel) || 0, points: Number(m.championPoints) || 0 })),
  };
}

/** The player's part of a match-v5 DTO, small enough for storage. */
export function compact(m, puuid) {
  const info = m?.info;
  const p = info?.participants?.find?.((x) => x.puuid === puuid);
  if (!p) return null;
  const dur = Number(info.gameDuration) || 0;
  return {
    id: String(m.metadata?.matchId ?? `${info.platformId}_${info.gameId}`), q: Number(info.queueId) || 0,
    c: String(p.championName ?? '?'), cid: Number(p.championId) || 0, k: Number(p.kills) || 0, d: Number(p.deaths) || 0, a: Number(p.assists) || 0,
    w: p.gameEndedInEarlySurrender ? null : !!p.win, cs: (Number(p.totalMinionsKilled) || 0) + (Number(p.neutralMinionsKilled) || 0),
    dmg: Number(p.totalDamageDealtToChampions) || 0, pos: String(p.teamPosition ?? ''), dur, at: Number(info.gameEndTimestamp ?? info.gameCreation) || 0,
    penta: Number(p.pentaKills) || 0,
  };
}

/** Totals over compact matches. */
export function summarize(list) {
  const s = { games: list.length, w: 0, l: 0, k: 0, d: 0, a: 0, cs: 0, min: 0, champs: {}, roles: {} };
  for (const m of list) {
    if (m.w === true) s.w++;
    if (m.w === false) s.l++;
    s.k += m.k;
    s.d += m.d;
    s.a += m.a;
    s.cs += m.cs;
    s.min += m.dur / 60;
    const c = (s.champs[m.c] ??= { n: 0, w: 0 });
    c.n++;
    if (m.w) c.w++;
    if (ROLES[m.pos]) s.roles[ROLES[m.pos]] = (s.roles[ROLES[m.pos]] ?? 0) + 1;
  }
  return {
    games: s.games, w: s.w, l: s.l, rate: pct(s.w, s.w + s.l), kda: fixed((s.k + s.a) / Math.max(1, s.d)),
    k: fixed(s.k / Math.max(1, s.games)), d: fixed(s.d / Math.max(1, s.games)), a: fixed(s.a / Math.max(1, s.games)),
    csm: fixed(s.cs / Math.max(1, s.min)),
    champs: Object.entries(s.champs).sort((x, y) => y[1].n - x[1].n || y[1].w - x[1].w).slice(0, 3),
    role: Object.entries(s.roles).sort((x, y) => y[1] - x[1])[0]?.[0] ?? '',
  };
}

const rankLine = (L, e) => (e ? `**${rankName(e)}** · ${e.leaguePoints} LP\n${e.wins} W / ${e.losses} L (${pct(e.wins, e.wins + e.losses)} %)` : t(L, 'unranked'));

/** The embed of /lol. */
export function statsEmbed(L, acc, prof, sum, color) {
  const fields = [
    { name: t(L, 'lol.solo'), value: rankLine(L, prof.solo), inline: true },
    { name: t(L, 'lol.flex'), value: rankLine(L, prof.flex), inline: true },
    { name: t(L, 'account'), value: t(L, 'level', { n: prof.level, region: SERVER_NAMES[acc.platform] ?? acc.platform }), inline: true },
  ];
  if (prof.mastery.length) fields.push({ name: t(L, 'lol.mastery'), value: prof.mastery.map((m) => `${championName(m.id)} · ${t(L, 'lol.mastery_line', { level: m.level, points: m.points.toLocaleString('en-US') })}`).join('\n') });
  if (sum.games) {
    fields.push({ name: t(L, 'lol.recent', { n: sum.games }), value: t(L, 'lol.recent_line', sum) + (sum.role ? `\n${t(L, 'lol.role', { role: sum.role })}` : '') });
    fields.push({ name: t(L, 'lol.champs'), value: sum.champs.map(([c, r]) => `${c} · ${r.w}/${r.n}`).join('\n'), inline: true });
  } else {
    fields.push({ name: t(L, 'lol.recent', { n: 0 }), value: t(L, 'no_recent_any') });
  }
  const top = prof.solo ?? prof.flex;
  return {
    color: (top && TIER_COLORS[top.tier]) || color,
    title: `⚔️ ${riotId(acc)} · League of Legends`.slice(0, 256),
    url: opggUrl(acc),
    thumbnail_url: top ? emblem(top.tier) : profileIcon(prof.icon),
    fields,
    footer: { text: t(L, 'footer_riot') },
  };
}

const ICON = { true: '🟢', false: '🔴', null: '⚪' };
const minutes = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** One line of /lol-matches. */
export function matchLine(m) {
  const csm = (m.cs / Math.max(1, m.dur / 60)).toFixed(1);
  return `${ICON[String(m.w)]} **${m.c}** · ${QUEUES[m.q] ?? `Queue ${m.q}`} · ${m.k}/${m.d}/${m.a} · ${m.cs} CS (${csm}) · ${minutes(m.dur)}${m.penta ? ' · PENTA' : ''} · <t:${Math.floor(m.at / 1000)}:R>`;
}

export function matchesEmbed(L, acc, list, color) {
  return {
    color,
    title: `⚔️ ${t(L, 'matches_title', { id: riotId(acc) })}`.slice(0, 256),
    url: opggUrl(acc),
    description: list.length ? list.map(matchLine).join('\n').slice(0, 4000) : t(L, 'no_recent_any'),
    footer: { text: t(L, 'footer_riot') },
  };
}

/** Tracker post of a new match; before/after: ranked entries of its queue. */
export function matchPost(L, acc, m, before, after, color) {
  const lines = [`**${m.c}** · ${m.k}/${m.d}/${m.a} · ${m.cs} CS · ${minutes(m.dur)} · ${QUEUES[m.q] ?? `Queue ${m.q}`}`];
  if (after) {
    const diff = before && before.tier === after.tier && before.rank === after.rank ? after.leaguePoints - before.leaguePoints : null;
    lines.push(`${rankName(after)} · ${after.leaguePoints} LP${diff !== null && diff !== 0 ? ` (${diff > 0 ? '+' : ''}${diff})` : ''}`);
    if (before && rankScore(after) !== rankScore(before) && rankName(after) !== rankName(before)) {
      lines.push(t(L, rankScore(after) > rankScore(before) ? 'post_rank_up' : 'post_rank_down', { from: rankName(before), to: rankName(after) }));
    }
  }
  if (m.penta) lines.push('🔥 PENTAKILL');
  const result = m.w === true ? 'win' : m.w === false ? 'loss' : 'remake';
  return {
    color: m.w === true ? '#22c55e' : m.w === false ? '#ef4444' : color,
    title: `${ICON[String(m.w)]} ${riotId(acc)}: ${t(L, result)} · ${m.c}`.slice(0, 256),
    url: opggUrl(acc),
    thumbnail_url: championIcon(m.cid),
    description: lines.join('\n'),
    footer: { text: t(L, 'footer_riot') },
    timestamp: true,
  };
}
