// Service "flow": /forge-imagine and /forge-img2img. The block answers at
// once ("⏳ …") and the rest runs on in the plugin process: one image after
// the other (Forge works on one at a time), the answer shows the place in
// the queue and then the progress in %, the image goes into the channel with
// a second embed (prompt, negative prompt, seed, settings) and the buttons
// Upscale (same seed with hires fix) and Regenerate (new seed).
import { ForgeError, generate, progress } from './forge.js';
import { readJson, setting, writeJson } from './util.js';

const HOUR = 3_600_000;
/** Jobs the buttons can repeat (storage "job:<id>"); img2img keeps its source file that long. */
const KEEP_JOBS = 20;
const NSFW_NEGATIVE = 'nsfw, nude, naked, nudity, sexual';

/** Background work still running (tests wait for it). */
export const running = new Set();

/** Clamps a number option; empty or invalid gives the fallback. */
export function num(value, fallback, min, max, step = 0) {
  const s = String(value ?? '').trim();
  const n = Number(s);
  if (s === '' || !Number.isFinite(n)) return fallback;
  const clamped = Math.min(max, Math.max(min, n));
  return step ? Math.round(clamped / step) * step : clamped;
}

/** First pick of a dropdown (choices field) or ''. */
export const pick = (ctx, key) => {
  const v = setting(ctx, key, []);
  return String(Array.isArray(v) ? (v[0] ?? '') : v).trim();
};

/** The request body: settings, overridden by the command options. */
export function requestBody(ctx, input, safe) {
  const negative = String(input.negative ?? '').trim() || String(setting(ctx, 'negative_prompt', '')).trim();
  const body = {
    prompt: String(input.prompt ?? '').trim().slice(0, 2000),
    negative_prompt: [negative, safe ? NSFW_NEGATIVE : ''].filter(Boolean).join(', ').slice(0, 2000),
    steps: Math.round(num(input.steps, Number(setting(ctx, 'steps', 25)), 1, 150)),
    cfg_scale: num(input.cfg, num(setting(ctx, 'cfg', '7'), 7, 1, 30), 1, 30),
    width: num(input.width, Number(setting(ctx, 'width', 1024)), 64, 2048, 8),
    height: num(input.height, Number(setting(ctx, 'height', 1024)), 64, 2048, 8),
    seed: Math.round(num(input.seed, -1, -1, 4294967295)),
    batch_size: 1,
    n_iter: 1,
    send_images: true,
    save_images: false,
  };
  const sampler = pick(ctx, 'sampler');
  const scheduler = pick(ctx, 'scheduler');
  const model = pick(ctx, 'checkpoint');
  if (sampler) body.sampler_name = sampler;
  if (scheduler) body.scheduler = scheduler;
  // The model stays loaded after the image (no reload for every request).
  if (model) {
    body.override_settings = { sd_model_checkpoint: model };
    body.override_settings_restore_afterwards = false;
  }
  if (input.source) body.denoising_strength = num(input.strength, 0.6, 0.05, 1);
  return body;
}

/** Counts one image for the member in this hour; { ok:false, resetAt } when the limit is used up. */
export async function takeQuota(ctx, guildId, userId, now = Date.now()) {
  const limit = Math.max(0, Number(setting(ctx, 'per_user_hour', 10)) || 0);
  if (!limit) return { ok: true, limit };
  const key = `quota:${guildId || 'dm'}:${userId}`;
  const hour = Math.floor(now / HOUR);
  const saved = await readJson(ctx, key, null);
  const state = saved && saved.hour === hour ? saved : { hour, used: 0 };
  if (state.used >= limit) return { ok: false, limit, resetAt: (hour + 1) * HOUR };
  state.used += 1;
  await writeJson(ctx, key, state);
  return { ok: true, limit };
}

/** NSFW only when allowed AND the channel is age-restricted; then the image is a spoiler. */
export async function safety(ctx, channelId) {
  if (setting(ctx, 'allow_nsfw', false) !== true || !channelId) return { safe: true, spoiler: false };
  const channel = await ctx.channel.get(channelId).catch(() => null);
  return channel?.nsfw === true ? { safe: false, spoiler: true } : { safe: true, spoiler: false };
}

// ---------- queue ----------

let tail = Promise.resolve();
let waiting = 0;

/** Runs jobs one after the other; onPlace(n) tells the place before it starts. */
function enqueue(work, onPlace) {
  const place = waiting;
  waiting += 1;
  onPlace(place);
  const job = tail.then(work).finally(() => {
    waiting -= 1;
  });
  tail = job.catch(() => undefined);
  return job;
}

// ---------- answers and messages ----------

async function answer(ctx, handle, text, edit = false) {
  if (!handle) return;
  if (edit) await ctx.interaction.editReply(handle, text).catch(() => undefined);
  else await ctx.interaction.reply(handle, text, { ephemeral: true });
}

const clean = (negative) => String(negative ?? '').replace(new RegExp(`(, )?${NSFW_NEGATIVE}$`), '');

export function imageMessage(ctx, { title, userId, spoiler, body, seed, jobId, upscaled }) {
  const color = String(setting(ctx, 'color', '#f97316'));
  const fields = [{ name: 'Prompt', value: String(body.prompt || '—').slice(0, 1024) }];
  const negative = clean(body.negative_prompt);
  if (negative) fields.push({ name: 'Negative prompt', value: negative.slice(0, 1024) });
  fields.push({ name: 'Seed', value: `\`${seed}\``, inline: true });
  const w = upscaled ? Math.round(body.width * body.hr_scale) : body.width;
  const h = upscaled ? Math.round(body.height * body.hr_scale) : body.height;
  fields.push({ name: 'Size', value: `${w}×${h}${upscaled ? ' (upscaled)' : ''}`, inline: true });
  fields.push({ name: 'Steps · CFG', value: `${body.steps} · ${body.cfg_scale}`, inline: true });
  if (body.sampler_name) fields.push({ name: 'Sampler', value: `${body.sampler_name}${body.scheduler ? ` · ${body.scheduler}` : ''}`.slice(0, 1024), inline: true });
  if (body.override_settings?.sd_model_checkpoint) fields.push({ name: 'Model', value: String(body.override_settings.sd_model_checkpoint).slice(0, 1024), inline: true });
  if (body.denoising_strength !== undefined && !upscaled) fields.push({ name: 'Strength', value: String(body.denoising_strength), inline: true });
  return {
    embeds: [{ color, title, description: userId ? `<@${userId}>` : undefined, image_url: 'attachment', footer: 'Stable Diffusion Forge' }, { color, fields }],
    spoiler,
    components: [[
      ...(upscaled ? [] : [{ key: 'upscale', data: jobId, label: 'Upscale', emoji: '🔍', style: 'primary' }]),
      { key: 'regen', data: jobId, label: 'Regenerate', emoji: '🔄', style: 'secondary' },
    ]],
  };
}

// ---------- jobs the buttons repeat ----------

async function remember(ctx, id, info) {
  await writeJson(ctx, `job:${id}`, info);
  const ids = [...(await readJson(ctx, 'jobs', [])).filter((x) => x !== id), id];
  const keep = ids.slice(-KEEP_JOBS);
  for (const old of ids.slice(0, -KEEP_JOBS)) {
    const gone = await readJson(ctx, `job:${old}`, null);
    await ctx.storage.delete(`job:${old}`);
    // An img2img source goes when no kept job uses it any more (Regenerate shares it).
    if (!gone?.source) continue;
    if (!(await sourceUsed(ctx, gone.source, keep))) await ctx.files.delete(gone.source).catch(() => undefined);
  }
  await writeJson(ctx, 'jobs', keep);
}

async function sourceUsed(ctx, source, ids) {
  for (const k of ids ?? (await readJson(ctx, 'jobs', []))) if ((await readJson(ctx, `job:${k}`, null))?.source === source) return true;
  return false;
}

// ---------- the work ----------

/**
 * Queues one image. job: { body, source (plugin file, img2img), title,
 * upscaled }; who: { handle, channelId, userId, spoiler }. Never throws:
 * errors go into the command answer.
 */
export function startJob(ctx, job, who) {
  const id = ctx.utils.uuid().replace(/-/g, '').slice(0, 16);
  const work = enqueue(async () => {
    let file = null;
    let ticker = null;
    try {
      await answer(ctx, who.handle, '⏳ Generating …', true);
      let last = '';
      ticker = setInterval(async () => {
        const p = await progress(ctx);
        const text = p ? `⏳ Generating … ${p.percent} %${p.eta ? ` (about ${p.eta} s left)` : ''}` : '';
        if (text && text !== last) {
          last = text;
          await answer(ctx, who.handle, text, true);
        }
      }, 3000);
      const done = await generate(ctx, job.body, job.source);
      clearInterval(ticker);
      ticker = null;
      file = done.file;
      await remember(ctx, id, { body: job.body, seed: done.seed, source: job.source, upscaled: job.upscaled });
      await ctx.message.sendFile(who.channelId, file.name, imageMessage(ctx, { title: job.title, userId: who.userId, spoiler: who.spoiler, body: job.body, seed: done.seed, jobId: id, upscaled: job.upscaled }));
      await answer(ctx, who.handle, '✅ Done, the image is in the channel.', true);
    } catch (err) {
      const text = err instanceof ForgeError ? err.message : `Something went wrong (${String(err?.message ?? err).slice(0, 200)}).`;
      await answer(ctx, who.handle, `❌ ${text}`, true);
      if (!who.handle) await ctx.logger.warn(`forge: ${text}`);
      // A failed img2img source that no saved job needs goes at once.
      if (job.source && !(await sourceUsed(ctx, job.source))) await ctx.files.delete(job.source).catch(() => undefined);
    } finally {
      if (ticker) clearInterval(ticker);
      // The image is in Discord now; the plugin files keep only img2img sources for the buttons.
      if (file && file.name !== job.source) await ctx.files.delete(file.name).catch(() => undefined);
    }
  }, (place) => answer(ctx, who.handle, place ? `⏳ In the queue: ${place} ahead …` : '⏳ Starting …').catch(() => undefined));
  running.add(work);
  work.finally(() => running.delete(work));
  return id;
}

/**
 * The blocks. input: { prompt, negative, steps, cfg, width, height, seed,
 * image (Discord attachment URL: img2img), strength }.
 */
export async function imagine(ctx, input, vars, handle) {
  const guildId = String(vars['server.id'] ?? '');
  const channelId = String(vars['channel.id'] ?? '');
  const userId = String(vars['user.id'] ?? '');
  const fail = async (port, text) => {
    await answer(ctx, handle, `❌ ${text}`);
    return { port: handle ? 'replied' : port, results: { '.error': text } };
  };
  if (!String(input.prompt ?? '').trim()) return fail('failed', 'Write a prompt.');
  if (!/^\d{17,20}$/.test(channelId)) return fail('failed', 'No channel to post the image in.');
  const quota = await takeQuota(ctx, guildId, userId);
  if (!quota.ok) return fail('limited', `You reached ${quota.limit} images this hour. More at <t:${Math.floor(quota.resetAt / 1000)}:t>.`);
  const { safe, spoiler } = await safety(ctx, channelId);
  let source = null;
  if (input.image !== undefined) {
    const url = String(input.image ?? '').trim();
    if (!url) return fail('failed', 'Attach an image.');
    try {
      source = (await ctx.files.fromDiscord(url)).name;
    } catch (err) {
      return fail('failed', String(err?.message ?? err).includes('too_big') ? 'The image is larger than 8 MB.' : 'Only PNG, GIF, WEBP or JPEG images work.');
    }
  }
  const body = requestBody(ctx, { ...input, source }, safe);
  const id = startJob(ctx, { body, source, title: source ? '🖼️ Image to image' : '🎨 Imagine', upscaled: false }, { handle, channelId, userId, spoiler });
  return { port: handle ? 'replied' : 'queued', results: { '': id, '.width': String(body.width), '.height': String(body.height) } };
}

/** The buttons: Upscale (same seed, hires fix) and Regenerate (new seed). */
export async function again(ctx, ev, kind) {
  const info = await readJson(ctx, `job:${String(ev.data).slice(0, 32)}`, null);
  if (!info?.body) return ctx.interaction.reply(ev.handle, '⌛ This image is too old for that; run the command again.', { ephemeral: true });
  const quota = await takeQuota(ctx, ev.guildId ?? '', ev.user.id);
  if (!quota.ok) return ctx.interaction.reply(ev.handle, `❌ You reached ${quota.limit} images this hour. More at <t:${Math.floor(quota.resetAt / 1000)}:t>.`, { ephemeral: true });
  const { spoiler } = await safety(ctx, ev.channelId);
  const body = { ...info.body };
  let title = '🔄 Regenerated';
  if (kind === 'upscale') {
    title = '🔍 Upscaled';
    body.seed = info.seed;
    body.hr_scale = Number(String(setting(ctx, 'upscale_factor', '2')).replace('_', '.')) || 2;
    if (info.source) {
      // img2img: the same picture again, bigger.
      body.width = Math.min(2048, Math.round(body.width * body.hr_scale / 8) * 8);
      body.height = Math.min(2048, Math.round(body.height * body.hr_scale / 8) * 8);
      body.hr_scale = 1;
    } else {
      body.enable_hr = true;
      body.hr_upscaler = pick(ctx, 'upscaler') || 'Latent';
      body.denoising_strength = num(setting(ctx, 'upscale_strength', '0.4'), 0.4, 0.05, 1);
      body.hr_second_pass_steps = 0;
    }
  } else {
    body.seed = -1;
  }
  startJob(ctx, { body, source: info.source ?? null, title, upscaled: kind === 'upscale' || info.upscaled === true }, { handle: ev.handle, channelId: ev.channelId, userId: ev.user.id, spoiler });
}
