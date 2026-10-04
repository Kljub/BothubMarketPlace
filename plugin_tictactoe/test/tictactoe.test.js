import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runTask } from '#sdk-testing';
import plugin from '../index.js';
import { botMove, winner } from '../services/game.js';

const GUILD = '100000000000000001';
const ANN = '200000000000000001';
const BOB = '200000000000000002';
const permissions = ['storage', 'scheduler', 'discord.interactions.reply', 'discord.members.read', 'modules.economy.balance.read', 'modules.economy.balance.write'];
const ctxWith = () => createTestContext({ id: 'plugin_tictactoe', permissions, config: { min_bet: '1', max_bet: '', currency: 'coins' },
  balances: { [`${GUILD}:${ANN}`]: 100, [`${GUILD}:${BOB}`]: 100 }, discord: { 'member.get': (g, u) => ({ id: u, bot: false, roles: [] }) } });
const vars = { 'server.id': GUILD, 'user.id': ANN };
const press = (ctx, key, data, user) => runComponent(plugin, key, ctx, { data, handle: `h${Math.random()}`, user: { id: user, name: 'u', displayName: 'u' }, guildId: GUILD });

test('rules and the bot', () => {
  assert.equal(winner(['X', 'X', 'X', '', '', '', '', '', '']), 'X');
  assert.equal(winner(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']), 'draw');
  assert.equal(botMove(['O', 'O', '', 'X', 'X', '', '', '', '']), 2, 'wins first');
  assert.equal(botMove(['X', 'X', '', '', 'O', '', '', '', '']), 2, 'then blocks');
  assert.equal(botMove(Array(9).fill('')), 4, 'centre');
});

test('duel: accept, turns, winner takes the pot', async () => {
  const ctx = ctxWith();
  const id = (await runBlock(plugin, 'start', ctx, { vars, interaction: 'c', config: { opponent: BOB, bet: '10' } })).results[''];
  await press(ctx, 'move', `${id}:0`, ANN);
  assert.match(ctx.answers.at(-1).message, /over/, 'no moves before accept');
  await press(ctx, 'accept', id, BOB);
  await press(ctx, 'move', `${id}:0`, BOB);
  assert.match(ctx.answers.at(-1).message, /Not your turn/);
  for (const [cell, who] of [[0, ANN], [3, BOB], [1, ANN], [4, BOB], [2, ANN]]) await press(ctx, 'move', `${id}:${cell}`, who);
  assert.match(ctx.answers.at(-1).message.embeds[0].description, /<@200000000000000001> wins! Prize: \*\*20\*\*/);
  assert.equal(await ctx.economy.get(GUILD, ANN), 110);
  assert.equal(await ctx.economy.get(GUILD, BOB), 90);
});

test('against the bot; idle games pay back', async () => {
  const ctx = ctxWith();
  const id = (await runBlock(plugin, 'start', ctx, { vars, interaction: 'c', config: {} })).results[''];
  await press(ctx, 'move', `${id}:0`, ANN);
  const g = JSON.parse(ctx.store.get(`g:${id}`));
  assert.equal(g.board.filter(Boolean).length, 2, 'the bot answered');
  const id2 = (await runBlock(plugin, 'start', ctx, { vars, interaction: 'c2', config: { bet: '30' } })).results[''];
  assert.equal(await ctx.economy.get(GUILD, ANN), 70);
  ctx.store.set(`g:${id2}`, JSON.stringify({ ...JSON.parse(ctx.store.get(`g:${id2}`)), at: 0 }));
  await runTask(plugin, 'expire', ctx);
  assert.equal(await ctx.economy.get(GUILD, ANN), 100);
});
