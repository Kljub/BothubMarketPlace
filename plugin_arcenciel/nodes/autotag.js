// Node plugin.plugin_arcenciel.autotag: tags of an image (Arc en Ciel
// autotagger). The answer is private; results '' (tags, comma separated) and
// .rating. Ports: replied, next, not_set_up, failed.
import { ArcError, interrogate, NOT_SET_UP } from '../services/arc.js';
import { answer } from '../services/flow.js';

const RATING = { safe: '🟢 safe', questionable: '🟡 questionable', sensitive: '🟠 sensitive', explicit: '🔴 explicit', unknown: '⚪ unknown' };

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function autotag(ctx, { config, interaction }) {
  const fail = async (port, text) => {
    await answer(ctx, interaction, `❌ ${text}`);
    return { port: interaction ? 'replied' : port, results: { '.error': text } };
  };
  const url = String(config.image ?? '').trim();
  if (!url) return fail('failed', 'Attach an image.');
  let file;
  try {
    file = await ctx.files.fromDiscord(url);
  } catch (err) {
    return fail('failed', String(err?.message ?? err).includes('too_big') ? 'The image is larger than 2 MB.' : 'Only PNG, GIF, WEBP or JPEG images work.');
  }
  try {
    const { tags, rating } = await interrogate(ctx, file.name);
    const list = tags.slice(0, 60).join(', ');
    await answer(ctx, interaction, tags.length ? `🏷️ **${tags.length} tags** · ${RATING[rating] ?? rating}\n\`\`\`\n${list.slice(0, 1800)}\n\`\`\`` : '🏷️ No tags found.');
    return { port: interaction ? 'replied' : 'next', results: { '': list, '.rating': rating, '.count': String(tags.length) } };
  } catch (err) {
    if (err instanceof ArcError) return fail(err.message === NOT_SET_UP ? 'not_set_up' : 'failed', err.message);
    throw err;
  } finally {
    await ctx.files.delete(file.name).catch(() => undefined);
  }
}
