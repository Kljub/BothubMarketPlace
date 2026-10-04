// Service "arc": the Arc en Ciel generator API (https://arcenciel.io,
// /api-docs.json). Every request goes through ctx.http.secret ("secrets.use"):
// the bot adds the API key (secret ARCENCIEL_API_KEY, header x-api-key), the
// plugin never sees it. Images move through the plugin files
// ("storage.files"): a Discord attachment is stored with ctx.files.fromDiscord
// and uploaded as multipart; a finished image is saved with saveAs 'file' and
// posted with ctx.message.sendFile.
import { setting } from './util.js';

export const API = 'https://arcenciel.io/api/generator';
export const KEY_SECRET = 'ARCENCIEL_API_KEY';
const AUTH = { secret: KEY_SECRET, header: 'x-api-key', format: 'plain' };

/** A readable problem for the member (no stack, no key). */
export class ArcError extends Error {}

export const NOT_SET_UP = 'ArcEnCiel is not set up yet. An admin pastes the API key into the secret ARCENCIEL_API_KEY under Admin → API / Secrets.';

/** One request to the generator API; maps the usual failures to ArcError. */
export async function call(ctx, request) {
  let res;
  try {
    res = await ctx.http.secret({ ...request, auth: AUTH });
  } catch (err) {
    const key = String(err?.message ?? err);
    if (key.includes('sdk.secret.not_shared')) throw new ArcError(NOT_SET_UP);
    if (key.includes('sdk.files.too_big')) throw new ArcError('The image is larger than 2 MB; try a smaller size.');
    if (key.includes('sdk.http.timeout')) throw new ArcError('Arc en Ciel did not answer in time. Try again in a moment.');
    throw err;
  }
  if (res.status === 401) throw new ArcError('Arc en Ciel refused the API key (wrong or revoked key).');
  if (res.status === 403) throw new ArcError('The API key may not do this (scope GeneratorWrite needed; /autotag also needs the Artist role on Arc en Ciel).');
  if (res.status === 429) throw new ArcError('Arc en Ciel: too many requests or no quota left right now. Try again later.');
  if (res.status >= 400) {
    const reason = res.json && typeof res.json === 'object' ? String(res.json.error ?? res.json.message ?? '') : '';
    throw new ArcError(`Arc en Ciel answered with HTTP ${res.status}${reason ? `: ${reason.slice(0, 200)}` : ''}.`);
  }
  return res;
}

/** Clamps a number option; empty or invalid gives the fallback. */
export function num(value, fallback, min, max, step = 0) {
  const n = Number(String(value ?? '').trim());
  if (String(value ?? '').trim() === '' || !Number.isFinite(n)) return fallback;
  const clamped = Math.min(max, Math.max(min, n));
  return step ? Math.round(clamped / step) * step : clamped;
}

/** The job body: defaults of the settings page, overridden by the command options. */
export function jobBody(ctx, input, sfwMode) {
  const width = num(input.width, Number(setting(ctx, 'width', 512)), 256, 1536, 8);
  const height = num(input.height, Number(setting(ctx, 'height', 512)), 256, 1536, 8);
  const body = {
    mode: input.imagePath ? 'img2img' : 'txt2img',
    prompt: String(input.prompt ?? '').trim().slice(0, 2000),
    steps: Math.round(num(input.steps, Number(setting(ctx, 'steps', 20)), 1, 50)),
    cfg: num(input.cfg, num(setting(ctx, 'cfg', '7'), 7, 1, 20), 1, 20),
    width,
    height,
    batchSize: 1,
    sfwMode,
  };
  const negative = String(input.negative ?? '').trim() || String(setting(ctx, 'negative_prompt', '')).trim();
  if (negative) body.negativePrompt = negative.slice(0, 2000);
  for (const [field, key] of [['modelName', 'checkpoint'], ['vaeName', 'vae'], ['samplerName', 'sampler'], ['scheduler', 'scheduler']]) {
    const v = String(setting(ctx, key, '')).trim();
    if (v) body[field] = v;
  }
  if (input.imagePath) {
    body.imagePath = input.imagePath;
    body.denoise = num(input.strength, 0.6, 0.05, 1);
  }
  return body;
}

/** Uploads a stored image (plugin files) as a generator source; returns its path. */
export async function uploadSource(ctx, fileName) {
  const res = await call(ctx, { url: `${API}/uploads`, method: 'POST', file: { name: fileName, field: 'image' }, fields: { kind: 'SOURCE' } });
  const path = res.json?.path;
  if (typeof path !== 'string' || !path) throw new ArcError('Arc en Ciel did not accept the image.');
  return path;
}

/** Queues a job; returns { id, position, etaMs }. */
export async function queueJob(ctx, body) {
  const res = await call(ctx, { url: `${API}/jobs`, method: 'POST', json: body });
  const job = res.json?.job;
  if (!job?.id) throw new ArcError('Arc en Ciel did not queue the job.');
  return { id: String(job.id), position: Number(res.json.position ?? 0), etaMs: Number(res.json.queueEtaMs ?? 0) };
}

export async function getJob(ctx, id) {
  const res = await call(ctx, { url: `${API}/jobs/${encodeURIComponent(id)}` });
  return res.json?.job ?? null;
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Waits until the job is done (polling), then stores its first image in the
 * plugin files. Returns { file, job }. Throws ArcError on failure, safety
 * block or timeout.
 */
export async function waitForImage(ctx, id, { pollMs = 3000, timeoutMs = 5 * 60_000, onProgress } = {}) {
  const until = Date.now() + timeoutMs;
  let last = '';
  for (;;) {
    const job = await getJob(ctx, id);
    if (!job) throw new ArcError('The job is gone on Arc en Ciel.');
    if (job.safety?.status === 'quarantined') throw new ArcError('Arc en Ciel blocked this image (safety check).');
    if (job.status === 'failed') throw new ArcError(`Generation failed${job.error ? `: ${String(job.error).slice(0, 200)}` : '.'}`);
    if (job.status === 'completed') {
      if (!Array.isArray(job.outputs) || !job.outputs.length) throw new ArcError('The job finished without an image.');
      const res = await call(ctx, { url: `${API}/jobs/${encodeURIComponent(id)}/outputs/0/download`, saveAs: 'file' });
      if (!res.file) throw new ArcError('Could not load the image.');
      return { file: res.file, job };
    }
    const phase = String(job.progress?.phase ?? job.status ?? '');
    if (onProgress && phase !== last) {
      last = phase;
      await onProgress(phase, job).catch(() => undefined);
    }
    if (Date.now() > until) throw new ArcError('Generation takes too long; check the job on arcenciel.io.');
    await sleep(pollMs);
  }
}

/** Tags of an image (autotagger): { tags, rating }. */
export async function interrogate(ctx, fileName) {
  const res = await call(ctx, { url: `${API}/autotag/interrogate`, method: 'POST', file: { name: fileName, field: 'image' } });
  const tags = Array.isArray(res.json?.tags) ? res.json.tags.map(String) : [];
  return { tags, rating: String(res.json?.rating ?? 'unknown') };
}
