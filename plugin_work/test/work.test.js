import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock } from '#sdk-testing';
import plugin from '../index.js';
import { work } from '../services/blocks.js';

const GUILD = '100000000000000001';
const ANN = '200000000000000001';
const permissions = ['storage', 'discord.interactions.reply', 'modules.economy.balance.read', 'modules.economy.balance.write'];
const JOBS = [
  { _id: 'a1b2c3d4', name: 'Miner', key: 'miner', emoji: '⛏️', pay_min: '10', pay_max: '20', cooldown_minutes: 60, enabled: true },
  { _id: 'b1b2c3d4', name: 'Off', key: 'off', pay_min: '1', pay_max: '1', cooldown_minutes: 1, enabled: false },
];
const ctxWith = () => createTestContext({ id: 'plugin_work', permissions, config: { jobs: JOBS, currency: 'coins' }, balances: {} });
const vars = { 'server.id': GUILD, 'user.id': ANN };

test('accept, work with cooldown, leave', async () => {
  const ctx = ctxWith();
  assert.equal((await runBlock(plugin, 'work', ctx, { vars })).port, 'failed', 'no job yet');
  assert.equal((await runBlock(plugin, 'accept', ctx, { vars, config: { job: 'off' } })).port, 'failed', 'disabled jobs are hidden');
  assert.equal((await runBlock(plugin, 'accept', ctx, { vars, config: { job: 'Miner' } })).results[''], 'miner');
  const paid = await work(ctx, { vars }, () => 0.99);
  assert.equal(paid.results[''], '20');
  assert.equal(await ctx.economy.get(GUILD, ANN), 20);
  const again = await runBlock(plugin, 'work', ctx, { vars, interaction: 'c' });
  assert.equal(again.port, 'failed');
  assert.match(ctx.answers.at(-1).message, /next shift/);
  assert.equal((await runBlock(plugin, 'leave', ctx, { vars })).port, 'next');
  assert.equal((await runBlock(plugin, 'leave', ctx, { vars })).port, 'failed');
});

test('job list', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'list', ctx, { vars, interaction: 'c' });
  assert.equal(out.results[''], '1');
  assert.match(ctx.answers.at(-1).message.embeds[0].description, /Miner\*\* \(`miner`\)/);
});
