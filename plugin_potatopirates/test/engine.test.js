import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck } from '../services/cards.js';
import {
  GameError, addPlayer, build, buyShip, createGame, declare, deny, endTurn, execute, moveCrew, pass, resolvePending, salute, startGame, waitingFor,
} from '../services/engine.js';
import { settle } from '../services/auto.js';
import { progCode } from '../services/view.js';

function rng(seed = 1) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Two humans (A, B) and optional bots; A on turn, fixed hands. */
function table({ bots = [], hands = {}, cfg = {} } = {}) {
  const env = { rng: rng(7), now: 1_000 };
  const g = createGame({ id: 'g1', guild: 'G', channel: 'C', host: 'A', cfg });
  addPlayer(g, { id: 'A', name: 'Ann' });
  addPlayer(g, { id: 'B', name: 'Bob' });
  for (const level of bots) addPlayer(g, { id: '', name: 'Bot', bot: level });
  startGame(g, env);
  g.turn = 0;
  g.salute = null;
  g.pending = null;
  g.players.forEach((p, i) => {
    p.hand = hands[i] ?? [];
    p.kings = 0;
    p.crystals = 10;
  });
  return { g, env };
}

test('the deck has the 85 playing cards of the base game (+2 promo)', () => {
  assert.equal(buildDeck().length, 85);
  assert.equal(buildDeck().filter((c) => c === 'K').length, 7);
  assert.equal(buildDeck(true).length, 87);
});

test('programs run like the rulebook examples', () => {
  const run = (cards, p, vals = { x: 0, y: 2 }) => {
    const s = { p };
    execute(cards, s, vals);
    return s.p;
  };
  assert.equal(run(['F3', 'R'], 10), 7, 'basic for loop: 3 damage');
  assert.equal(run(['F2', 'F3', 'R'], 10), 4, 'nested for: 6 damage');
  assert.equal(run(['W4', 'F'], 14), 2, 'while > 4 fry: 14-3-3-3-3');
  assert.equal(run(['W4', 'F3', 'R'], 9), 3, 'while + for: 9-3-3');
  assert.equal(run(['F2', 'R', 'M'], 10), 4, 'a loop repeats every card below it');
  assert.equal(run(['FX', 'M'], 10, { x: 3, y: 1 }), 4, 'for x: cards in the target hand');
  assert.equal(run(['FY', 'F'], 10, { x: 0, y: 2 }), 4, 'for y: own ships');
  assert.equal(run(['F3', 'F'], 4), 0, 'stops at 0');
  assert.equal(progCode({ i: null, a: ['F2', 'F3', 'R'], b: [] }), 'for i in range(2):\n    for j in range(3):\n        roast(target)  # -1');
});

test('building: crystals, control above action, If-Else only on an empty ship, 3 cards', () => {
  const { g } = table({ hands: { 0: ['R', 'F2', 'I5', 'F', 'M', 'M', 'R'] } });
  const a = g.players[0];
  const [s1, s2] = a.ships;
  a.crystals = 2;
  assert.throws(() => build(g, 0, 'F', s1.id), (e) => e.key === 'err.crystals');
  a.crystals = 10;
  build(g, 0, 'R', s1.id);
  assert.throws(() => build(g, 0, 'F2', s1.id), (e) => e.key === 'err.control_above');
  assert.throws(() => build(g, 0, 'I5', s1.id), (e) => e.key === 'err.if_first');
  build(g, 0, 'M', s1.id);
  build(g, 0, 'M', s1.id);
  assert.throws(() => build(g, 0, 'R', s1.id), (e) => e.key === 'err.full_ship');
  assert.equal(a.crystals, 10 - 1 - 2 - 2);
  build(g, 0, 'I5', s2.id);
  build(g, 0, 'F', s2.id, 'a');
  build(g, 0, 'R', s2.id, 'b');
  assert.deepEqual(s2.prog, { i: 'I5', a: ['F'], b: ['R'] });
  assert.throws(() => declare(g, { rng: Math.random, now: 0 }, 0, { kind: 'attack', ship: s1.id, target: g.players[1].ships[0].id }), (e) => e.key === 'err.modified');
});

test('attack after the next turn; If-Else hits every enemy ship; Deny chain', () => {
  const { g, env } = table({ hands: { 0: ['I5', 'F', 'R'], 1: ['D'], 2: [] }, bots: ['easy'] });
  const [s1] = g.players[0].ships;
  build(g, 0, 'I5', s1.id);
  build(g, 0, 'F', s1.id, 'a');
  build(g, 0, 'R', s1.id, 'b');
  endTurn(g, env, 0);
  g.players[1].hand = ['D'];
  settle(g, env);
  // Bob's turn: he passes it on.
  assert.equal(g.turn, 1);
  endTurn(g, env, 1);
  settle(g, env);
  assert.equal(g.turn, 0, 'the bot ended its turn');
  const b = g.players[1];
  b.ships[0].p = 3;
  b.ships[1].p = 10;
  b.hand = ['D'];
  g.players[0].hand.push('D');
  declare(g, env, 0, { kind: 'attack', ship: s1.id });
  assert.deepEqual(waitingFor(g), [1]);
  deny(g, env, 1);
  assert.deepEqual(waitingFor(g), [0]);
  deny(g, env, 0);
  pass(g, 1);
  resolvePending(g, env);
  assert.equal(b.ships.length, 1, 'the ship with 3 potatoes sank (fry on the If side)');
  assert.equal(b.ships[0].p, 9, 'the ship with 10 was roasted on the Else side');
  assert.equal(s1.mode, 'battle');
  assert.deepEqual(s1.prog, { i: null, a: [], b: [] }, 'cards are used up');
});

test('a denied attack is discarded', () => {
  const { g, env } = table({ hands: { 0: ['F'], 1: ['D'] } });
  const s = g.players[0].ships[0];
  s.prog.a = ['F'];
  declare(g, env, 0, { kind: 'attack', ship: s.id, target: g.players[1].ships[0].id });
  deny(g, env, 1);
  pass(g, 0);
  resolvePending(g, env);
  assert.equal(g.players[1].ships[0].p, 10);
  assert.equal(s.prog.a.length, 0);
});

test('ships cost 4 crew plus 1 for the new ship, max. 3; crew moves only between anchored ships', () => {
  const { g } = table();
  const a = g.players[0];
  buyShip(g, 0);
  assert.equal(a.ships.length, 3);
  assert.equal(a.ships.reduce((s, x) => s + x.p, 0), 16);
  assert.throws(() => buyShip(g, 0), (e) => e.key === 'err.max_ships');
  assert.throws(() => moveCrew(g, 0, a.ships[0].id, a.ships[1].id, a.ships[0].p), (e) => e.key === 'err.keep_one');
  moveCrew(g, 0, a.ships[0].id, a.ships[2].id, 2);
  assert.equal(a.ships[2].p, 3);
});

test('surprise cards: loot, hijack, switch', () => {
  const { g, env } = table({ hands: { 0: ['L', 'H', 'S'], 1: ['R', 'M'] } });
  const [a, b] = g.players;
  b.kings = 0;
  declare(g, env, 0, { kind: 'loot', target: 1 });
  pass(g, 1);
  resolvePending(g, env);
  assert.equal(b.hand.length, 0);
  assert.equal(a.hand.filter((c) => c === 'R' || c === 'M').length, 2);
  const prize = b.ships[0];
  prize.prog.a = ['F'];
  declare(g, env, 0, { kind: 'hijack', target: prize.id });
  pass(g, 1);
  resolvePending(g, env);
  assert.equal(a.ships.length, 3);
  assert.equal(b.ships.length, 1);
  assert.equal(b.ships[0].p, 20, 'the crew of the hijacked ship fled to the other ship');
  assert.equal(prize.p, 1);
  assert.deepEqual(prize.prog.a, ['F'], 'the cards come along');
  const handBefore = a.hand.length;
  declare(g, env, 0, { kind: 'switch' });
  pass(g, 1);
  resolvePending(g, env);
  assert.equal(a.hand.length, handBefore - 1 + 3, '3 ships: draw 3 (Switch itself left the hand)');
});

test('Potato King: the last to salute pays 2 potatoes', () => {
  const { g, env } = table({ bots: ['hard'] });
  g.deck.unshift('K', 'R');
  endTurn(g, env, 0);
  // Bob drew the king: Ann must salute, the bot salutes in 0.5-2.5 s.
  assert.equal(g.players[1].kings, 1);
  assert.ok(g.salute);
  env.now += 10_000;
  salute(g, env, 0);
  assert.equal(g.salute, null);
  const ann = g.players[0].ships.reduce((s, x) => s + x.p, 0);
  assert.equal(ann, 18, 'Ann saluted after the bot and paid 2');
  assert.equal(g.players[1].ships.reduce((s, x) => s + x.p, 0), 22);
});

test('sinking the last ship eliminates; the hand and kings go to the attacker; last ship wins', () => {
  const { g, env } = table({ hands: { 1: ['R', 'M'] } });
  const [a, b] = g.players;
  b.kings = 2;
  b.ships.splice(1, 1);
  b.ships[0].p = 3;
  a.ships[0].prog.a = ['F'];
  declare(g, env, 0, { kind: 'attack', ship: a.ships[0].id, target: b.ships[0].id });
  pass(g, 1);
  resolvePending(g, env);
  assert.equal(b.out, true);
  assert.equal(a.kings, 2);
  assert.ok(a.hand.includes('M'));
  assert.equal(g.phase, 'over');
  assert.equal(g.winner, 0);
  assert.equal(g.how, 'last');
});

test('bots finish their games; harder bots win more', () => {
  const wins = { easy: 0, medium: 0, hard: 0 };
  for (let seed = 1; seed <= 60; seed++) {
    const env = { rng: rng(seed), now: 0 };
    const g = createGame({ id: 'x', guild: 'G', channel: 'C', host: 'h', cfg: { promo: seed % 2 === 0 } });
    for (const level of ['easy', 'medium', 'hard']) addPlayer(g, { id: '', name: 'Bot', bot: level });
    startGame(g, env);
    for (let k = 0; k < 300 && g.phase === 'play'; k++) {
      env.now += 1000;
      settle(g, env);
    }
    assert.equal(g.phase, 'over', `game ${seed} ended`);
    assert.ok(JSON.stringify(g).length < 16_000, 'fits in one storage value');
    wins[g.players[g.winner].bot]++;
  }
  assert.ok(wins.hard > wins.easy && wins.medium > wins.easy, JSON.stringify(wins));
});

test('errors are GameErrors with a key', () => {
  const { g } = table();
  assert.throws(() => endTurn(g, { rng: Math.random, now: 0 }, 1), (e) => e instanceof GameError && e.key === 'err.not_your_turn');
});
