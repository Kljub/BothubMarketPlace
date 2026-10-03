// Node plugin.plugin_anisearch.search: looks up an anime or manga on AniList.
// Port "found" with the details as results, "not_found" otherwise.
import { results, search } from '../services/anilist.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function searchBlock(ctx, { config }) {
  const title = String(config.title ?? '').trim();
  if (!title) return { port: 'not_found' };
  const type = config.media_type === 'manga' ? 'MANGA' : 'ANIME';
  const media = await search(ctx, title, type);
  if (!media) return { port: 'not_found' };
  return { port: 'found', results: results(media) };
}
