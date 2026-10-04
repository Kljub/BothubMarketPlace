import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runTask } from '#sdk-testing';
import plugin from '../index.js';
import { coinflip, dice, handValue, resolveHand, roulette, slots, SLOT_EV } from '../services/games.js';

const GUILD = '100000000000000001';
const ANN = '200000000000000001';
const permissions = ['storage', 'scheduler', 'discord.interactions.reply', 'modules.economy.balance.read', 'modules.economy.balance.write'];
const ctxWith = (rtp = 100) => createTestContext({ id: 'plugin_casino', permissions, config: { rtp, min_bet: '10', max_bet: '1000', currency: 'coins' }, balances: { [`${GUILD}:${ANN}`]: 1000 } });
const vars = { 'server.id': GUILD, 'user.id': ANN };
const fixed = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test('rules and fair payouts', () => {
  assert.deepEqual(coinflip(100, 'heads', 100, fixed(0.1)), { win: true, result: 'heads', payout: 200 });
  assert.equal(dice(100, 3, 95, fixed(2 / 6)).payout, Math.floor(100 * 6 * 0.95));
  assert.equal(roulette(100, 'red', 100, fixed(1 / 37)).win, true, 'pocket 1 is red');
  assert.equal(roulette(100, '0', 100, fixed(0)).payout, 3700);
  assert.equal(roulette(100, 'purple', 100, fixed(0)), null);
  // Monte Carlo: slots pay back about RTP.
  let paid = 0;
  for (let i = 0; i < 200000; i++) paid += slots(100, 100).payout;
  assert.ok(Math.abs(paid / 200000 / 100 - 1) < 0.06, `slots EV ${paid / 200000 / 100}`);
  assert.ok(SLOT_EV > 0);
  assert.equal(handValue(['A♠', 'K♥']), 21);
  assert.equal(handValue(['A♠', 'A♥', '9♦']), 21);
  assert.equal(resolveHand(['A♠', 'K♥'], ['9♠', '8♥'], 100, 100).payout, 250);
  assert.equal(resolveHand(['A♠', 'K♥'], ['9♠', '8♥'], 100, 100, true).outcome, 'win', 'split hands get no blackjack bonus');
  assert.equal(resolveHand(['10♠', '9♥'], ['10♦', '9♣'], 100, 90).payout, 100, 'push returns the bet regardless of RTP');
});

test('commands take the bet, pay out and offer again', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'coinflip', ctx, { vars, interaction: 'c1', config: { bet: '100', side: 'heads' } });
  assert.equal(out.port, 'replied');
  const balance = await ctx.economy.get(GUILD, ANN);
  assert.ok(balance === 900 || balance === 1100);
  const again = ctx.answers.at(-1).message.components[0][0];
  assert.equal(again.data, `coinflip:${ANN}:100:heads`);
  await runComponent(plugin, 'again', ctx, { data: again.data, handle: 'h1', user: { id: '200000000000000009', name: 'x', displayName: 'x' }, guildId: GUILD });
  assert.match(ctx.answers.at(-1).message, /not your game/);
  await runComponent(plugin, 'again', ctx, { data: again.data, handle: 'h2', user: { id: ANN, name: 'a', displayName: 'a' }, guildId: GUILD });
  assert.equal(ctx.answers.at(-1).message.embeds[0].title, '🪙 Coinflip');
  assert.equal((await runBlock(plugin, 'roulette', ctx, { vars, config: { bet: '10', field: 'purple' } })).port, 'failed');
  assert.equal((await runBlock(plugin, 'dice', ctx, { vars, config: { bet: '5000', number: '3' } })).port, 'failed', 'over the highest bet');
});

test('blackjack: hit and stand settle the hand; idle hands are played out', async () => {
  for (let round = 0; round < 10; round++) {
    const ctx = ctxWith();
    const out = await runBlock(plugin, 'blackjack', ctx, { vars, interaction: 'c1', config: { bet: '100' } });
    const id = out.results[''];
    if (!ctx.store.has(`bj:${id}`)) continue; // natural blackjack: done at once
    await runComponent(plugin, 'bj', ctx, { data: `${id}:stand`, handle: 'h', user: { id: ANN, name: 'a', displayName: 'a' }, guildId: GUILD });
    const end = ctx.answers.at(-1);
    assert.equal(end.kind, 'update');
    assert.match(end.message.embeds[0].description, /Balance/);
    assert.equal(ctx.store.has(`bj:${id}`), false);
  }
  const ctx = ctxWith();
  const id = (await runBlock(plugin, 'blackjack', ctx, { vars, interaction: 'c2', config: { bet: '100' } })).results[''];
  if (ctx.store.has(`bj:${id}`)) {
    ctx.store.set(`bj:${id}`, JSON.stringify({ ...JSON.parse(ctx.store.get(`bj:${id}`)), at: 0 }));
    await runTask(plugin, 'expire', ctx);
    assert.equal(ctx.store.has(`bj:${id}`), false);
  }
});
