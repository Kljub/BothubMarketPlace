// Node plugin.plugin_anisearch.airing_today: the anime episodes that air
// today (the day in the time zone of the settings) as a list with Discord
// timestamps, so every reader sees their own local time. Ports: next, empty.
import { dayRange, schedule, titleOf } from '../services/anilist.js';
import { setting } from '../services/util.js';

const MAX_TEXT = 3900; // an embed description holds 4096 characters

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function airingToday(ctx, { config }) {
  const { start, end } = dayRange(new Date(), config.timezone || setting(ctx, 'timezone', 'Europe/Berlin'));
  const items = await schedule(ctx, start, end);
  if (!items.length) return { port: 'empty', results: { '': '', '.count': '0' } };
  const lines = [];
  let length = 0;
  for (const s of items) {
    const line = `<t:${s.airingAt}:t> [${titleOf(s.media)}](${s.media.siteUrl}) · Ep. ${s.episode}`;
    if (length + line.length + 1 > MAX_TEXT) {
      lines.push(`… +${items.length - lines.length}`);
      break;
    }
    lines.push(line);
    length += line.length + 1;
  }
  return { port: 'next', results: { '': lines.join('\n'), '.count': String(items.length) } };
}
