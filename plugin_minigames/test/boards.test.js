import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runTask } from '#sdk-testing';
import plugin from '../index.js';
import { rng } from '../services/core.js';
import { botColumn, canMove, drop, fourAt, slide, slideLine } from '../services/boards.js';
import { botMove, legalMoves, newBoard, parseMove, play, result, san } from '../services/chess.js';

const GUILD = '100000000000000001';
const ANN = '200000000000000001';
const BOB = '200000000000000002';
const permissions = ['storage', 'scheduler', 'discord.interactions.reply', 'discord.members.read', 'modules.economy.balance.read', 'modules.economy.balance.write', 'http.outbound'];
const ctxWith = (extra = {}) => createTestContext({ id: 'plugin_minigames', permissions, config: { min_bet: '1', max_bet: '', puzzle_reward: '50', puzzle_cooldown_minutes: 60, trivia_reward: '25', trivia_cooldown_minutes: 5 },
  balances: { [`${GUILD}:${ANN}`]: 1000, [`${GUILD}:${BOB}`]: 1000 }, discord: { 'member.get': (g, u) => ({ id: u, bot: false, roles: [] }) }, hosts: ['opentdb.com'], ...extra });
const vars = (user = ANN) => ({ 'server.id': GUILD, 'user.id': user });
const click = (ctx, key, data, user = ANN) => runComponent(plugin, key, ctx, { data, handle: `h${Math.random()}`, user: { id: user, name: 'u', displayName: 'u' }, guildId: GUILD });
const last = (ctx) => ctx.answers.at(-1).message;
const desc = (ctx) => last(ctx).embeds[0].description;

/** Plays a list of SAN/UCI moves from the start. */
const line = (...moves) => moves.reduce((s, m) => {
  const mv = parseMove(s, m);
  assert.ok(mv, `legal: ${m}`);
  return play(s, mv);
}, newBoard());

test('chess rules: move count, notation, castling, en passant, promotion, mates', () => {
  assert.equal(legalMoves(newBoard()).length, 20);
  // perft 2 from the start: 400
  assert.equal(legalMoves(newBoard()).reduce((n, m) => n + legalMoves(play(newBoard(), m)).length, 0), 400);
  const fools = line('f3', 'e5', 'g4', 'Qh4');
  assert.equal(result(fools), 'mate');
  const s = line('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6');
  assert.equal(san(s, parseMove(s, 'e1g1')), 'O-O');
  const castled = play(s, parseMove(s, 'O-O'));
  assert.equal(castled.board[5], 'R');
  assert.equal(castled.board[6], 'K');
  const ep = line('e4', 'a6', 'e5', 'd5');
  const m = parseMove(ep, 'exd6');
  assert.ok(m?.ep);
  assert.equal(play(ep, m).board[35], '', 'the passed pawn is taken');
  // knights on b1 and f3 can both go to d2 after d3 / Nf3 moves: notation tells them apart
  const twins = line('Nf3', 'a6', 'd3', 'b6');
  assert.equal(san(twins, parseMove(twins, 'b1d2')), 'Nbd2');
  const promo = { board: Array(64).fill(''), turn: 'w', castle: '', ep: -1, half: 0 };
  promo.board[52] = 'P';
  promo.board[0] = 'K';
  promo.board[63] = 'k';
  assert.equal(san(promo, parseMove(promo, 'e7e8')), 'e8=Q+');
  assert.equal(parseMove(promo, 'e8=N').promo, 'n');
  assert.equal(result({ board: Object.assign(Array(64).fill(''), { 0: 'K', 63: 'k' }), turn: 'w', castle: '', ep: -1, half: 0 }), 'material');
  // the bot takes a free queen
  const free = line('e4', 'd5', 'Qg4');
  assert.equal(san(free, botMove(free)), 'Bxg4');
});

test('chess game: moves, turns, bot answers, resign', async () => {
  const ctx = ctxWith();
  rng.next = () => 0;
  const start = await runBlock(plugin, 'chess', ctx, { vars: vars(), config: { opponent: BOB }, interaction: 'c1' });
  assert.equal(start.port, 'replied');
  assert.equal((await runBlock(plugin, 'chess', ctx, { vars: vars(BOB), config: {}, interaction: 'c' })).port, 'failed', 'one game at a time');
  assert.equal((await runBlock(plugin, 'chessmove', ctx, { vars: vars(BOB), config: { move: 'e5' }, interaction: 'c' })).port, 'failed', 'white starts');
  assert.equal((await runBlock(plugin, 'chessmove', ctx, { vars: vars(), config: { move: 'e9' }, interaction: 'c' })).port, 'failed');
  assert.equal((await runBlock(plugin, 'chessmove', ctx, { vars: vars(), config: { move: 'e2e4' }, interaction: 'c' })).results[''], 'e4');
  assert.equal((await runBlock(plugin, 'chessmove', ctx, { vars: vars(BOB), config: { move: 'e5' }, interaction: 'c' })).results[''], 'e5');
  await click(ctx, 'chess_resign', start.results[''], BOB);
  assert.match(desc(ctx), /resigns.*<@200000000000000001> wins/s);
  assert.equal((await runBlock(plugin, 'chessmove', ctx, { vars: vars(), config: { move: 'Nf3' }, interaction: 'c' })).port, 'failed', 'game over');
  // against the bot: it answers at once
  await runBlock(plugin, 'chess', ctx, { vars: vars(), config: {}, interaction: 'c2' });
  await runBlock(plugin, 'chessmove', ctx, { vars: vars(), config: { move: 'd4' }, interaction: 'c' });
  assert.match(desc(ctx), /Bot plays \*\*/);
});

test('2048: slides, merges once per move, game over', async () => {
  assert.deepEqual(slideLine([2, 2, 2, 2]), { line: [4, 4, 0, 0], points: 8 });
  assert.deepEqual(slideLine([0, 4, 4, 8]).line, [8, 8, 0, 0]);
  const cells = [2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  assert.deepEqual(slide(cells, 'r').cells.slice(0, 4), [0, 0, 0, 4]);
  assert.equal(slide(cells, 'u').moved, false);
  assert.equal(canMove([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]), false);
  const ctx = ctxWith();
  rng.next = () => 0;
  const g = await runBlock(plugin, 'game2048', ctx, { vars: vars(), interaction: 'c' });
  await click(ctx, 'g2048', `${g.results['']}:r`);
  assert.match(desc(ctx), /Score: \*\*4\*\*/);
  await click(ctx, 'g2048', `${g.results['']}:r`, BOB);
  assert.match(ctx.answers.at(-1).message, /not your game/);
  await click(ctx, 'g2048', `${g.results['']}:q`);
  assert.match(desc(ctx), /Stopped/);
});

test('connect 4: four in a row, bot blocks, bets paid', async () => {
  const cells = Array(42).fill(0);
  for (const c of [0, 1, 2]) drop(cells, c, 1);
  assert.equal(botColumn(cells), 3, 'blocks the open three');
  assert.ok(fourAt(cells, drop(cells, 3, 1)));
  const ctx = ctxWith();
  rng.next = () => 0.5;
  const g = await runBlock(plugin, 'connect4', ctx, { vars: vars(), config: { opponent: BOB, bet: '100' }, interaction: 'c' });
  const id = g.results[''];
  await click(ctx, 'c4', `${id}:0`);
  assert.match(ctx.answers.at(-1).message, /over/, 'not accepted yet');
  await click(ctx, 'c4_accept', id, BOB);
  for (let k = 0; k < 3; k++) {
    await click(ctx, 'c4', `${id}:0`);
    await click(ctx, 'c4', `${id}:1`, BOB);
  }
  await click(ctx, 'c4', `${id}:1`, BOB);
  assert.match(ctx.answers.at(-1).message, /not your turn/);
  await click(ctx, 'c4', `${id}:0`);
  assert.match(desc(ctx), /<@200000000000000001> wins!.*200/s);
  assert.equal(await ctx.economy.get(GUILD, ANN), 1100);
  assert.equal(await ctx.economy.get(GUILD, BOB), 900);
  // an open challenge expires and pays back
  const g2 = await runBlock(plugin, 'connect4', ctx, { vars: vars(), config: { opponent: BOB, bet: '50' }, interaction: 'c' });
  assert.equal(await ctx.economy.get(GUILD, ANN), 1050);
  const stored = JSON.parse(await ctx.storage.get(`g:${g2.results['']}`));
  await ctx.storage.set(`g:${stored.id}`, JSON.stringify({ ...stored, at: 0 }));
  await runTask(plugin, 'expire', ctx);
  assert.equal(await ctx.economy.get(GUILD, ANN), 1100);
});

test('trivia: question from opentdb, one try each, first right answer wins', async () => {
  const q = { response_code: 0, results: [{ category: 'Science', difficulty: 'easy', question: 'What%20is%20H2O%3F', correct_answer: 'Water', incorrect_answers: ['Salt', 'Air', 'Fire'] }] };
  const ctx = ctxWith({ web: { 'opentdb.com': () => ({ status: 200, json: q }) } });
  rng.next = () => 0;
  const g = await runBlock(plugin, 'trivia', ctx, { vars: vars(), config: { difficulty: 'easy' }, interaction: 'c' });
  assert.match(desc(ctx), /What is H2O\?/);
  assert.equal(ctx.web.at(-1).query.difficulty, 'easy');
  const stored = JSON.parse(await ctx.storage.get(`g:${g.results['']}`));
  const wrong = (stored.right + 1) % 4;
  await click(ctx, 'trivia', `${stored.id}:${wrong}`, BOB);
  await click(ctx, 'trivia', `${stored.id}:${stored.right}`, BOB);
  assert.match(ctx.answers.at(-1).message, /already answered/);
  await click(ctx, 'trivia', `${stored.id}:${stored.right}`);
  assert.match(desc(ctx), /<@200000000000000001> knew it and wins/);
  assert.equal(await ctx.economy.get(GUILD, ANN), 1025);
  // offline: a built-in question
  const off = ctxWith({ web: { 'opentdb.com': () => ({ status: 500 }) } });
  assert.equal((await runBlock(plugin, 'trivia', off, { vars: vars(), config: {}, interaction: 'c' })).port, 'replied');
});
