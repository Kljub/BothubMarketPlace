import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runTask } from '#sdk-testing';
import plugin from '../index.js';
import { resolve } from '../services/game.js';

const GUILD = '100000000000000001';
const ANN = '200000000000000001';
const BOB = '200000000000000002';
const permissions = ['storage', 'scheduler', 'discord.interactions.reply', 'discord.members.read', 'modules.economy.balance.read', 'modules.economy.balance.write'];
const ctxWith = (config = {}) => createTestContext({
  id: 'plugin_rps', permissions, config: { currency: 'coins', max_bet: '500', ...config },
  balances: { [`${GUILD}:${ANN}`]: 100, [`${GUILD}:${BOB}`]: 100 },
  discord: { 'member.get': (g, u) => ({ id: u, bot: u === '999999999999999999', roles: [] }) },
});
const vars = { 'server.id': GUILD, 'user.id': ANN };
const click = (ctx, key, data, user, handle = `h${Math.random()}`) => runComponent(plugin, key, ctx, { data, handle, user: { id: user, name: 'u', displayName: 'u' }, guildId: GUILD });

test('rules', () => {
  assert.equal(resolve('rock', 'scissors'), 'a');
  assert.equal(resolve('rock', 'paper'), 'b');
  assert.equal(resolve('paper', 'paper'), 'tie');
});

test('solo: bets win twice, ties pay back, too high or too poor refused', async () => {
  for (let i = 0; i < 20; i++) {
    const ctx = ctxWith();
    const out = await runBlock(plugin, 'solo', ctx, { vars, config: { choice: 'rock', bet: '10' } });
    const balance = await ctx.economy.get(GUILD, ANN);
    assert.equal(balance, { win: 110, lose: 90, tie: 100 }[out.results['']]);
  }
  const ctx = ctxWith();
  assert.equal((await runBlock(plugin, 'solo', ctx, { vars, config: { choice: 'rock', bet: '600' } })).results[''], '❌ The highest bet is **500** coins.');
  assert.match((await runBlock(plugin, 'solo', ctx, { vars, config: { choice: 'rock', bet: '200' } })).results[''], /Not enough coins/);
  assert.equal((await runBlock(plugin, 'solo', ctx, { vars, config: { choice: 'lizard' } })).port, 'failed');
  const free = await runBlock(plugin, 'solo', ctx, { vars, config: { choice: 'papier' } });
  assert.equal(free.port, 'next', 'without a bet the economy stays untouched');
  assert.equal(await ctx.economy.get(GUILD, ANN), 100);
});

test('duel: accept takes both bets, hidden picks, winner gets the pot', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'duel', ctx, { vars, interaction: 'cmd', config: { opponent: BOB, bet: '30' } });
  assert.equal(out.port, 'replied');
  const id = out.results[''];
  assert.equal(await ctx.economy.get(GUILD, ANN), 70);
  await click(ctx, 'accept', id, ANN);
  assert.match(ctx.answers.at(-1).message, /Only the challenged member/);
  await click(ctx, 'accept', id, BOB);
  assert.equal(await ctx.economy.get(GUILD, BOB), 70);
  await click(ctx, 'pick', `${id}:rock`, ANN);
  assert.equal(ctx.answers.at(-1).ephemeral, true);
  await click(ctx, 'pick', `${id}:paper`, ANN);
  assert.match(ctx.answers.at(-1).message, /already picked/);
  await click(ctx, 'pick', `${id}:scissors`, BOB);
  const end = ctx.answers.at(-1);
  assert.equal(end.kind, 'update');
  assert.match(end.message.embeds[0].description, /<@200000000000000001> wins! Prize: \*\*60\*\* coins/);
  assert.equal(await ctx.economy.get(GUILD, ANN), 130);
  assert.equal(await ctx.economy.get(GUILD, BOB), 70);
  await click(ctx, 'pick', `${id}:rock`, BOB);
  assert.match(ctx.answers.at(-1).message, /over/);
});

test('duel: decline and timeout pay back', async () => {
  const ctx = ctxWith();
  const a = (await runBlock(plugin, 'duel', ctx, { vars, interaction: 'c1', config: { opponent: BOB, bet: '20' } })).results[''];
  await click(ctx, 'decline', a, BOB);
  assert.equal(await ctx.economy.get(GUILD, ANN), 100);
  const b = (await runBlock(plugin, 'duel', ctx, { vars, interaction: 'c2', config: { opponent: BOB, bet: '20' } })).results[''];
  await click(ctx, 'accept', b, BOB);
  const d = JSON.parse(ctx.store.get(`duel:${b}`));
  ctx.store.set(`duel:${b}`, JSON.stringify({ ...d, at: 0 }));
  await runTask(plugin, 'expire', ctx);
  assert.equal(await ctx.economy.get(GUILD, ANN), 100);
  assert.equal(await ctx.economy.get(GUILD, BOB), 100);
  assert.equal((await runBlock(plugin, 'duel', ctx, { vars, interaction: 'c3', config: { opponent: ANN } })).port, 'failed', 'not yourself');
});
