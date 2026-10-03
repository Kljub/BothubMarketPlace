// Node plugin.plugin_anisearch.track: follows an anime; new episodes are
// announced in the channel of the settings page (task "airing_check").
// Ports: next (added), already, not_found, no_channel, full.
import { search, titleOf } from '../services/anilist.js';
import { list, MAX_TRACKED, save } from '../services/tracking.js';
import { setting } from '../services/util.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function track(ctx, { config }) {
  const channel = setting(ctx, 'channel', null);
  if (!channel?.id) return { port: 'no_channel' };
  const title = String(config.title ?? '').trim();
  const media = title ? await search(ctx, title, 'ANIME') : null;
  if (!media) return { port: 'not_found' };

  const items = await list(ctx);
  const name = titleOf(media);
  const out = { '': name, '.id': String(media.id), '.url': media.siteUrl ?? '', '.channel': `<#${channel.id}>` };
  if (items.some((t) => t.id === media.id)) return { port: 'already', results: out };
  if (items.length >= MAX_TRACKED) return { port: 'full', results: out };
  items.push({ id: media.id, title: name, cover: media.coverImage?.large ?? '', url: media.siteUrl ?? '', next: media.nextAiringEpisode?.episode ?? null });
  await save(ctx, items);
  return { results: out };
}
