import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runTask } from '#sdk-testing';
import plugin from '../index.js';
import { market, nextPrice, seeded } from '../services/blocks.js';

const GUILD = '100000000000000001';
const ANN = '200000000000000001';
const permissions = ['storage', 'discord.interactions.reply', 'modules.economy.balance.read', 'modules.economy.balance.write', 'discord.messages.send', 'discord.messages.edit', 'scheduler'];
const vars = { 'server.id': GUILD, 'user.id': ANN };
const ctxWith = (config = {}) => createTestContext({ id: 'plugin_stocks', permissions, config, balances: { [`${GUILD}:${ANN}`]: 1000 } });

test('prices: seeded, within the volatility, never below 1', async () => {
  assert.equal(seeded('a:B:1'), seeded('a:B:1'));
  assert.notEqual(seeded('a:B:1'), seeded('a:B:2'));
  assert.equal(nextPrice(100, 5, 1), 105);
  assert.equal(nextPrice(100, 5, 0), 95);
  assert.equal(nextPrice(1, 50, 0), 1);
  const ctx = ctxWith({ stocks: [{ symbol: 'abc', name: 'Abc', price: '100', volatility: 10 }] });
  const a = await market(ctx, GUILD, 0);
  assert.equal(a.ABC.price, 100);
  const b = await market(ctx, GUILD, 3 * 3_600_000);
  assert.ok(b.ABC.price >= 72 && b.ABC.price <= 134);
  assert.deepEqual(await market(ctxWith({ stocks: [{ symbol: 'abc', name: 'Abc', price: '100', volatility: 10 }] }), GUILD, 3 * 3_600_000), { ABC: { price: 100, prev: 100, step: 3 } }, 'a new market starts at the start price');
});

test('buy with fee, sell all, portfolio', async () => {
  const ctx = ctxWith({ stocks: [{ symbol: 'ABC', name: 'Abc', price: '100', volatility: 10 }], fee_percent: 2 });
  assert.equal((await runBlock(plugin, 'buy', ctx, { vars, config: { symbol: 'abc', shares: '20' } })).port, 'failed', 'too expensive');
  assert.equal((await runBlock(plugin, 'buy', ctx, { vars, config: { symbol: 'abc', shares: '5' } })).results[''], '510');
  assert.equal(await ctx.economy.get(GUILD, ANN), 490);
  const pf = await runBlock(plugin, 'portfolio', ctx, { vars, interaction: 'c' });
  assert.equal(pf.results[''], '500');
  assert.equal((await runBlock(plugin, 'sell', ctx, { vars, config: { symbol: 'ABC', shares: 'all' } })).results[''], '490');
  assert.equal(await ctx.economy.get(GUILD, ANN), 980);
  assert.equal((await runBlock(plugin, 'sell', ctx, { vars, config: { symbol: 'ABC' } })).port, 'failed');
  assert.equal((await runBlock(plugin, 'stocks', ctx, { vars, interaction: 'c' })).results[''], '1');
});

test('price board: posted on save, the same message updated after a price change, a new one when deleted', async () => {
  const CH = '300000000000000001';
  let deleted = false;
  const ctx = createTestContext({
    id: 'plugin_stocks', permissions,
    config: { board_channel: { id: CH, guild: GUILD }, stocks: [{ symbol: 'ABC', name: 'Abc', price: '100', volatility: 10 }] },
    discord: { 'message.edit': (...args) => { if (deleted) throw new Error('sdk.discord.not_found'); ctx.actions.push({ call: 'message.edit', args }); } },
  });
  await plugin.onConfigChange(ctx);
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].channelId, CH);
  assert.match(ctx.sent[0].message.embeds[0].description, /ABC/);
  await runTask(plugin, 'board_update', ctx);
  assert.equal(ctx.sent.length, 1, 'same interval: nothing new');
  const { syncBoard } = await import('../services/blocks.js');
  await syncBoard(ctx, { now: Date.now() + 2 * 3_600_000 });
  assert.equal(ctx.sent.length, 1, 'edited, not sent again');
  assert.equal(ctx.actions.filter((a) => a.call === 'message.edit').length, 1);
  deleted = true;
  await syncBoard(ctx, { now: Date.now() + 4 * 3_600_000 });
  assert.equal(ctx.sent.length, 2, 'deleted board: a new one');
});

test('price board: nothing without a channel', async () => {
  const ctx = ctxWith();
  await plugin.onConfigChange(ctx);
  await runTask(plugin, 'board_update', ctx);
  assert.equal(ctx.sent.length, 0);
});
