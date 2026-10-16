// Service "music": /jellyfin-play puts songs of the shared Jellyfin music
// libraries into the bot's music queue (ctx.music.enqueue,
// "modules.music.queue"): a song, an album, all songs of an artist or a
// playlist. Each song is passed as a secret request (address secret
// JELLYFIN_URL… + /Audio/<id>/stream, key JELLYFIN_KEY… as query ApiKey):
// the bot builds the stream address, the plugin never sees the key. Only
// libraries shared on the plugin page are searched.
import { allowedLibraries, authOf, jf, parseRef, SERVERS, sections } from './jellyfin.js';

const KINDS = ['track', 'album', 'artist', 'playlist'];
const TYPES = { Audio: 'track', MusicAlbum: 'album', MusicArtist: 'artist', Playlist: 'playlist' };
export const MAX_SONGS = 100;

/** A Jellyfin audio item as a music item. */
export function songItem(m, server) {
  if (!m?.Id || m.Type !== 'Audio') return null;
  const slot = SERVERS[server - 1] ?? SERVERS[0];
  const artist = String(m.AlbumArtist || (m.Artists ?? [])[0] || '').slice(0, 100);
  return {
    title: `${artist ? `${artist} - ` : ''}${String(m.Name ?? '?')}`.slice(0, 200),
    author: artist,
    duration: m.RunTimeTicks ? Math.round(Number(m.RunTimeTicks) / 10_000_000) : 0,
    source: { url: slot.url, path: `/Audio/${m.Id}/stream`, query: { static: 'true' }, auth: authOf(server) },
  };
}

const itemsOf = (res) => (Array.isArray(res.json?.Items) ? res.json.Items : []);

/** Search hits in the shared music libraries: [{ kind, server, key, title, subtitle }]. */
export async function findMusic(ctx, query, kind = 'any') {
  const allowed = allowedLibraries(ctx);
  const libs = await sections(ctx);
  if (!libs.ok) return { ok: false, error: libs.error };
  const music = libs.sections.filter((s) => s.type === 'music' && (!allowed.length || allowed.includes(s.id)));
  const hits = [];
  const term = query.slice(0, 100);
  const add = (m, server) => {
    const type = TYPES[m.Type];
    if (!type || (kind !== 'any' && kind !== type)) return;
    if (hits.some((h) => h.server === server && h.key === m.Id)) return;
    hits.push({
      kind: type, server, key: String(m.Id), data: m, title: String(m.Name ?? '?'),
      subtitle: type === 'track' ? String(m.AlbumArtist ?? '') : type === 'album' ? String(m.AlbumArtist ?? '') : '',
    });
  };
  for (const lib of music) {
    const { server, id } = parseRef(lib.id);
    const res = await jf(ctx, '/Items', { parentId: id, recursive: 'true', searchTerm: term, includeItemTypes: 'Audio,MusicAlbum', limit: '20' }, server);
    for (const m of itemsOf(res)) add(m, server);
    if (kind === 'any' || kind === 'artist') {
      const artists = await jf(ctx, '/Artists', { parentId: id, searchTerm: term, limit: '5' }, server);
      for (const m of itemsOf(artists)) add({ ...m, Type: 'MusicArtist' }, server);
    }
  }
  if (kind === 'any' || kind === 'playlist') {
    for (const server of [...new Set(music.map((l) => parseRef(l.id).server))]) {
      const res = await jf(ctx, '/Items', { recursive: 'true', searchTerm: term, includeItemTypes: 'Playlist', mediaTypes: 'Audio', limit: '5' }, server);
      for (const m of itemsOf(res)) add(m, server);
    }
  }
  // Songs first, then albums, artists, playlists (unless one kind was asked for).
  hits.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
  return { ok: true, hits };
}

/** The songs of a hit (a song, an album, an artist's songs, a playlist). */
export async function songsOf(ctx, hit) {
  if (hit.kind === 'track') {
    const item = songItem(hit.data, hit.server);
    return item ? [item] : [];
  }
  const limit = String(MAX_SONGS);
  const res = hit.kind === 'album' ? await jf(ctx, '/Items', { parentId: hit.key, includeItemTypes: 'Audio', sortBy: 'ParentIndexNumber,IndexNumber,SortName', limit }, hit.server)
    : hit.kind === 'artist' ? await jf(ctx, '/Items', { artistIds: hit.key, recursive: 'true', includeItemTypes: 'Audio', sortBy: 'Album,ParentIndexNumber,IndexNumber', limit }, hit.server)
      : await jf(ctx, `/Playlists/${hit.key}/Items`, { limit }, hit.server);
  if (!res.ok) return [];
  return itemsOf(res).map((m) => songItem(m, hit.server)).filter(Boolean).slice(0, MAX_SONGS);
}

const LABEL = { track: '🎵 Song', album: '💿 Album', artist: '🎤 Artist', playlist: '📃 Playlist' };
export const hitLabel = (hit) => `${LABEL[hit.kind] ?? hit.kind}: **${hit.title}**${hit.subtitle ? ` · ${hit.subtitle}` : ''}`;
