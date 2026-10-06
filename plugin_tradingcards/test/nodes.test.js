import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent } from '#sdk-testing';
import plugin from '../index.js';
import { drawPack, cards } from '../services/cards.js';

const G = '200000000000000001';
const A = '100000000000000001';
const B = '100000000000000002';
const permissions = ['storage', 'storage.files', 'discord.interactions.reply', 'modules.economy.balance.write'];
const CARDS = [
  { _id: 'c1b2c3d4', name: 'Slime', rarity: 'common', image: 'https://img.test/slime.png' },
  { _id: 'c2b2c3d4', name: 'Dragon', rarity: 'legendary', image: 'https://img.test/dragon.png' },
  { _id: 'c3b2c3d4', name: 'Knight', rarity: 'rare', image: 'https://img.test/knight.png' },
];
const vars = (u) => ({ 'server.id': G, 'user.id': u });
const ctxWith = (config = {}) => createTestContext({ id: 'plugin_tradingcards', permissions, config: { cards: CARDS, pack_size: 3, free_pack_hours: 24, pack_price: 0, ...config } });

test('drawPack: rarities by weight, only rarities with cards', () => {
  const ctx = ctxWith();
  const list = cards(ctx);
  assert.deepEqual(drawPack(list, 3, () => 0).map((c) => c.name), ['Slime', 'Slime', 'Slime'], 'low rolls: common');
  assert.equal(drawPack(list, 1, () => 0.999)[0].name, 'Dragon', 'top roll: legendary');
  assert.deepEqual(drawPack([], 3), []);
});

test('open: free once per cooldown, then refused (no price)', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'open', ctx, { vars: vars(A), interaction: 'h1' });
  assert.equal(out.port, 'replied');
  assert.equal(out.results[''].split(', ').length, 3);
  const again = await runBlock(plugin, 'open', ctx, { vars: vars(A), interaction: 'h2' });
  assert.match(String(ctx.answers.at(-1).message), /next free pack is ready/);
  assert.equal(again.port, 'replied');
  const col = await runBlock(plugin, 'collection', ctx, { vars: vars(A) });
  assert.equal(col.results['.total'], '3');
});

test('open: bought with coins when the free pack is not ready', async () => {
  const ctx = ctxWith({ pack_price: 50 });
  await runBlock(plugin, 'open', ctx, { vars: vars(A) });
  const poor = await runBlock(plugin, 'open', ctx, { vars: vars(A) });
  assert.equal(poor.port, 'failed');
  await ctx.economy.add(G, A, 100);
  assert.equal((await runBlock(plugin, 'open', ctx, { vars: vars(A) })).port, 'next');
  assert.equal(await ctx.economy.remove(G, A, 50).then(() => 'paid', () => 'short'), 'paid', 'exactly 50 left');
});

test('trade: offer, only the asked member accepts, cards are swapped; gift', async () => {
  const ctx = ctxWith();
  await ctx.storage.set(`col:${G}:${A}`, JSON.stringify({ slime: 1 }));
  await ctx.storage.set(`col:${G}:${B}`, JSON.stringify({ dragon: 1 }));
  const offer = await runBlock(plugin, 'trade', ctx, { vars: vars(A), config: { target: `<@${B}>`, give: 'slime', want: 'drag' }, interaction: 'h1' });
  assert.equal(offer.port, 'replied');
  const id = offer.results[''];
  await runComponent(plugin, 'trade_yes', ctx, { handle: 'x1', data: id, user: { id: A }, guildId: G });
  assert.match(String(ctx.answers.at(-1).message), /Only the asked member/);
  await runComponent(plugin, 'trade_yes', ctx, { handle: 'x2', data: id, user: { id: B }, guildId: G });
  assert.match(ctx.answers.at(-1).message.content, /Traded/);
  assert.deepEqual(JSON.parse(await ctx.storage.get(`col:${G}:${A}`)), { dragon: 1 });
  assert.deepEqual(JSON.parse(await ctx.storage.get(`col:${G}:${B}`)), { slime: 1 });
  const gift = await runBlock(plugin, 'gift', ctx, { vars: vars(A), config: { target: B, card: 'dragon' } });
  assert.equal(gift.port, 'next');
  assert.deepEqual(JSON.parse(await ctx.storage.get(`col:${G}:${B}`)), { slime: 1, dragon: 1 });
  assert.equal((await runBlock(plugin, 'gift', ctx, { vars: vars(A), config: { target: B, card: 'dragon' } })).port, 'failed', 'not owned anymore');
});
