// Service "flow": what /imagine, /img2img and /autotag share: the hourly
// limit per member, the NSFW rule, answering the command and posting the
// finished image. Generation takes longer than a block may run, so the block
// answers at once ("⏳ …") and the rest runs on in the plugin process: it
// polls the job and then edits that answer (the handle lives 15 minutes).
import { ArcError, waitForImage } from './arc.js';
import { setting } from './util.js';

const HOUR = 3_600_000;

/**
 * Counts one image for the member in this hour. Returns false when the limit
 * ("per_user_hour", 0 = none) is used up. One storage key per member.
 */
export async function takeQuota(ctx, guildId, userId, now = Date.now()) {
  const limit = Math.max(0, Number(setting(ctx, 'per_user_hour', 10)) || 0);
  if (!limit) return { ok: true, used: 0, limit };
  const key = `quota:${guildId || 'dm'}:${userId}`;
  const hour = Math.floor(now / HOUR);
  let state = { hour, used: 0 };
  try {
    const saved = JSON.parse((await ctx.storage.get(key)) ?? 'null');
    if (saved && saved.hour === hour) state = saved;
  } catch {
    // broken value: start the hour again
  }
  if (state.used >= limit) return { ok: false, used: state.used, limit, resetAt: (hour + 1) * HOUR };
  state.used += 1;
  await ctx.storage.set(key, JSON.stringify(state));
  return { ok: true, used: state.used, limit };
}

/**
 * NSFW: off unless the setting allows it AND the channel is age-restricted.
 * Returns { sfwMode, spoiler }.
 */
export async function safety(ctx, channelId) {
  if (setting(ctx, 'allow_nsfw', false) !== true || !channelId) return { sfwMode: true, spoiler: false };
  let channel = null;
  try {
    channel = await ctx.channel.get(channelId);
  } catch {
    channel = null;
  }
  return channel?.nsfw === true ? { sfwMode: false, spoiler: true } : { sfwMode: true, spoiler: false };
}

/** Answers the command (privately); without a command nothing happens. */
export async function answer(ctx, handle, text, edit = false) {
  if (!handle) return;
  if (edit) await ctx.interaction.editReply(handle, text).catch(() => undefined);
  else await ctx.interaction.reply(handle, text, { ephemeral: true });
}

/**
 * The public message: the image, then a second embed with prompt, negative
 * prompt, seed and the job's settings. buttons: "🔍 Upscale" (not on an
 * upscaled image) and "🔄 Regenerate" for the generating commands.
 */
export function imageMessage(ctx, { title, prompt, userId, seed, spoiler, body = null, jobId = '', buttons = false, upscaled = false }) {
  const color = String(setting(ctx, 'color', '#e879f9'));
  const embed = {
    color,
    title: title.slice(0, 256),
    description: userId ? `<@${userId}>` : undefined,
    image_url: 'attachment',
    footer: 'Arc en Ciel',
  };
  const fields = [{ name: 'Prompt', value: String(prompt || '—').slice(0, 1024) }];
  if (body?.negativePrompt) fields.push({ name: 'Negative prompt', value: String(body.negativePrompt).slice(0, 1024) });
  fields.push({ name: 'Seed', value: seed !== undefined && seed !== null ? `\`${seed}\`` : '—', inline: true });
  if (body) {
    fields.push({ name: 'Size', value: `${body.width}×${body.height}${upscaled ? ' (upscaled)' : ''}`, inline: true });
    fields.push({ name: 'Steps · CFG', value: `${body.steps} · ${body.cfg}`, inline: true });
    if (body.modelName) fields.push({ name: 'Model', value: String(body.modelName).slice(0, 1024), inline: true });
    if (body.mode === 'img2img') fields.push({ name: 'Strength', value: String(body.denoise), inline: true });
  }
  const message = { embeds: [embed, { color, fields }], spoiler };
  if (buttons && jobId) {
    message.components = [[
      ...(upscaled ? [] : [{ key: 'upscale', data: jobId, label: 'Upscale', emoji: '🔍', style: 'primary' }]),
      { key: 'regen', data: jobId, label: 'Regenerate', emoji: '🔄', style: 'secondary' },
    ]];
  }
  return message;
}

/** What the buttons need of a posted job (storage "job:<id>", the last 200). */
export async function rememberJob(ctx, id, info) {
  await ctx.storage.set(`job:${id}`, JSON.stringify(info));
  let ids = [];
  try {
    ids = JSON.parse((await ctx.storage.get('jobs')) ?? '[]');
  } catch {
    ids = [];
  }
  ids = [...ids.filter((x) => x !== id), id];
  for (const old of ids.slice(0, -200)) await ctx.storage.delete(`job:${old}`);
  await ctx.storage.set('jobs', JSON.stringify(ids.slice(-200)));
}

export async function jobInfo(ctx, id) {
  try {
    return JSON.parse((await ctx.storage.get(`job:${String(id).slice(0, 64)}`)) ?? 'null');
  } catch {
    return null;
  }
}

/**
 * Runs on after the block: waits for the job, posts the image in the channel
 * and edits the command answer. Never throws (errors go into the answer).
 */
export async function finishJob(ctx, { jobId, handle, channelId, userId, title, prompt, spoiler, waitOptions = {}, body = null, buttons = false, upscaled = false }) {
  let file = null;
  try {
    const done = await waitForImage(ctx, jobId, {
      ...waitOptions,
      onProgress: (phase) => answer(ctx, handle, `⏳ ${phase === 'queued' ? 'Waiting in the queue' : 'Generating'} …`, true),
    });
    file = done.file;
    const seed = done.job.seed;
    if (buttons) await rememberJob(ctx, jobId, { prompt, body, seed, userId, title, upscaled });
    await ctx.message.sendFile(channelId, file.name, imageMessage(ctx, { title, prompt, userId, seed, spoiler, body, jobId, buttons, upscaled }));
    await answer(ctx, handle, '✅ Done, the image is in the channel.', true);
    return { ok: true };
  } catch (err) {
    const text = err instanceof ArcError ? err.message : `Something went wrong (${String(err?.message ?? err).slice(0, 200)}).`;
    await answer(ctx, handle, `❌ ${text}`, true);
    if (!handle) await ctx.logger.warn(`job ${jobId}: ${text}`);
    return { ok: false, error: text };
  } finally {
    // The image is in Discord now; the plugin files keep only what settings name.
    if (file) await ctx.files.delete(file.name).catch(() => undefined);
  }
}
