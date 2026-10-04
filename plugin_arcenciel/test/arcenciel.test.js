import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock } from '#sdk-testing';
import plugin from '../index.js';
import { runComponent } from '#sdk-testing';
import manifest from '../bothub.json' with { type: 'json' };
import settings from '../dashboard/settings.json' with { type: 'json' };
import { jobBody, num, waitForImage } from '../services/arc.js';
import { generate, running } from '../services/generate.js';
import { takeQuota } from '../services/flow.js';

const USER = '100000000000000001';
const GUILD = '200000000000000001';
const CHANNEL = '300000000000000001';
const NSFW_CHANNEL = '300000000000000002';
const vars = (channel = CHANNEL) => ({ 'user.id': USER, 'server.id': GUILD, 'channel.id': channel });
// A 1x1 PNG: the "generated" image and the uploaded source.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ATTACHMENT = 'https://cdn.discordapp.com/ephemeral-attachments/1/2/photo.png';
const permissions = manifest.sdk.permissions;

/** A fake Arc en Ciel: jobs finish after `polls` status reads. */
function arc({ polls = 1, status = 'completed', safety = 'ok', key = 'arc-key-123', tagsRole = true } = {}) {
  const seen = [];
  let reads = 0;
  const server = (req) => {
    seen.push(req);
    if (req.headers['x-api-key'] !== key) return { status: 401, json: { error: 'bad key' } };
    const path = new URL(req.url).pathname;
    if (req.method === 'POST' && path === '/api/generator/uploads') return { json: { path: 'generator/src-1.png' } };
    if (req.method === 'POST' && path === '/api/generator/jobs') return { json: { job: { id: 'job-1', status: 'queued' }, position: 2, queueEtaMs: 5000 } };
    if (req.method === 'POST' && path === '/api/generator/jobs/job-1/remix') return { json: { job: { id: 'job-1', status: 'queued' }, position: 0 } };
    if (path === '/api/generator/options') return { json: { models: { upscale: ['4x-UltraSharp'] } } };
    if (path === '/api/generator/jobs/job-1') {
      reads += 1;
      const done = reads > polls;
      return { json: { job: { id: 'job-1', status: done ? status : 'running', progress: { phase: done ? status : 'generating' }, seed: 42, outputs: done ? [{ filename: 'a.png' }] : [], safety: { status: safety } } } };
    }
    if (path === '/api/generator/jobs/job-1/outputs/0/download') return { base64: PNG, headers: { 'content-type': 'image/png' } };
    if (req.method === 'POST' && path === '/api/generator/autotag/interrogate') return tagsRole ? { json: { tags: ['1girl', 'smile', 'outdoors'], rating: 'safe', tagCount: 3 } } : { status: 403, json: { error: 'artist role required' } };
    return { status: 404, json: { error: 'not found' } };
  };
  return { seen, server };
}

function ctxWith({ api = arc(), config = {}, secrets = { ARCENCIEL_API_KEY: 'arc-key-123' } } = {}) {
  return createTestContext({
    id: 'plugin_arcenciel', permissions, settings, config, secrets,
    manifest: { id: 'plugin_arcenciel', secrets: manifest.services.secrets }, hosts: manifest.services.hosts,
    web: { 'arcenciel.io': api.server },
    attachments: { [ATTACHMENT]: PNG },
    discord: { 'channel.get': (id) => ({ id, name: id === NSFW_CHANNEL ? 'nsfw' : 'general', type: 'GuildText', parentId: null, nsfw: id === NSFW_CHANNEL }) },
  });
}
const fast = { pollMs: 1, timeoutMs: 2000 };
const settle = () => Promise.all([...running]);

test('imagine: queues a job with the defaults, posts the image, edits the answer', async () => {
  const api = arc({ polls: 2 });
  const ctx = ctxWith({ api, config: { checkpoint: 'animeMix_v2', negative_prompt: 'blurry', steps: 25, cfg: '6.5', width: 768, height: 512 } });
  const out = await generate(ctx, { prompt: 'a cat in space', steps: '', cfg: '', width: '', height: '1000' }, vars(), 'cmd-1', fast);
  assert.equal(out.port, 'replied');
  assert.match(ctx.answers[0].message, /Queued \(2 ahead/);
  await settle();
  const job = api.seen.find((r) => r.method === 'POST' && r.url.endsWith('/jobs')).json;
  assert.deepEqual(
    { mode: job.mode, prompt: job.prompt, negativePrompt: job.negativePrompt, modelName: job.modelName, steps: job.steps, cfg: job.cfg, width: job.width, height: job.height, sfwMode: job.sfwMode },
    { mode: 'txt2img', prompt: 'a cat in space', negativePrompt: 'blurry', modelName: 'animeMix_v2', steps: 25, cfg: 6.5, width: 768, height: 1000, sfwMode: true },
  );
  assert.equal(api.seen[0].headers['x-api-key'], 'arc-key-123', 'the bot adds the key');
  const sent = ctx.sent.at(-1);
  assert.equal(sent.channelId, CHANNEL);
  assert.match(sent.file, /^[0-9a-f]{16}\.png$/);
  assert.equal(sent.message.embeds[0].image_url, `attachment://${sent.file}`);
  assert.equal(sent.message.embeds[1].fields.find((f) => f.name === 'Seed').value, '`42`', 'second embed: seed');
  assert.equal(sent.message.embeds[1].fields[0].value, 'a cat in space');
  assert.equal(sent.message.embeds[1].fields.find((f) => f.name === 'Negative prompt').value, 'blurry');
  assert.deepEqual(sent.message.components[0].map((b) => b.key), ['upscale', 'regen']);
  assert.match(ctx.answers.at(-1).message, /Done/);
  assert.equal(ctx.answers.at(-1).kind, 'editReply');
  assert.equal(ctx.fileStore.size, 0, 'the image is not kept after posting');
});

test('img2img: the attachment is uploaded as multipart and used as source', async () => {
  const api = arc();
  const ctx = ctxWith({ api });
  const out = await runBlock(plugin, 'img2img', ctx, { vars: vars(), config: { image: ATTACHMENT, prompt: 'as a watercolor', strength: '0.4' } });
  assert.equal(out.port, 'queued');
  await settle();
  const upload = api.seen.find((r) => r.url.endsWith('/uploads'));
  assert.equal(upload.file.field, 'image');
  assert.equal(upload.file.data, PNG);
  assert.equal(upload.fields.kind, 'SOURCE');
  const job = api.seen.find((r) => r.method === 'POST' && r.url.endsWith('/jobs')).json;
  assert.deepEqual([job.mode, job.imagePath, job.denoise], ['img2img', 'generator/src-1.png', 0.4]);
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.fileStore.size, 0, 'source and result are not kept');
});

test('autotag: tags and rating, privately', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'autotag', ctx, { vars: vars(), interaction: 'cmd-2', config: { image: ATTACHMENT } });
  assert.equal(out.port, 'replied');
  assert.equal(out.results[''], '1girl, smile, outdoors');
  assert.equal(out.results['.rating'], 'safe');
  assert.equal(ctx.answers[0].ephemeral, true);
  assert.match(ctx.answers[0].message, /3 tags/);
  const denied = await runBlock(plugin, 'autotag', ctxWith({ api: arc({ tagsRole: false }) }), { vars: vars(), config: { image: ATTACHMENT } });
  assert.equal(denied.port, 'failed');
  assert.match(denied.results['.error'], /Artist role/);
});

test('NSFW only in age-restricted channels when allowed; then as spoiler', async () => {
  for (const [config, channel, sfw, spoiler] of [[{}, NSFW_CHANNEL, true, false], [{ allow_nsfw: true }, CHANNEL, true, false], [{ allow_nsfw: true }, NSFW_CHANNEL, false, true]]) {
    const api = arc();
    const ctx = ctxWith({ api, config });
    await generate(ctx, { prompt: 'x' }, vars(channel), undefined, fast);
    await settle();
    assert.equal(api.seen.find((r) => r.method === 'POST').json.sfwMode, sfw);
    assert.equal(ctx.sent.at(-1).file.startsWith('SPOILER_'), spoiler);
  }
});

test('not set up, wrong key, failed or blocked jobs, hourly limit: readable answers', async () => {
  const empty = await runBlock(plugin, 'imagine', ctxWith({ secrets: {} }), { vars: vars(), config: { prompt: 'x' } });
  assert.equal(empty.port, 'not_set_up');
  assert.match(empty.results['.error'], /ARCENCIEL_API_KEY/);
  const wrong = await runBlock(plugin, 'imagine', ctxWith({ secrets: { ARCENCIEL_API_KEY: 'nope' } }), { vars: vars(), config: { prompt: 'x' } });
  assert.match(wrong.results['.error'], /refused the API key/);
  for (const [opts, text] of [[{ status: 'failed' }, /Generation failed/], [{ safety: 'quarantined' }, /safety check/]]) {
    const ctx = ctxWith({ api: arc(opts) });
    await generate(ctx, { prompt: 'x' }, vars(), 'cmd', fast);
    await settle();
    assert.match(ctx.answers.at(-1).message, text);
    assert.equal(ctx.sent.length, 0);
  }
  await assert.rejects(waitForImage(ctxWith({ api: arc({ polls: 1000 }) }), 'job-1', { pollMs: 1, timeoutMs: 20 }), /too long/);
  const limited = ctxWith({ config: { per_user_hour: 2 } });
  const now = Date.UTC(2026, 9, 4, 12, 30);
  assert.equal((await takeQuota(limited, GUILD, USER, now)).ok, true);
  assert.equal((await takeQuota(limited, GUILD, USER, now)).ok, true);
  assert.equal((await takeQuota(limited, GUILD, USER, now)).ok, false, 'third image in the hour');
  assert.equal((await takeQuota(limited, GUILD, USER, now + 3_600_000)).ok, true, 'next hour');
  assert.equal((await runBlock(plugin, 'imagine', ctxWith(), { vars: vars(), config: { prompt: ' ' } })).port, 'failed', 'no prompt');
});

test('numbers are clamped and rounded', () => {
  assert.equal(num('', 20, 1, 50), 20);
  assert.equal(num('999', 20, 1, 50), 50);
  assert.equal(num('513', 512, 256, 1536, 8), 512);
  assert.equal(num('abc', 7, 1, 20), 7);
  const body = jobBody(createTestContext({ id: 'plugin_arcenciel', settings }), { prompt: 'p', steps: '0' }, true);
  assert.deepEqual([body.steps, body.cfg, body.width, body.height], [1, 7, 512, 512]);
});

test('buttons: upscale remixes with the seed and a model, regenerate queues again; autotag has none', async () => {
  const api = arc();
  const ctx = ctxWith({ api, config: { upscale_factor: '2' } });
  await generate(ctx, { prompt: 'a fox' }, vars(), 'cmd-1', fast);
  await settle();
  const ev = (key) => ({ data: 'job-1', handle: `h-${key}`, user: { id: USER, name: 'u', displayName: 'u' }, guildId: GUILD, channelId: CHANNEL });
  await runComponent(plugin, 'upscale', ctx, ev('upscale'));
  await settle();
  const remix = api.seen.find((r) => r.url.endsWith('/remix'));
  assert.equal(remix.json.seed, 42);
  assert.deepEqual(remix.json.upscaleProfiles, [{ upscaleModelName: '4x-UltraSharp' }]);
  assert.equal(remix.json.scaleFactor, 2);
  const up = ctx.sent.at(-1);
  assert.equal(up.message.embeds[0].title, '🔍 Upscaled');
  assert.deepEqual(up.message.components[0].map((b) => b.key), ['regen'], 'no second upscale');
  await runComponent(plugin, 'regen', ctx, ev('regen'));
  await settle();
  const jobs = api.seen.filter((r) => r.method === 'POST' && r.url.endsWith('/jobs'));
  assert.equal(jobs.length, 2);
  assert.equal(jobs[1].json.seed, undefined, 'a new seed');
  await runComponent(plugin, 'regen', ctx, { ...ev('regen'), data: 'gone' });
  assert.match(ctx.answers.at(-1).message, /too old/);
});
