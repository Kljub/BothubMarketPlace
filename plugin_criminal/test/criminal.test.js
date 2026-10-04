import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock } from '#sdk-testing';
import plugin from '../index.js';
import { steal } from '../services/blocks.js';

const GUILD = '100000000000000001';
const ANN = '200000000000000001';
const BOB = '200000000000000002';
const permissions = ['storage', 'discord.interactions.reply', 'discord.members.read', 'modules.economy.balance.read', 'modules.economy.balance.write'];
const ctxWith = (config = {}) => createTestContext({ id: 'plugin_criminal', permissions,
  config: { success_chance: 50, steal_percent: 20, fail_penalty_percent: 10, cooldown_minutes: 30, penalty_to_victim: false, currency: 'coins', ...config },
  balances: { [`${GUILD}:${ANN}`]: 100, [`${GUILD}:${BOB}`]: 200 }, discord: { 'member.get': (g, u) => ({ id: u, bot: false, roles: [] }) } });
const vars = { 'server.id': GUILD, 'user.id': ANN };

test('success moves the loot, failure fines, cooldown blocks', async () => {
  const ctx = ctxWith();
  assert.equal((await steal(ctx, { vars, config: { target: BOB } }, () => 0)).results[''], 'success');
  assert.equal(await ctx.economy.get(GUILD, ANN), 140);
  assert.equal(await ctx.economy.get(GUILD, BOB), 160);
  assert.match((await runBlock(plugin, 'steal', ctx, { vars, config: { target: BOB } })).results[''], /Lie low/);

  const fail = ctxWith({ penalty_to_victim: true, max_steal: '' });
  assert.equal((await steal(fail, { vars, config: { target: BOB } }, () => 0.99)).results[''], 'caught');
  assert.equal(await fail.economy.get(GUILD, ANN), 90);
  assert.equal(await fail.economy.get(GUILD, BOB), 210, 'fine to the victim');
});

test('limits: cap, self, empty victims', async () => {
  const ctx = ctxWith({ max_steal: '5', cooldown_minutes: 0 });
  await steal(ctx, { vars, config: { target: BOB } }, () => 0);
  assert.equal(await ctx.economy.get(GUILD, ANN), 105);
  assert.equal((await runBlock(plugin, 'steal', ctx, { vars, config: { target: ANN } })).port, 'failed');
  const poor = createTestContext({ id: 'plugin_criminal', permissions, config: { cooldown_minutes: 0 }, balances: {}, discord: { 'member.get': (g, u) => ({ id: u, bot: false, roles: [] }) } });
  assert.match((await runBlock(plugin, 'steal', poor, { vars, config: { target: BOB } })).results[''], /nothing to steal/);
});
