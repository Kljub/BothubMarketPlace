// Service "forge": the API of Stable Diffusion WebUI Forge (the A1111 API,
// /sdapi/v1/*; Forge runs with --api). Every request goes through
// ctx.http.secret ("secrets.use"): the address is the secret FORGE_URL (also
// a server in the home network), the optional login of --api-auth the secret
// FORGE_AUTH ("user:password", HTTP Basic). The plugin never sees either.
// Images never pass through the plugin: the bot puts a plugin file into the
// JSON body (jsonFile) and stores the answer image as a plugin file
// (saveAs 'file', fileFrom 'images.0').

export const ADDRESS = 'FORGE_URL';
export const LOGIN = 'FORGE_AUTH';
/** Longest wait for one image (the bot allows 5 minutes). */
export const GENERATE_TIMEOUT_MS = 300_000;

/** A readable problem for the member (no stack, no address). */
export class ForgeError extends Error {}

export const NOT_SET_UP = 'Forge is not set up yet. An admin enters the address of the Forge server (e.g. http://192.168.1.20:7860) in the secret FORGE_URL under Settings → API / Secrets and shares it with the plugin.';

// FORGE_AUTH is optional: switched off (not shared) means Forge runs
// without --api-auth. Without it the plugin asks again after 5 minutes.
let noLoginUntil = 0;

/** Asks for FORGE_AUTH again with the next request (e.g. after a secrets change). */
export function forgetLogin() {
  noLoginUntil = 0;
}

async function send(ctx, request) {
  const login = Date.now() >= noLoginUntil;
  try {
    return await ctx.http.secret({ url: ADDRESS, ...request, ...(login ? { auth: { secret: LOGIN, format: 'basic' } } : {}) });
  } catch (err) {
    if (!login || !String(err?.message ?? err).includes('sdk.secret.not_shared')) throw err;
    // FORGE_AUTH or FORGE_URL is not shared: try without the login.
    noLoginUntil = Date.now() + 300_000;
    return ctx.http.secret({ url: ADDRESS, ...request });
  }
}

/** One request; maps the usual failures to ForgeError. */
export async function call(ctx, request) {
  let res;
  try {
    res = await send(ctx, request);
  } catch (err) {
    const key = String(err?.message ?? err);
    if (key.includes('sdk.secret.not_shared') || key.includes('sdk.secret.not_a_url')) throw new ForgeError(NOT_SET_UP);
    if (key.includes('sdk.http.timeout')) throw new ForgeError('Forge did not answer in time (5 minutes). Try fewer steps or a smaller size.');
    if (key.includes('sdk.http.failed')) throw new ForgeError('Forge cannot be reached. Is the server running (with --api) and is FORGE_URL right?');
    if (key.includes('sdk.files.too_big')) throw new ForgeError('The image is larger than 8 MB; try a smaller size.');
    if (key.includes('sdk.http.no_file')) throw new ForgeError('Forge answered without an image.');
    throw err;
  }
  if (res.status === 401) throw new ForgeError('Forge refused the login: check the secret FORGE_AUTH (user:password of --api-auth).');
  if (res.status === 404) throw new ForgeError('Forge has no API here: start it with --api.');
  if (res.status >= 400) {
    const j = res.json && typeof res.json === 'object' ? res.json : {};
    const reason = String(j.detail ?? j.error ?? j.errors ?? '').slice(0, 200);
    throw new ForgeError(`Forge answered with HTTP ${res.status}${reason ? `: ${reason}` : ''}.`);
  }
  return res;
}

/** Generates: returns { file, seed } (txt2img or img2img; source = plugin file). */
export async function generate(ctx, body, source = null) {
  const mode = source ? 'img2img' : 'txt2img';
  const res = await call(ctx, {
    path: `/sdapi/v1/${mode}`,
    method: 'POST',
    json: source ? { ...body, init_images: [] } : body,
    ...(source ? { jsonFile: { name: source, path: 'init_images.0' } } : {}),
    saveAs: 'file',
    fileFrom: 'images.0',
    timeoutMs: GENERATE_TIMEOUT_MS,
  });
  let seed = body.seed;
  try {
    const info = typeof res.json?.info === 'string' ? JSON.parse(res.json.info) : res.json?.info;
    if (Number.isFinite(Number(info?.seed))) seed = Number(info.seed);
  } catch {
    // no info: keep the requested seed
  }
  return { file: res.file, seed };
}

/** Progress of the running job: { percent, eta } or null. */
export async function progress(ctx) {
  try {
    const res = await call(ctx, { path: '/sdapi/v1/progress', query: { skip_current_image: 'true' } });
    const p = Number(res.json?.progress);
    return Number.isFinite(p) ? { percent: Math.round(p * 100), eta: Math.max(0, Math.round(Number(res.json?.eta_relative) || 0)) } : null;
  } catch {
    return null;
  }
}

/** Names Forge offers for the dropdowns: checkpoints, samplers, schedulers, upscalers. */
export async function lists(ctx) {
  const get = async (path, pick) => {
    const res = await call(ctx, { path });
    return Array.isArray(res.json) ? res.json.map(pick).filter((x) => x && x.value) : [];
  };
  const [models, samplers, schedulers, upscalers] = await Promise.all([
    get('/sdapi/v1/sd-models', (m) => ({ value: String(m.title ?? m.model_name ?? '').slice(0, 100), label: String(m.model_name ?? m.title ?? '').slice(0, 100) })),
    get('/sdapi/v1/samplers', (s) => ({ value: String(s.name ?? '').slice(0, 100), label: String(s.name ?? '').slice(0, 100) })),
    get('/sdapi/v1/schedulers', (s) => ({ value: String(s.name ?? '').slice(0, 100), label: String(s.label ?? s.name ?? '').slice(0, 100) })).catch(() => []),
    get('/sdapi/v1/upscalers', (u) => ({ value: String(u.name ?? '').slice(0, 100), label: String(u.name ?? '').slice(0, 100) })),
  ]);
  return { models, samplers, schedulers, upscalers };
}
