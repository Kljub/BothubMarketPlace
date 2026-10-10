// Service "tft": Teamfight Tactics ranks and matches (requests through
// services/riot.js), numbers and embeds.
import { riotId } from './henrik.js';
import { t } from './i18n.js';
import { emblem, rankName, rankScore } from './lol.js';
import { platformOf, rget, SERVER_NAMES } from './riot.js';

export const QUEUES = { 1100: 'Ranked', 1090: 'Normal', 1130: 'Hyper Roll', 1160: 'Double Up', 1210: 'Choncc\'s Treasure', 6000: 'Revival', 6100: 'Revival' };
const QUEUE_TYPES = { RANKED_TFT: 'tft.ranked', RANKED_TFT_DOUBLE_UP: 'tft.double_up', RANKED_TFT_TURBO: 'tft.hyper_roll' };
const MEDAL = (p) => (p === 1 ? '🥇' : p <= 4 ? '🟢' : '🔴');

/** "TFT13_Sniper" -> "Sniper", "TFT13_BloodHunter" -> "Blood Hunter". */
export const cleanName = (s) => String(s ?? '').replace(/^(TFT\d*_|Set\d+_)/i, '').replace(/([a-z])([A-Z])/g, '$1 $2');
export const lolchessUrl = (acc) => `https://lolchess.gg/profile/${(SERVER_NAMES[acc.platform] ?? 'euw').toLowerCase()}/${encodeURIComponent(`${acc.name}-${acc.tag}`)}`;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** Level and ranked entries. */
export async function profile(ctx, acc) {
  const p = platformOf(acc);
  const [summoner, entries] = await Promise.all([
    rget(ctx, 'tft', p, `/tft/summoner/v1/summoners/by-puuid/${acc.puuid}`),
    rget(ctx, 'tft', p, `/tft/league/v1/by-puuid/${acc.puuid}`),
  ]);
  const list = Array.isArray(entries) ? entries : [];
  return {
    level: Number(summoner?.summonerLevel) || 0,
    ranked: list.find((e) => e.queueType === 'RANKED_TFT') ?? null,
    others: list.filter((e) => e.queueType !== 'RANKED_TFT' && QUEUE_TYPES[e.queueType]),
  };
}

/** The player's part of a TFT match DTO. */
export function compact(m, puuid) {
  const info = m?.info;
  const p = info?.participants?.find?.((x) => x.puuid === puuid);
  if (!p) return null;
  const traits = (Array.isArray(p.traits) ? p.traits : []).filter((x) => Number(x.tier_current) > 0)
    .sort((a, b) => (Number(b.style) || 0) - (Number(a.style) || 0) || (Number(b.num_units) || 0) - (Number(a.num_units) || 0))
    .slice(0, 3).map((x) => [cleanName(x.name), Number(x.num_units) || 0]);
  return {
    id: String(m.metadata?.match_id ?? info.gameId), q: Number(info.queue_id ?? info.queueId) || 0, p: Number(p.placement) || 8,
    lvl: Number(p.level) || 0, dmg: Number(p.total_damage_to_players) || 0, traits, at: Number(info.game_datetime ?? info.gameCreation) || 0,
    set: Number(info.tft_set_number) || 0,
  };
}

export function summarize(list) {
  const traits = {};
  for (const m of list) for (const [name] of m.traits.slice(0, 1)) traits[name] = (traits[name] ?? 0) + 1;
  const games = list.length;
  return {
    games, avg: games ? (list.reduce((s, m) => s + m.p, 0) / games).toFixed(2) : '0.00',
    top4: pct(list.filter((m) => m.p <= 4).length, games), wins: list.filter((m) => m.p === 1).length,
    traits: Object.entries(traits).sort((a, b) => b[1] - a[1]).slice(0, 3),
  };
}

const rankLine = (L, e) => {
  if (!e) return t(L, 'unranked');
  if (e.ratedTier) return `**${String(e.ratedTier).charAt(0)}${String(e.ratedTier).slice(1).toLowerCase()}** · ${e.ratedRating}`;
  return `**${rankName(e)}** · ${e.leaguePoints} LP\n${t(L, 'tft.games_line', { games: e.wins + e.losses, top: e.wins })}`;
};

export function statsEmbed(L, acc, prof, sum, color) {
  const fields = [
    { name: t(L, 'tft.ranked'), value: rankLine(L, prof.ranked), inline: true },
    ...prof.others.map((e) => ({ name: t(L, QUEUE_TYPES[e.queueType]), value: rankLine(L, e), inline: true })),
    { name: t(L, 'account'), value: t(L, 'level', { n: prof.level, region: SERVER_NAMES[acc.platform] ?? acc.platform }), inline: true },
  ];
  if (sum.games) {
    fields.push({ name: t(L, 'tft.recent', { n: sum.games }), value: t(L, 'tft.recent_line', sum) });
    if (sum.traits.length) fields.push({ name: t(L, 'tft.traits'), value: sum.traits.map(([n, c]) => `${n} ×${c}`).join('\n'), inline: true });
  } else {
    fields.push({ name: t(L, 'tft.recent', { n: 0 }), value: t(L, 'no_recent_any') });
  }
  return {
    color,
    title: `♟️ ${riotId(acc)} · Teamfight Tactics`.slice(0, 256),
    url: lolchessUrl(acc),
    thumbnail_url: prof.ranked ? emblem(prof.ranked.tier) : undefined,
    fields,
    footer: { text: t(L, 'footer_riot') },
  };
}

export function matchLine(m) {
  return `${MEDAL(m.p)} **#${m.p}** · ${QUEUES[m.q] ?? 'TFT'} · ${m.traits.map(([n, c]) => `${c} ${n}`).join(', ') || '—'} · Lv ${m.lvl} · <t:${Math.floor(m.at / 1000)}:R>`;
}

export function matchesEmbed(L, acc, list, color) {
  return {
    color,
    title: `♟️ ${t(L, 'matches_title', { id: riotId(acc) })}`.slice(0, 256),
    url: lolchessUrl(acc),
    description: list.length ? list.map(matchLine).join('\n').slice(0, 4000) : t(L, 'no_recent_any'),
    footer: { text: t(L, 'footer_riot') },
  };
}

/** Tracker post of a new TFT match. */
export function matchPost(L, acc, m, before, after, color) {
  const lines = [`${QUEUES[m.q] ?? 'TFT'} · ${m.traits.map(([n, c]) => `${c} ${n}`).join(', ') || '—'} · Lv ${m.lvl}`];
  if (after && !after.ratedTier) {
    const diff = before && before.tier === after.tier && before.rank === after.rank ? after.leaguePoints - before.leaguePoints : null;
    lines.push(`${rankName(after)} · ${after.leaguePoints} LP${diff ? ` (${diff > 0 ? '+' : ''}${diff})` : ''}`);
    if (before && rankName(after) !== rankName(before)) lines.push(t(L, rankScore(after) > rankScore(before) ? 'post_rank_up' : 'post_rank_down', { from: rankName(before), to: rankName(after) }));
  }
  return {
    color: m.p === 1 ? '#f4c874' : m.p <= 4 ? '#22c55e' : m.p ? '#ef4444' : color,
    title: `${MEDAL(m.p)} ${riotId(acc)}: ${t(L, 'tft.place', { n: m.p })}`.slice(0, 256),
    url: lolchessUrl(acc),
    description: lines.join('\n'),
    footer: { text: t(L, 'footer_riot') },
    timestamp: true,
  };
}
