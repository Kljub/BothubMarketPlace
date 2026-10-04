import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent } from '#sdk-testing';
import plugin from '../index.js';
import manifest from '../bothub.json' with { type: 'json' };
import settings from '../dashboard/settings.json' with { type: 'json' };
import { requestBody, running } from '../services/flow.js';
import { forgetLogin } from '../services/forge.js';
import { refreshOptions } from '../services/options.js';

const USER = '100000000000000001';
const GUILD = '200000000000000001';
const CHANNEL = '300000000000000001';
const NSFW_CHANNEL = '300000000000000002';
const vars = (channel = CHANNEL) => ({ 'user.id': USER, 'server.id': GUILD, 'channel.id': channel });
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ATTACHMENT = 'https://cdn.discordapp.com/ephemeral-attachments/1/2/photo.png';

/** A fake Forge server on the home network. */
function forge({ login = '' } = {}) {
  const seen = [];
  const server = (req) => {
    seen.push(req);
    if (login && req.headers.Authorization !== `Basic ${btoa(login)}`) return { status: 401, json: { detail: 'Incorrect username or password' } };
    const path = new URL(req.url).pathname;
    if (req.method === 'POST' && (path === '/sdapi/v1/txt2img' || path === '/sdapi/v1/img2img')) {
      const seed = req.json.seed === -1 ? 1234 : req.json.seed;
      return { json: { images: [PNG], parameters: {}, info: JSON.stringify({ seed }) } };
    }
    if (path === '/sdapi/v1/progress') return { json: { progress: 0.5, eta_relative: 4, state: {} } };
    if (path === '/sdapi/v1/sd-models') return { json: [{ title: 'juggernautXL.safetensors [abc]', model_name: 'juggernautXL' }] };
    if (path === '/sdapi/v1/samplers') return { json: [{ name: 'Euler a' }, { name: 'DPM++ 2M' }] };
    if (path === '/sdapi/v1/schedulers') return { json: [{ name: 'karras', label: 'Karras' }] };
    if (path === '/sdapi/v1/upscalers') return { json: [{ name: 'R-ESRGAN 4x+' }] };
    return { status: 404, json: { detail: 'Not Found' } };
  };
  return { seen, server };
}

function ctxWith({ api = forge(), config = {}, secrets = { FORGE_URL: 'http://192.168.1.20:7860' } } = {}) {
  return createTestContext({
    id: 'plugin_forge', permissions: manifest.sdk.permissions, settings, config, secrets,
    manifest: { id: 'plugin_forge', secrets: manifest.services.secrets },
    web: { '192.168.1.20': api.server },
    attachments: { [ATTACHMENT]: PNG },
    discord: { 'channel.get': (id) => ({ id, name: 'x', type: 'GuildText', parentId: null, nsfw: id === NSFW_CHANNEL }) },
  });
}
const settle = () => Promise.all([...running]);
const gen = (api) => api.seen.filter((r) => r.method === 'POST');

test('imagine: request from settings and options, image posted with seed, answer edited', async () => {
  const api = forge();
  const ctx = ctxWith({ api, config: { checkpoint: ['juggernautXL.safetensors [abc]'], sampler: ['Euler a'], negative_prompt: 'blurry', steps: 30, cfg: '5', width: 832, height: 1216 } });
  const res = await runBlock(plugin, 'imagine', ctx, { vars: vars(), interaction: 'cmd', config: { prompt: 'a red fox', cfg: '6' } });
  assert.equal(res.port, 'replied');
  await settle();
  const body = gen(api)[0].json;
  assert.equal(new URL(gen(api)[0].url).pathname, '/sdapi/v1/txt2img');
  assert.deepEqual([body.prompt, body.steps, body.cfg_scale, body.width, body.height, body.seed, body.sampler_name], ['a red fox', 30, 6, 832, 1216, -1, 'Euler a']);
  assert.match(body.negative_prompt, /^blurry, nsfw/, 'safe channel: NSFW terms in the negative prompt');
  assert.deepEqual(body.override_settings, { sd_model_checkpoint: 'juggernautXL.safetensors [abc]' });
  const post = ctx.sent.at(-1);
  const fields = post.message.embeds[1].fields;
  assert.equal(fields.find((f) => f.name === 'Seed').value, '`1234`');
  assert.equal(fields.find((f) => f.name === 'Negative prompt').value, 'blurry');
  assert.deepEqual(post.message.components[0].map((b) => b.key), ['upscale', 'regen']);
  assert.match(ctx.answers.at(-1).message, /Done/);
  assert.equal((await ctx.files.list()).length, 0, 'the posted image is not kept');
});

test('buttons: upscale keeps the seed with hires fix, regenerate takes a new one', async () => {
  const api = forge();
  const ctx = ctxWith({ api, config: { upscaler: ['R-ESRGAN 4x+'], upscale_factor: '1_5' } });
  await runBlock(plugin, 'imagine', ctx, { vars: vars(), interaction: 'cmd', config: { prompt: 'castle', seed: '77' } });
  await settle();
  const jobId = ctx.sent.at(-1).message.components[0][0].data;
  const click = (key) => runComponent(plugin, key, ctx, { data: jobId, handle: `h-${key}`, user: { id: USER, name: 'u', displayName: 'u' }, guildId: GUILD, channelId: CHANNEL });
  await click('upscale');
  await settle();
  const up = gen(api).at(-1).json;
  assert.deepEqual([up.seed, up.enable_hr, up.hr_scale, up.hr_upscaler], [77, true, 1.5, 'R-ESRGAN 4x+']);
  assert.equal(ctx.sent.at(-1).message.embeds[1].fields.find((f) => f.name === 'Size').value, '1536×1536 (upscaled)');
  assert.deepEqual(ctx.sent.at(-1).message.components[0].map((b) => b.key), ['regen'], 'no upscale of an upscaled image');
  await click('regen');
  await settle();
  assert.equal(gen(api).at(-1).json.seed, -1);
});

test('img2img: the attachment goes into init_images; NSFW channel without the safety terms', async () => {
  const api = forge();
  const ctx = ctxWith({ api, config: { allow_nsfw: true } });
  await runBlock(plugin, 'img2img', ctx, { vars: vars(NSFW_CHANNEL), interaction: 'cmd', config: { image: ATTACHMENT, prompt: 'oil painting', strength: '0.3' } });
  await settle();
  const req = gen(api)[0];
  assert.equal(new URL(req.url).pathname, '/sdapi/v1/img2img');
  assert.deepEqual([req.json.init_images, req.json.denoising_strength, req.json.negative_prompt], [[PNG], 0.3, '']);
  assert.equal(ctx.sent.at(-1).file.startsWith('SPOILER_'), true);
  assert.equal((await ctx.files.list()).length, 1, 'the source stays for the buttons');
});

test('login, errors and limits', async () => {
  forgetLogin();
  const api = forge({ login: 'me:pw' });
  const ctx = ctxWith({ api, secrets: { FORGE_URL: 'http://192.168.1.20:7860', FORGE_AUTH: 'me:pw' }, config: { per_user_hour: 1 } });
  await runBlock(plugin, 'imagine', ctx, { vars: vars(), interaction: 'cmd', config: { prompt: 'a' } });
  await settle();
  assert.match(ctx.answers.at(-1).message, /Done/, 'HTTP Basic login from FORGE_AUTH');
  const limited = await runBlock(plugin, 'imagine', ctx, { vars: vars(), config: { prompt: 'b' } });
  assert.equal(limited.port, 'limited');

  const bad = ctxWith({ api: forge({ login: 'me:pw' }) });
  await runBlock(plugin, 'imagine', bad, { vars: vars(), interaction: 'cmd', config: { prompt: 'a' } });
  await settle();
  assert.match(bad.answers.at(-1).message, /refused the login/);
  const none = ctxWith({ secrets: {} });
  await runBlock(plugin, 'imagine', none, { vars: vars(), interaction: 'cmd', config: { prompt: 'a' } });
  await settle();
  assert.match(none.answers.at(-1).message, /not set up/);
  assert.equal((await runBlock(plugin, 'imagine', none, { vars: vars(), config: { prompt: ' ' } })).port, 'failed');
});

test('dropdowns are filled from the Forge server', async () => {
  const ctx = ctxWith();
  assert.equal(await refreshOptions(ctx), true);
  assert.deepEqual(ctx.fieldOptions.checkpoint, [{ value: 'juggernautXL.safetensors [abc]', label: 'juggernautXL' }]);
  assert.deepEqual(ctx.fieldOptions.sampler.map((o) => o.value), ['Euler a', 'DPM++ 2M']);
  assert.deepEqual(ctx.fieldOptions.scheduler, [{ value: 'karras', label: 'Karras' }]);
  assert.equal(requestBody(ctx, { prompt: 'x', width: '9999' }, false).width, 2048);
});
