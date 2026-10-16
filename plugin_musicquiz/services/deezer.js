// Service "deezer": the songs of a quiz from the public Deezer API (no key):
// charts per genre, decade playlists (found by a search) or any public
// playlist. Every Deezer track has a 30 second preview (MP3 on
// cdnt-preview.dzcdn.net) that the Music module streams.
const API = 'https://api.deezer.com';

/** Quiz sources: a genre chart (Deezer genre id) or a playlist search. */
export const SOURCES = {
  charts: { chart: 0 },
  pop: { chart: 132 },
  rap: { chart: 116 },
  rock: { chart: 152 },
  dance: { chart: 113 },
  rnb: { chart: 165 },
  alternative: { chart: 85 },
  electro: { chart: 106 },
  metal: { chart: 464 },
  german: { chart: 459 },
  latin: { chart: 197 },
  country: { chart: 84 },
  jazz: { chart: 129 },
  classical: { chart: 98 },
  soundtrack: { chart: 173 },
  kids: { chart: 95 },
  '60s': { search: '60s hits' },
  '70s': { search: '70s hits' },
  '80s': { search: '80s hits' },
  '90s': { search: '90s hits' },
  '2000s': { search: '2000s hits' },
  '2010s': { search: '2010s hits' },
};

export class SourceError extends Error {
  constructor(key) {
    super(key);
    this.key = key;
  }
}

/** A Deezer playlist id from an id or a deezer.com link; null otherwise. */
export function playlistId(text) {
  const s = String(text ?? '').trim();
  if (/^\d{1,15}$/.test(s)) return s;
  const m = s.match(/^https?:\/\/(?:www\.)?deezer\.com\/(?:[a-z]{2}\/)?playlist\/(\d{1,15})/i);
  return m ? m[1] : null;
}

async function get(ctx, path, query = {}) {
  const res = await ctx.http.get(`${API}${path}`, { query }).catch(() => null);
  const json = res?.status === 200 ? res.json : null;
  if (!json || json.error) throw new SourceError('err.source');
  return json;
}

/** Plain track: { id, title, artist, preview, link, cover }; null without a preview. */
export function track(t) {
  if (!t || t.readable === false || !/^https:\/\/cdnt-preview\.dzcdn\.net\//.test(String(t.preview ?? ''))) return null;
  const title = String(t.title_short || t.title || '').trim();
  const artist = String(t.artist?.name ?? '').trim();
  if (!title || !artist) return null;
  return {
    id: String(t.id),
    title: title.slice(0, 100),
    artist: artist.slice(0, 100),
    preview: t.preview,
    link: /^https:\/\/www\.deezer\.com\//.test(String(t.link ?? '')) ? t.link : '',
    cover: /^https:\/\//.test(String(t.album?.cover_medium ?? '')) ? t.album.cover_medium : '',
  };
}

/** "Song (Remastered 2011)" and "song" are the same answer. */
export const norm = (s) => String(s).toLowerCase().replace(/\s*[([].*?[)\]]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The tracks of a source key or playlist; distinct songs only. */
export async function loadTracks(ctx, { source = 'charts', playlist = '' } = {}) {
  let list;
  const pid = playlist ? playlistId(playlist) : null;
  if (playlist && !pid) throw new SourceError('err.playlist');
  if (pid) {
    list = (await get(ctx, `/playlist/${pid}/tracks`, { limit: '300' })).data;
  } else {
    const src = SOURCES[source] ?? SOURCES.charts;
    if (src.search) {
      const found = (await get(ctx, '/search/playlist', { q: src.search, limit: '10' })).data ?? [];
      const best = found.filter((p) => Number(p.nb_tracks) >= 30).sort((a, b) => Number(b.nb_tracks) - Number(a.nb_tracks))[0] ?? found[0];
      if (!best?.id) throw new SourceError('err.source');
      list = (await get(ctx, `/playlist/${best.id}/tracks`, { limit: '300' })).data;
    } else {
      list = (await get(ctx, `/chart/${src.chart}/tracks`, { limit: '100' })).data;
    }
  }
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const t = track(raw);
    const key = t && `${norm(t.title)}|${norm(t.artist)}`;
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
