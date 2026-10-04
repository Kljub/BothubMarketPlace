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

/** The public message with the image. */
export function imageMessage(ctx, { title, prompt, userId, seed, spoiler }) {
  const embed = {
    color: String(setting(ctx, 'color', '#e879f9')),
    title: title.slice(0, 256),
    description: `${userId ? `<@${userId}> · ` : ''}${prompt}`.slice(0, 4000),
    image_url: 'attachment',
    footer: `Arc en Ciel${seed !== undefined && seed !== null ? ` · seed ${seed}` : ''}`,
  };
  return { embeds: [embed], spoiler };
}

/**
 * Runs on after the block: waits for the job, posts the image in the channel
 * and edits the command answer. Never throws (errors go into the answer).
 */
export async function finishJob(ctx, { jobId, handle, channelId, userId, title, prompt, spoiler, waitOptions = {} }) {
  let file = null;
  try {
    const done = await waitForImage(ctx, jobId, {
      ...waitOptions,
      onProgress: (phase) => answer(ctx, handle, `⏳ ${phase === 'queued' ? 'Waiting in the queue' : 'Generating'} …`, true),
    });
    file = done.file;
    await ctx.message.sendFile(channelId, file.name, imageMessage(ctx, { title, prompt, userId, seed: done.job.seed, spoiler }));
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
