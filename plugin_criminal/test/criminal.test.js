import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runTask } from '#sdk-testing';
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

test('bank heist: crew joins, leader starts, loot split from the bank', async () => {
  const CAL = '200000000000000003';
  const VIC = '200000000000000004';
  const ctx = createTestContext({ id: 'plugin_criminal', permissions: [...permissions, 'scheduler', 'modules.economy.bank.write'],
    config: { heist_min_crew: 3, heist_chance: 90, heist_percent: 30, heist_fine_percent: 10, heist_cooldown_minutes: 60, currency: 'coins' },
    balances: { [`${GUILD}:${ANN}`]: 100, [`${GUILD}:${BOB}`]: 100, [`${GUILD}:${CAL}`]: 100 }, banks: { [`${GUILD}:${VIC}`]: 1000 },
    discord: { 'member.get': (g, u) => ({ id: u, bot: false, roles: [] }) } });
  const press = (key, data, user) => runComponent(plugin, key, ctx, { data, handle: `h${Math.random()}`, user: { id: user, name: 'u', displayName: 'u' }, guildId: GUILD });
  const id = (await runBlock(plugin, 'heist', ctx, { vars, interaction: 'c', config: { target: VIC } })).results[''];
  await press('heist_start', id, ANN);
  assert.match(ctx.answers.at(-1).message, /too small/);
  await press('heist_join', id, BOB);
  await press('heist_join', id, VIC);
  assert.match(ctx.answers.at(-1).message, /own bank/);
  await press('heist_join', id, CAL);
  await press('heist_start', id, BOB);
  assert.match(ctx.answers.at(-1).message, /Only the leader/);
  await press('heist_start', id, ANN);
  const done = ctx.answers.at(-1).message.embeds[0].description;
  assert.ok(/got away|Caught/.test(done));
  if (/got away/.test(done)) {
    assert.equal(ctx.banks.get(`${GUILD}:${VIC}`), 700);
    assert.equal(await ctx.economy.get(GUILD, CAL), 200);
  }
  assert.match((await runBlock(plugin, 'heist', ctx, { vars, interaction: 'c2', config: { target: VIC } })).results[''], /guarded/);
});

test('bank heist: luck decides, lobbies expire', async () => {
  const { runHeist } = await import('../services/heist.js');
  const ctx = createTestContext({ id: 'plugin_criminal', permissions: [...permissions, 'scheduler', 'modules.economy.bank.write'],
    config: { heist_min_crew: 1, heist_chance: 40, heist_percent: 50, heist_max: '100', heist_fine_percent: 10 },
    balances: { [`${GUILD}:${ANN}`]: 100, [`${GUILD}:${BOB}`]: 50 }, banks: { [`${GUILD}:${BOB}`]: 1000 },
    discord: { 'member.get': (g, u) => ({ id: u, bot: false, roles: [] }) } });
  const h = { id: 'x', guild: GUILD, leader: ANN, target: BOB, crew: [ANN], at: Date.now() };
  assert.equal((await runHeist(ctx, h, () => 0)).ok, true);
  assert.equal(await ctx.economy.get(GUILD, ANN), 200, 'capped at the highest loot');
  assert.equal((await runHeist(ctx, h, () => 0.99)).ok, false);
  assert.equal(await ctx.economy.get(GUILD, ANN), 180, '10 % fine');
  const id = (await runBlock(plugin, 'heist', ctx, { vars, interaction: 'c', config: { target: BOB } })).results[''];
  assert.match(id, /guarded/);
  ctx.store.delete(`hcd:${GUILD}:${BOB}`);
  const id2 = (await runBlock(plugin, 'heist', ctx, { vars, interaction: 'c', config: { target: BOB } })).results[''];
  ctx.store.set(`h:${id2}`, JSON.stringify({ ...JSON.parse(ctx.store.get(`h:${id2}`)), at: 0 }));
  await runTask(plugin, 'expire', ctx);
  assert.equal(ctx.store.get(`h:${id2}`), undefined);
});
