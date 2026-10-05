import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runTask } from '#sdk-testing';
import plugin from '../index.js';
import { remind, start } from '../services/blocks.js';

const GUILD = '100000000000000001';
const ANN = '200000000000000001';
const permissions = ['storage', 'scheduler', 'discord.interactions.reply', 'discord.messages.send'];
const vars = { 'server.id': GUILD, 'user.id': ANN, 'channel.id': '300000000000000001' };
const ctxWith = (config = {}) => createTestContext({ id: 'plugin_cooldowns', permissions, config: { cooldowns: [{ _id: 'a1b2c3d4', name: 'Daily', minutes: 1440 }], ...config } });

test('start, restart, list, remind by DM, stop', async () => {
  const ctx = ctxWith();
  assert.equal((await runBlock(plugin, 'start', ctx, { vars, config: { name: 'weekly' } })).port, 'failed');
  const t = Date.now();
  assert.equal((await start(ctx, { vars, config: { name: 'daily' } }, t)).results[''], String(t + 1440 * 60_000));
  await start(ctx, { vars, config: { name: 'Daily' } }, t + 1000);
  assert.equal((await start(ctx, { vars, config: { name: 'fish', minutes: '5' } }, t)).results[''], String(t + 300000));
  assert.equal((await runBlock(plugin, 'list', ctx, { vars })).results[''], '2', 'the same cooldown restarts');
  await remind(ctx, t + 300000);
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].channelId, `dm:${ANN}`);
  assert.match(ctx.sent[0].message, /\*\*fish\*\* cooldown is over/);
  await runTask(plugin, 'remind', ctx);
  assert.equal((await runBlock(plugin, 'stop', ctx, { vars, config: { name: 'all' } })).results[''], '1');
  assert.equal((await runBlock(plugin, 'stop', ctx, { vars, config: { name: 'daily' } })).port, 'failed');
});

test('custom cooldowns can be switched off', async () => {
  const ctx = ctxWith({ allow_custom: false });
  assert.equal((await runBlock(plugin, 'start', ctx, { vars, config: { name: 'fish', minutes: '5' } })).port, 'failed');
});
