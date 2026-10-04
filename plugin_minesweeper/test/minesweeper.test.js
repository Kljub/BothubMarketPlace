import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runTask } from '#sdk-testing';
import plugin from '../index.js';
import { multiplierAt } from '../services/game.js';

const GUILD = '100000000000000001';
const ANN = '200000000000000001';
const BOB = '200000000000000002';
const permissions = ['storage', 'scheduler', 'discord.interactions.reply', 'modules.economy.balance.read', 'modules.economy.balance.write'];
const ctxWith = () => createTestContext({ id: 'plugin_minesweeper', permissions, config: { rtp: 100, min_bet: '10', max_bet: '1000', currency: 'coins' }, balances: { [`${GUILD}:${ANN}`]: 500 } });
const vars = { 'server.id': GUILD, 'user.id': ANN };
const click = (ctx, key, data, user = ANN) => runComponent(plugin, key, ctx, { key, data, handle: `h${Math.random()}`, user: { id: user, name: 'u', displayName: 'u' }, guildId: GUILD });
const round = (ctx, id) => JSON.parse(ctx.store.get(`ms:${id}`));

test('fair multiplier: 1 mine, 1 safe field = 24/23', () => {
  assert.equal(multiplierAt(1, 1, 100).toFixed(4), (24 / 23).toFixed(4));
  assert.ok(multiplierAt(10, 1, 100) > multiplierAt(3, 1, 100), 'more mines, more per diamond');
  assert.equal(multiplierAt(3, 0, 95), 1);
});

test('diamonds, cash out pays the multiplier; others cannot click', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'play', ctx, { vars, interaction: 'c1', config: { bet: '100', mines: '3' } });
  assert.equal(out.port, 'replied');
  const id = out.results[''];
  assert.equal(await ctx.economy.get(GUILD, ANN), 400);
  const r = round(ctx, id);
  const safe = [...Array(24).keys()].filter((i) => !r.mines.includes(i));
  await click(ctx, 'cell', `${id}:${safe[0]}`, BOB);
  assert.match(ctx.answers.at(-1).message, /not your round/);
  await click(ctx, 'cell', `${id}:${safe[0]}`);
  await click(ctx, 'cell', `${id}:${safe[1]}`);
  await click(ctx, 'cashout', id);
  assert.equal(await ctx.economy.get(GUILD, ANN), 400 + Math.floor(100 * multiplierAt(3, 2, 100)));
  assert.equal(ctx.store.has(`ms:${id}`), false);
});

test('a mine loses the bet; one round at a time; idle rounds pay back', async () => {
  const ctx = ctxWith();
  const id = (await runBlock(plugin, 'play', ctx, { vars, interaction: 'c1', config: { bet: '50', mines: '5' } })).results[''];
  assert.equal((await runBlock(plugin, 'play', ctx, { vars, interaction: 'c2', config: { bet: '50' } })).port, 'failed');
  await click(ctx, 'cell', `${id}:${round(ctx, id).mines[0]}`);
  assert.equal(ctx.answers.at(-1).message.embeds[0].title, '💥 Mine!');
  assert.equal(await ctx.economy.get(GUILD, ANN), 450);
  const id2 = (await runBlock(plugin, 'play', ctx, { vars, interaction: 'c3', config: { bet: '50' } })).results[''];
  ctx.store.set(`ms:${id2}`, JSON.stringify({ ...round(ctx, id2), at: 0 }));
  await runTask(plugin, 'expire', ctx);
  assert.equal(await ctx.economy.get(GUILD, ANN), 450, 'no diamond yet: the bet comes back');
  assert.equal((await runBlock(plugin, 'play', ctx, { vars, interaction: 'c4', config: { bet: '5' } })).port, 'failed', 'below the lowest bet');
});
