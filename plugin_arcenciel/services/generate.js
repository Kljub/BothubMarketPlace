// Service "generate": starts a txt2img or img2img job for a command or a
// graph. The block returns as soon as the job is queued (port "queued");
// finishJob runs on in the background. Tests await `running`.
import { API, ArcError, call, jobBody, NOT_SET_UP, queueJob, uploadSource } from './arc.js';
import { answer, finishJob, jobInfo, safety, takeQuota } from './flow.js';
import { setting } from './util.js';

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
    const work = finishJob(ctx, { jobId: job.id, handle, channelId, userId, title, prompt, spoiler, waitOptions, body, buttons: true });
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

/**
 * The buttons under a generated image. Regenerate: the same request with a
 * new seed. Upscale: a remix of the job with the same seed and an upscale
 * profile (model of the settings, else the first Arc en Ciel offers). Both
 * count against the hourly limit and follow the NSFW rule of the channel.
 */
export async function again(ctx, ev, kind, waitOptions) {
  const info = await jobInfo(ctx, ev.data);
  if (!info?.body) {
    await ctx.interaction.reply(ev.handle, '⌛ This image is too old for that; run the command again.', { ephemeral: true });
    return;
  }
  const quota = await takeQuota(ctx, ev.guildId ?? '', ev.user.id);
  if (!quota.ok) {
    await ctx.interaction.reply(ev.handle, `❌ You reached ${quota.limit} images this hour. More at <t:${Math.floor(quota.resetAt / 1000)}:t>.`, { ephemeral: true });
    return;
  }
  const { sfwMode, spoiler } = await safety(ctx, ev.channelId);
  try {
    let job;
    let body = { ...info.body, sfwMode };
    if (kind === 'upscale') {
      const model = String(setting(ctx, 'upscale_model', '')).trim() || (await upscaleModels(ctx))[0];
      if (!model) throw new ArcError('Arc en Ciel offers no upscale model right now.');
      const factor = Number(String(setting(ctx, 'upscale_factor', '2')).replace('_', '.')) || 2;
      const res = await call(ctx, { url: `${API}/jobs/${encodeURIComponent(ev.data)}/remix`, method: 'POST', json: { prompt: info.prompt, seed: info.seed, sfwMode, upscaleProfiles: [{ upscaleModelName: model }], scaleFactor: factor } });
      if (!res.json?.job?.id) throw new ArcError('Arc en Ciel did not queue the upscale.');
      job = { id: String(res.json.job.id), position: Number(res.json.position ?? 0) };
      body = { ...body, width: Math.round(body.width * factor), height: Math.round(body.height * factor) };
    } else {
      delete body.seed;
      job = await queueJob(ctx, body);
    }
    const ahead = job.position > 0 ? ` (${job.position} ahead in the queue)` : '';
    await ctx.interaction.reply(ev.handle, `⏳ ${kind === 'upscale' ? 'Upscaling' : 'Generating again'}${ahead} …`, { ephemeral: true });
    const work = finishJob(ctx, {
      jobId: job.id, handle: ev.handle, channelId: ev.channelId, userId: ev.user.id, title: kind === 'upscale' ? '🔍 Upscaled' : '🔄 Regenerated',
      prompt: info.prompt, spoiler, waitOptions, body, buttons: true, upscaled: kind === 'upscale' || info.upscaled === true,
    });
    running.add(work);
    work.finally(() => running.delete(work));
  } catch (err) {
    await ctx.interaction.reply(ev.handle, `❌ ${err instanceof ArcError ? err.message : String(err?.message ?? err).slice(0, 200)}`, { ephemeral: true }).catch(() => undefined);
  }
}

/** Upscale models Arc en Ciel offers (GET /options). */
async function upscaleModels(ctx) {
  const res = await call(ctx, { url: `${API}/options` });
  const list = res.json?.models?.upscale;
  return Array.isArray(list) ? list.map(String) : [];
}
