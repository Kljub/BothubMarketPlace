// Service "generate": starts a txt2img or img2img job for a command or a
// graph. The block returns as soon as the job is queued (port "queued");
// finishJob runs on in the background. Tests await `running`.
import { ArcError, jobBody, NOT_SET_UP, queueJob, uploadSource } from './arc.js';
import { answer, finishJob, safety, takeQuota } from './flow.js';

/** Background work still running (tests wait for it). */
export const running = new Set();

/**
 * input: { prompt, negative, steps, cfg, width, height, image (Discord
 * attachment URL, img2img), strength }; vars: the run's variables;
 * handle: the command's interaction (or undefined).
 */
export async function generate(ctx, input, vars, handle, waitOptions) {
  const guildId = String(vars['server.id'] ?? '');
  const channelId = String(vars['channel.id'] ?? '');
  const userId = String(vars['user.id'] ?? '');
  const prompt = String(input.prompt ?? '').trim();
  const fail = async (port, text) => {
    await answer(ctx, handle, `❌ ${text}`);
    return { port: handle ? 'replied' : port, results: { '.error': text } };
  };
  if (!prompt) return fail('failed', 'Write a prompt.');
  if (!/^\d{17,20}$/.test(channelId)) return fail('failed', 'No channel to post the image in.');
  const quota = await takeQuota(ctx, guildId, userId);
  if (!quota.ok) return fail('limited', `You reached ${quota.limit} images this hour. More at <t:${Math.floor(quota.resetAt / 1000)}:t>.`);
  const { sfwMode, spoiler } = await safety(ctx, channelId);

  let source = null;
  try {
    let imagePath = null;
    if (input.image !== undefined) {
      const url = String(input.image ?? '').trim();
      if (!url) return fail('failed', 'Attach an image.');
      try {
        source = await ctx.files.fromDiscord(url);
      } catch (err) {
        const key = String(err?.message ?? err);
        return fail('failed', key.includes('too_big') ? 'The image is larger than 2 MB.' : 'Only PNG, GIF, WEBP or JPEG images work.');
      }
      imagePath = await uploadSource(ctx, source.name);
    }
    const body = jobBody(ctx, { ...input, prompt, imagePath }, sfwMode);
    const job = await queueJob(ctx, body);
    const ahead = job.position > 0 ? ` (${job.position} ahead in the queue)` : '';
    await answer(ctx, handle, `⏳ Queued${ahead} …`);
    const title = body.mode === 'img2img' ? '🖼️ Image to image' : '🎨 Imagine';
    const work = finishJob(ctx, { jobId: job.id, handle, channelId, userId, title, prompt, spoiler, waitOptions });
    running.add(work);
    work.finally(() => running.delete(work));
    return { port: handle ? 'replied' : 'queued', results: { '': job.id, '.mode': body.mode, '.width': String(body.width), '.height': String(body.height) } };
  } catch (err) {
    if (err instanceof ArcError) return fail(err.message === NOT_SET_UP ? 'not_set_up' : 'failed', err.message);
    throw err;
  } finally {
    // The source is on Arc en Ciel now (or the job failed): not kept here.
    if (source) await ctx.files.delete(source.name).catch(() => undefined);
  }
}
