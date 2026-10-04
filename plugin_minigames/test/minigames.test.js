import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runTask } from '#sdk-testing';
import plugin from '../index.js';
import { rng } from '../services/core.js';
import { dosOutcome } from '../services/duel.js';
import { FIVE_DICE, SCRATCH, handOf, scratchCard, step } from '../services/luck.js';
import { lightsBoard, press, score } from '../services/puzzles.js';
import { CATCHES } from '../services/earn.js';

const GUILD = '100000000000000001';
const ANN = '200000000000000001';
const BOB = '200000000000000002';
const permissions = ['storage', 'scheduler', 'discord.interactions.reply', 'discord.members.read', 'modules.economy.balance.read', 'modules.economy.balance.write'];
const ctxWith = (config = {}) => createTestContext({ id: 'plugin_minigames', permissions, config: { min_bet: '1', max_bet: '', currency: 'coins', puzzle_reward: '50', puzzle_cooldown_minutes: 60, ...config },
  balances: { [`${GUILD}:${ANN}`]: 1000, [`${GUILD}:${BOB}`]: 1000 }, discord: { 'member.get': (g, u) => ({ id: u, bot: false, roles: [] }) } });
const vars = { 'server.id': GUILD, 'user.id': ANN };
const click = (ctx, key, data, user = ANN, values) => runComponent(plugin, key, ctx, { data, handle: `h${Math.random()}`, user: { id: user, name: 'u', displayName: 'u' }, guildId: GUILD, ...(values ? { values } : {}) });
const seq = (...xs) => { let i = 0; rng.next = () => xs[i++ % xs.length]; };
const last = (ctx) => ctx.answers.at(-1).message;
const desc = (ctx) => last(ctx).embeds[0].description;

test('rules: hands, odds, scratch cards, pegs, lights, catches', () => {
  assert.equal(handOf([3, 3, 3, 3, 3]), 'five');
  assert.equal(handOf([2, 2, 5, 5, 5]), 'full');
  assert.equal(handOf([6, 2, 3, 4, 5]), 'straight');
  assert.equal(handOf([1, 1, 2, 2, 6]), 'twopair');
  // exact value of five dice (all 7776 rolls)
  let ev = 0;
  for (let n = 0; n < 7776; n++) {
    const d = [0, 1, 2, 3, 4].map((k) => 1 + Math.floor(n / 6 ** k) % 6);
    ev += FIVE_DICE.find((h) => h[0] === handOf(d))[2];
  }
  assert.ok(ev / 7776 > 0.98 && ev / 7776 < 1, `five dice value ${ev / 7776}`);
  assert.ok(Math.abs(SCRATCH.reduce((s, [, p, x]) => s + p * x, 0) - 0.99) < 1e-9);
  assert.equal(step(1, 'h'), 1);
  assert.equal(step(13, 'h'), 0);
  assert.equal(step(7, 'l', 0.5), 1);
  for (let k = 0; k < 50; k++) {
    rng.next = Math.random;
    const { cells, win } = scratchCard();
    const counts = cells.reduce((m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }), {});
    for (const [c, n] of Object.entries(counts)) assert.ok(c === win ? n === 3 : n <= 2, JSON.stringify(cells));
  }
  assert.deepEqual(score([0, 1, 2, 3], [0, 2, 1, 5]), { black: 1, white: 2 });
  assert.deepEqual(score([0, 0, 1, 1], [1, 1, 1, 0]), { black: 1, white: 2 });
  assert.deepEqual(press(Array(25).fill(false), 0).map((x, i) => (x ? i : -1)).filter((i) => i >= 0), [0, 1, 5]);
  assert.ok(lightsBoard().some(Boolean));
  assert.ok(Math.abs(CATCHES.reduce((s, c) => s + c[2], 0) - 1) < 1e-9);
  assert.deepEqual(dosOutcome('d', 'd', 10), [20, 20]);
  assert.deepEqual(dosOutcome('s', 'd', 10), [20, 0]);
  assert.deepEqual(dosOutcome('s', 's', 10), [0, 0]);
});

test('dice bet: duel pays the winner, against the bot at once', async () => {
  const ctx = ctxWith();
  const id = (await runBlock(plugin, 'dicebet', ctx, { vars, interaction: 'c', config: { opponent: BOB, bet: '100' } })).results[''];
  assert.equal(await ctx.economy.get(GUILD, ANN), 900);
  await click(ctx, 'duel_accept', id, ANN);
  assert.match(last(ctx), /Only the challenged/);
  seq(0.99, 0.99, 0, 0); // Ann 6+6, Bob 1+1
  await click(ctx, 'duel_accept', id, BOB);
  assert.match(desc(ctx), /<@200000000000000001> wins \*\*200\*\*/);
  assert.equal(await ctx.economy.get(GUILD, ANN), 1100);
  assert.equal(await ctx.economy.get(GUILD, BOB), 900);
  seq(0, 0, 0.99, 0.99);
  await runBlock(plugin, 'dicebet', ctx, { vars, interaction: 'c2', config: { bet: '50' } });
  assert.match(desc(ctx), /bot wins/);
  assert.equal(await ctx.economy.get(GUILD, ANN), 1050);
});

test('double or steal: secret picks, stealer takes the pot; idle duels pay back', async () => {
  const ctx = ctxWith();
  const id = (await runBlock(plugin, 'dos', ctx, { vars, interaction: 'c', config: { opponent: BOB, bet: '100' } })).results[''];
  await click(ctx, 'duel_accept', id, BOB);
  await click(ctx, 'dos_pick', `${id}:s`, ANN);
  assert.doesNotMatch(desc(ctx), /Steal/, 'the pick stays secret');
  await click(ctx, 'dos_pick', `${id}:d`, BOB);
  assert.match(desc(ctx), /<@200000000000000001> steals the pot/);
  assert.deepEqual([await ctx.economy.get(GUILD, ANN), await ctx.economy.get(GUILD, BOB)], [1100, 900]);
  const id2 = (await runBlock(plugin, 'dos', ctx, { vars, interaction: 'c', config: { opponent: BOB, bet: '100' } })).results[''];
  await click(ctx, 'duel_accept', id2, BOB);
  ctx.store.set(`g:${id2}`, JSON.stringify({ ...JSON.parse(ctx.store.get(`g:${id2}`)), at: 0 }));
  await runTask(plugin, 'expire', ctx);
  assert.deepEqual([await ctx.economy.get(GUILD, ANN), await ctx.economy.get(GUILD, BOB)], [1100, 900]);
});

test('five dice and scratch card pay by the table', async () => {
  const ctx = ctxWith({ scratch_price: '100' });
  seq(0.5); // five 4s
  assert.equal((await runBlock(plugin, 'fivedice', ctx, { vars, interaction: 'c', config: { bet: '10' } })).results[''], 'five');
  assert.equal(await ctx.economy.get(GUILD, ANN), 1290);
  seq(0.005, 0.3, 0.6, 0.1, 0.9, 0.4, 0.7, 0.2, 0.8, 0.5);
  const id = (await runBlock(plugin, 'scratchcard', ctx, { vars, interaction: 'c' })).results[''];
  assert.equal(await ctx.economy.get(GUILD, ANN), 1190);
  await click(ctx, 'scratch', `${id}:0`, BOB);
  assert.match(last(ctx), /not your card/);
  await click(ctx, 'scratch', `${id}:all`);
  assert.match(desc(ctx), /💎💎💎: you win \*\*2,000\*\*/);
  assert.equal(await ctx.economy.get(GUILD, ANN), 3190);
});

test('high-low: right guesses multiply, cash out, wrong loses', async () => {
  const ctx = ctxWith({ rtp: 100 });
  seq(0); // card A
  const id = (await runBlock(plugin, 'highlow', ctx, { vars, interaction: 'c', config: { bet: '100' } })).results[''];
  seq(0.99); // K: higher, x1
  await click(ctx, 'hl', `${id}:h`);
  seq(0); // A: lower from K, x12/12
  await click(ctx, 'hl', `${id}:l`);
  seq(0.5); // 7: higher from A (x1)
  await click(ctx, 'hl', `${id}:h`);
  assert.match(desc(ctx), /right/);
  seq(0.99); // K: higher from 7 (x 12/6 = 2)
  await click(ctx, 'hl', `${id}:h`);
  await click(ctx, 'hl', `${id}:c`);
  assert.match(desc(ctx), /Cashed out \*\*200\*\*/);
  assert.equal(await ctx.economy.get(GUILD, ANN), 1100);
  seq(0.5);
  const id2 = (await runBlock(plugin, 'highlow', ctx, { vars, interaction: 'c', config: { bet: '100' } })).results[''];
  seq(0);
  await click(ctx, 'hl', `${id2}:h`);
  assert.match(desc(ctx), /wrong/);
  assert.equal(await ctx.economy.get(GUILD, ANN), 1000);
});

test('puzzles: mastermind, hangman, match pairs and lights out pay once per cooldown', async () => {
  const ctx = ctxWith({ hangman_words: 'abba' });
  seq(0); // code 🔴🔴🔴🔴
  const mm = (await runBlock(plugin, 'mastermind', ctx, { vars, interaction: 'c' })).results[''];
  for (let k = 0; k < 4; k++) await click(ctx, 'mm', `${mm}:0`);
  await click(ctx, 'mm', `${mm}:go`);
  assert.match(desc(ctx), /Cracked in 1 try!\nReward: \*\*50\*\*/);
  assert.equal(await ctx.economy.get(GUILD, ANN), 1050);

  const hm = (await runBlock(plugin, 'hangman', ctx, { vars, interaction: 'c' })).results[''];
  await click(ctx, 'hm', hm, ANN, ['z']);
  assert.match(desc(ctx), /No Z/);
  await click(ctx, 'hm', hm, ANN, ['a']);
  await click(ctx, 'hm', hm, ANN, ['b']);
  assert.match(desc(ctx), /Solved!\nNext reward/);
  assert.equal(await ctx.economy.get(GUILD, ANN), 1050, 'reward cooldown');

  const mp = (await runBlock(plugin, 'matchpairs', ctx, { vars, interaction: 'c' })).results[''];
  const g = JSON.parse(ctx.store.get(`g:${mp}`));
  const done = new Set();
  for (let i = 0; i < 20; i++) {
    if (done.has(i)) continue;
    const j = g.cards.findIndex((c, k) => k !== i && c === g.cards[i]);
    done.add(i).add(j);
    await click(ctx, 'mp', `${mp}:${i}`);
    await click(ctx, 'mp', `${mp}:${j}`);
  }
  assert.match(desc(ctx), /All pairs in 10 moves/);

  const lo = (await runBlock(plugin, 'lightsout', ctx, { vars, interaction: 'c' })).results[''];
  ctx.store.set(`g:${lo}`, JSON.stringify({ ...JSON.parse(ctx.store.get(`g:${lo}`)), lights: press(Array(25).fill(false), 12) }));
  await click(ctx, 'lo', `${lo}:12`, BOB);
  assert.match(last(ctx), /not your game/);
  await click(ctx, 'lo', `${lo}:12`);
  assert.match(desc(ctx), /All lights off in 1 moves/);
});

test('beg and fish: chance, amounts, cooldown', async () => {
  const ctx = ctxWith({ beg_chance: 100, beg_min: '10', beg_max: '10', beg_cooldown_minutes: 5, fish_cooldown_minutes: 10, fish_scale: 100 });
  seq(0);
  assert.equal((await runBlock(plugin, 'beg', ctx, { vars, interaction: 'c' })).results[''], 10);
  assert.match((await runBlock(plugin, 'beg', ctx, { vars, interaction: 'c' })).results[''], /Try again/);
  seq(0.999, 0.999); // shark, 600
  assert.equal((await runBlock(plugin, 'fish', ctx, { vars, interaction: 'c' })).results[''], 600);
  assert.equal(await ctx.economy.get(GUILD, ANN), 1610);
  rng.next = Math.random;
});
