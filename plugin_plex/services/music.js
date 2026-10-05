// Service "music": /plex-play puts songs of the shared Plex music libraries
// into the bot's music queue (ctx.music.enqueue, "modules.music.queue"): a
// song, an album, all songs of an artist or a playlist. Each song is passed
// as a secret request (address secret PLEX_URL… + the part's path, token
// PLEX_TOKEN… as header): the bot builds the stream address, the plugin never
// sees the token. Only libraries shared on the plugin page are searched.
import { allowedLibraries, plex, refOf, SERVERS } from './plex.js';

const KINDS = ['track', 'album', 'artist', 'playlist'];
export const MAX_SONGS = 100;

/** A Plex track (Metadata) as a music item, null without a playable part. */
export function songItem(m, server) {
  const part = m?.Media?.[0]?.Part?.[0]?.key;
  if (typeof part !== 'string' || !part.startsWith('/library/parts/')) return null;
  const slot = SERVERS[server - 1] ?? SERVERS[0];
  const artist = String(m.originalTitle || m.grandparentTitle || '').slice(0, 100);
  return {
    title: `${artist ? `${artist} - ` : ''}${String(m.title ?? '?')}`.slice(0, 200),
    author: artist,
    duration: m.duration ? Math.round(Number(m.duration) / 1000) : 0,
    source: { url: slot.url, path: part, auth: { secret: slot.token, header: 'X-Plex-Token', format: 'plain' } },
  };
}

const metadataOf = (res) => (Array.isArray(res.json?.MediaContainer?.Metadata) ? res.json.MediaContainer.Metadata : []);

/** Search hits of all connected servers: [{ kind, server, key, title, subtitle, section }]. */
export async function findMusic(ctx, query, kind = 'any') {
  const allowed = allowedLibraries(ctx);
  const hits = [];
  let error = null;
  for (let server = 1; server <= SERVERS.length; server++) {
    if (allowed.length && !allowed.some((r) => r.startsWith(`${server}:`))) continue;
    const res = await plex(ctx, '/hubs/search', { query: query.slice(0, 100), limit: '10' }, server);
    if (!res.ok) {
      if (server === 1) error = res;
      continue;
    }
    for (const hub of res.json?.MediaContainer?.Hub ?? []) {
      const type = String(hub.type ?? '');
      if (!KINDS.includes(type) || (kind !== 'any' && kind !== type)) continue;
      for (const m of hub.Metadata ?? []) {
        // Playlists have no library; music items must be in a shared library.
        if (type === 'playlist' && m.playlistType !== 'audio') continue;
        if (type !== 'playlist' && allowed.length && !allowed.includes(refOf(server, String(m.librarySectionID ?? '')))) continue;
        hits.push({
          kind: type, server, key: String(m.ratingKey ?? ''), data: m,
          title: String(m.title ?? '?'),
          subtitle: type === 'track' ? String(m.grandparentTitle ?? '') : type === 'album' ? String(m.parentTitle ?? '') : '',
        });
      }
    }
  }
  if (!hits.length && error) return { ok: false, error: error.error };
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
  const path = hit.kind === 'album' ? `/library/metadata/${hit.key}/children`
    : hit.kind === 'artist' ? `/library/metadata/${hit.key}/allLeaves`
      : `/playlists/${hit.key}/items`;
  const res = await plex(ctx, path, undefined, hit.server);
  if (!res.ok) return [];
  return metadataOf(res).map((m) => songItem(m, hit.server)).filter(Boolean).slice(0, MAX_SONGS);
}

const LABEL = { track: '🎵 Song', album: '💿 Album', artist: '🎤 Artist', playlist: '📃 Playlist' };
export const hitLabel = (hit) => `${LABEL[hit.kind] ?? hit.kind}: **${hit.title}**${hit.subtitle ? ` · ${hit.subtitle}` : ''}`;
