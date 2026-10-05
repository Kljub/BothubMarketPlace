import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runTask } from '#sdk-testing';
import plugin from '../index.js';
import { classify } from '../services/monitor.js';

const CHANNEL = '900000000000000002';
const permissions = ['storage', 'scheduler', 'discord.messages.send', 'discord.messages.edit', 'http.check', 'discord.interactions.reply'];
const SITES = [
  { _id: 'a1b2c3d4', name: 'Main', url: 'https://main.example/', group: '' },
  { _id: 'b1b2c3d4', name: 'API', url: 'https://api.example/health', group: 'Production' },
  { _id: 'c1b2c3d4', name: 'Shop', url: 'http://shop.example/', group: 'Production' },
];
const web = {
  'main.example': () => ({ status: 200, latencyMs: 120 }),
  'api.example': () => ({ status: 503, latencyMs: 80 }),
  'shop.example': () => ({ status: 200, latencyMs: 2500 }),
};
const ctxWith = (config = {}, extra = {}) => createTestContext({
  id: 'plugin_websitestatus', permissions, web,
  config: { channel: { id: CHANNEL, guild: '1' }, interval: '5m', slow_ms: '1500', language: 'en', sites: SITES,
    groups: [{ _id: 'g1b2c3d4', name: 'Production', description: 'Our servers' }], ...config },
  ...extra,
});

test('classify: green, slow or 4xx yellow, 5xx or no answer red', () => {
  assert.equal(classify({ status: 200, latencyMs: 100 }, 1500), 'green');
  assert.equal(classify({ status: 200, latencyMs: 1600 }, 1500), 'yellow');
  assert.equal(classify({ status: 404, latencyMs: 10 }, 1500), 'yellow');
  assert.equal(classify({ status: 502, latencyMs: 10 }, 1500), 'red');
  assert.equal(classify({ ok: false, status: null, latencyMs: null, error: 'timeout' }, 1500), 'red');
});

test('tick: one board message, group shares an embed, countdown once, edited next round', async () => {
  const ctx = ctxWith();
  await runTask(plugin, 'tick', ctx);
  assert.equal(ctx.sent.length, 1, 'one message for all embeds');
  const { embeds } = ctx.sent[0].message;
  assert.equal(embeds.length, 2);
  assert.equal(embeds[0].title, 'Main');
  assert.match(embeds[0].description, /Next check:\*\* <t:\d+:R>\n🟢 Status: \*\*Online\*\* - Main - 120 ms$/);
  assert.equal(embeds[1].title, '📡 Production');
  assert.equal(embeds[1].color, '#ef4444', 'worst status of the group');
  assert.deepEqual(embeds[1].description.split('\n'), [
    'Our servers',
    '🔴 Status: **Offline** - API - 80 ms - HTTP 503',
    '🟡 Status: **Warning** - Shop - 2500 ms',
  ]);

  await runTask(plugin, 'tick', ctx);
  assert.equal(ctx.sent.length, 1, 'not due yet: nothing new');

  await ctx.storage.set('last_run', '0');
  await runTask(plugin, 'tick', ctx);
  assert.equal(ctx.sent.length, 1, 'the board is edited, not posted again');
  assert.ok(ctx.calls.includes('message.edit'));
});

test('a new website is checked at once; without a channel nothing runs', async () => {
  const ctx = ctxWith();
  await runTask(plugin, 'tick', ctx);
  const more = ctxWith({ sites: [...SITES, { _id: 'd1b2c3d4', name: 'Blog', url: 'https://blog.example/', group: '' }] }, { storage: Object.fromEntries(ctx.store) });
  await runTask(plugin, 'tick', more);
  assert.ok(more.store.has('status:d1b2c3d4'));
  assert.equal(JSON.parse(more.store.get('status:d1b2c3d4')).status, 'red', 'not reachable');

  const quiet = ctxWith({ channel: null });
  await runTask(plugin, 'tick', quiet);
  assert.equal(quiet.store.size, 0);
});

test('site_status block: last result by name', async () => {
  const ctx = ctxWith();
  assert.equal((await runBlock(plugin, 'site_status', ctx, { config: { site: 'main' } })).port, 'unchecked');
  await runTask(plugin, 'tick', ctx);
  const out = await runBlock(plugin, 'site_status', ctx, { config: { site: 'main' } });
  assert.equal(out.port, 'next');
  assert.equal(out.results[''], 'online');
  assert.equal(out.results['.code'], '200');
  assert.equal((await runBlock(plugin, 'site_status', ctx, { config: { site: 'nope' } })).port, 'not_found');
});

test('check_now block: checks at once, updates the board, answers the command', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'check_now', ctx, { interaction: 'h1' });
  assert.equal(out.port, 'replied');
  assert.equal(out.results['.problems'], '2');
  assert.equal(ctx.sent.length, 1, 'the board is posted');
  assert.deepEqual(ctx.answers.map((a) => a.kind), ['deferReply', 'editReply']);
  assert.match(ctx.answers[1].message.embeds[0].description, /^🟢 Status: \*\*Online\*\* - Main - 120 ms\n/);

  const empty = ctxWith({ sites: [] });
  assert.equal((await runBlock(plugin, 'check_now', empty, { interaction: 'h2' })).port, 'failed');
  assert.equal((await runBlock(plugin, 'check_now', ctxWith())).port, 'next', 'without a command: no answer');
});
