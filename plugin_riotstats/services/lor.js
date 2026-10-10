// Service "lor": Legends of Runeterra matches (requests through
// services/riot.js). The API has no ranks below Master, so /lor shows the
// last matches: win rate, regions, game modes.
import { riotId } from './henrik.js';
import { t } from './i18n.js';
import { SERVER_NAMES } from './riot.js';

/** "faction_Demacia_Name" -> "Demacia", "faction_ShadowIsles_Name" -> "Shadow Isles". */
export const regionName = (f) => String(f ?? '').replace(/^faction_/, '').replace(/_Name$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** The player's part of a LoR match DTO. */
export function compact(m, puuid) {
  const info = m?.info;
  const p = info?.players?.find?.((x) => x.puuid === puuid);
  if (!p) return null;
  const outcome = String(p.game_outcome ?? '').toLowerCase();
  return {
    id: String(m.metadata?.match_id ?? ''), mode: String(info.game_type || info.game_mode || ''),
    w: outcome === 'win' ? true : outcome === 'loss' ? false : null, f: (p.factions ?? []).map(regionName).slice(0, 3),
    turns: Number(info.total_turn_count) || 0, at: Date.parse(info.game_start_time_utc) || 0,
  };
}

export function summarize(list) {
  const regions = {};
  for (const m of list) for (const f of m.f) regions[f] = (regions[f] ?? 0) + 1;
  const w = list.filter((m) => m.w === true).length;
  const l = list.filter((m) => m.w === false).length;
  return { games: list.length, w, l, rate: pct(w, w + l), regions: Object.entries(regions).sort((a, b) => b[1] - a[1]).slice(0, 4) };
}

const ICON = { true: '🟢', false: '🔴', null: '⚪' };
const modeName = (s) => String(s).replace(/([a-z])([A-Z])/g, '$1 $2') || '—';

export function statsEmbed(L, acc, list, color) {
  const sum = summarize(list);
  const fields = sum.games ? [
    { name: t(L, 'lor.recent', { n: sum.games }), value: t(L, 'lor.recent_line', sum), inline: true },
    { name: t(L, 'lor.regions'), value: sum.regions.map(([r, n]) => `${r} ×${n}`).join('\n') || '—', inline: true },
    { name: t(L, 'matches'), value: list.slice(0, 8).map((m) => `${ICON[String(m.w)]} ${m.f.join(' / ') || '—'} · ${modeName(m.mode)} · <t:${Math.floor(m.at / 1000)}:R>`).join('\n') },
  ] : [{ name: t(L, 'lor.recent', { n: 0 }), value: t(L, 'no_recent_any') }];
  return {
    color,
    title: `🃏 ${riotId(acc)} · Legends of Runeterra`.slice(0, 256),
    description: t(L, 'lor.shard', { shard: SERVER_NAMES[acc.platform] ?? acc.platform }),
    fields,
    footer: { text: t(L, 'footer_riot') },
  };
}
