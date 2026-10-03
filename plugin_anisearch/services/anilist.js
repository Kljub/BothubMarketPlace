// Service "anilist": the public AniList GraphQL API (no key). Needs
// "http.outbound" and graphql.anilist.co in bothub.json "services.hosts".

export const ENDPOINT = 'https://graphql.anilist.co/';

const MEDIA_FIELDS = `
  id
  title { romaji english native }
  description(asHtml: false)
  coverImage { large }
  averageScore
  status
  episodes
  chapters
  volumes
  genres
  format
  startDate { year }
  siteUrl
  nextAiringEpisode { episode airingAt }`;

const SEARCH = `query ($search: String, $type: MediaType) {
  Media(search: $search, type: $type, sort: SEARCH_MATCH) {${MEDIA_FIELDS}
  }
}`;

const BY_ID = `query ($id: Int) {
  Media(id: $id, type: ANIME) {${MEDIA_FIELDS}
  }
}`;

// One request for many tracked anime (max. 50 per page).
const AIRING = `query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: ANIME) { id title { romaji english } coverImage { large } siteUrl nextAiringEpisode { episode airingAt } }
  }
}`;

/** A GraphQL call; null when AniList finds nothing (404 / "Not Found"). */
async function gql(ctx, query, variables) {
  const res = await ctx.http.post(ENDPOINT, { query, variables }, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return null;
  const errors = res.json?.errors;
  if (Array.isArray(errors) && errors.length) {
    if (errors.some((e) => String(e?.message ?? '').toLowerCase().includes('not found'))) return null;
    throw new Error(`AniList: ${String(errors[0]?.message ?? 'error').slice(0, 200)}`);
  }
  if (res.status >= 400) throw new Error(`AniList: HTTP ${res.status}`);
  return res.json?.data ?? null;
}

/** First match for a title (type ANIME or MANGA), or null. */
export async function search(ctx, title, type) {
  return (await gql(ctx, SEARCH, { search: String(title).slice(0, 200), type }))?.Media ?? null;
}

/** An anime by AniList ID, or null. */
export async function byId(ctx, id) {
  return (await gql(ctx, BY_ID, { id: Number(id) }))?.Media ?? null;
}

/** Airing state of up to 50 anime: Map id -> media. */
export async function airing(ctx, ids) {
  const page = (await gql(ctx, AIRING, { ids: ids.slice(0, 50).map(Number) }))?.Page?.media ?? [];
  return new Map(page.map((m) => [m.id, m]));
}

export function titleOf(media) {
  return media?.title?.english || media?.title?.romaji || media?.title?.native || 'Unknown';
}

const STATUS = { FINISHED: 'Finished', RELEASING: 'Releasing', NOT_YET_RELEASED: 'Not yet released', CANCELLED: 'Cancelled', HIATUS: 'On hiatus' };

/** Plain text of AniList's description (it may hold <br> and <i>). */
export function plain(text, max = 500) {
  const t = String(text ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Block results for one media: {Var1} = title, {Var1.url}, {Var1.cover}, … */
export function results(media) {
  return {
    '': titleOf(media),
    '.id': String(media.id),
    '.url': media.siteUrl ?? '',
    '.description': plain(media.description) || '—',
    '.cover': media.coverImage?.large ?? '',
    '.score': media.averageScore != null ? `${media.averageScore}/100` : '—',
    '.status': STATUS[media.status] ?? media.status ?? '—',
    '.format': media.format ?? '—',
    '.episodes': media.episodes != null ? String(media.episodes) : '—',
    '.chapters': media.chapters != null ? String(media.chapters) : '—',
    '.volumes': media.volumes != null ? String(media.volumes) : '—',
    '.genres': (media.genres ?? []).slice(0, 5).join(', ') || '—',
    '.year': media.startDate?.year != null ? String(media.startDate.year) : '—',
    '.next_episode': media.nextAiringEpisode?.episode != null ? String(media.nextAiringEpisode.episode) : '—',
  };
}
