import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runTask } from '#sdk-testing';
import plugin from '../index.js';

const GUILD = '100000000000000001';
const CHANNEL = '300000000000000001';
const ANN = '200000000000000001';
const BOB = '200000000000000002';
const permissions = ['storage', 'scheduler', 'discord.messages.send', 'discord.messages.edit', 'discord.interactions.reply'];
const ctxWith = (config = {}) => createTestContext({ id: 'plugin_potatopirates', permissions, config: { language: 'en', ...config } });
const vars = (user = ANN) => ({ 'server.id': GUILD, 'channel.id': CHANNEL, 'user.id': user, 'user.name': user === ANN ? 'Ann' : 'Bob' });
const press = (ctx, key, data, user, values) => runComponent(plugin, key, ctx, { data, values, handle: `h${Math.random()}`, user: { id: user, name: 'u', displayName: user === ANN ? 'Ann' : 'Bob' }, guildId: GUILD, channelId: CHANNEL });
const game = (ctx, id) => JSON.parse(ctx.store.get(`g:${id}`));
const last = (ctx) => ctx.answers.at(-1);

/** Bots may open a Deny window against a human: let every attack run until a human is on the turn. */
async function letBotsPlay(ctx, id) {
  for (let k = 0; k < 50; k++) {
    const g = ctx.store.has(`g:${id}`) ? game(ctx, id) : null;
    if (!g || g.phase !== 'play' || !g.pending) return g;
    const human = g.players.find((p, i) => !p.bot && !p.out && i !== g.pending.last && !g.pending.passed.includes(i));
    await press(ctx, 'pass', id, human.id);
  }
  throw new Error('bots never stopped');
}

test('lobby: join, bots, start; one game per channel', async () => {
  const ctx = ctxWith();
  const id = (await runBlock(plugin, 'start', ctx, { vars: vars(), interaction: 'c1', config: {} })).results[''];
  assert.equal(ctx.sent.length, 1, 'the table is posted');
  assert.match(ctx.sent[0].message.embeds[0].description, /1\/6/);
  const again = await runBlock(plugin, 'start', ctx, { vars: vars(BOB), interaction: 'c2', config: {} });
  assert.equal(again.port, 'failed');
  await press(ctx, 'join', id, BOB);
  await press(ctx, 'addbot', `${id}:hard`, BOB);
  assert.match(last(ctx).message, /Only the host/);
  await press(ctx, 'addbot', `${id}:hard`, ANN);
  assert.equal(game(ctx, id).players.length, 3);
  await press(ctx, 'start', id, ANN);
  const g = await letBotsPlay(ctx, id);
  assert.equal(g.phase, 'play');
  assert.ok(!g.players[g.turn].bot, 'bots already played until a human is on the turn');
  assert.equal(last(ctx).kind, 'update');
});

test('solo against bots: hand panel, build, attack, end turn, give up', async () => {
  const ctx = ctxWith({ crystals: true });
  const id = (await runBlock(plugin, 'start', ctx, { vars: vars(), interaction: 'c1', config: { bots: '2', difficulty: 'easy' } })).results[''];
  assert.equal(last(ctx).ephemeral, true, 'the hand opens at once');
  assert.match(last(ctx).message.embeds[0].title, /Your hand/);
  let g = await letBotsPlay(ctx, id);
  assert.equal(g.players[g.turn].id, ANN);
  // Give Ann a known hand and build For 2 › Roast on ship 1.
  g.players[0].hand = ['F2', 'R', 'M'];
  g.players[0].crystals = 10;
  ctx.store.set(`g:${id}`, JSON.stringify(g));
  const ship = g.players[0].ships[0].id;
  await press(ctx, 'build', id, ANN, ['F2']);
  assert.match(last(ctx).message.embeds[0].description, /Where does/);
  await press(ctx, 'place', `${id}:F2:${ship}:a`, ANN);
  await press(ctx, 'place', `${id}:R:${ship}:a`, ANN);
  await press(ctx, 'place', `${id}:F2:${ship}:a`, ANN);
  assert.match(last(ctx).message.embeds[0].description, /do not have that card/);
  g = game(ctx, id);
  assert.deepEqual(g.players[0].ships[0].prog.a, ['F2', 'R']);
  assert.match(last(ctx).message.embeds[0].fields[1].value, /for i in range\(2\):\n {4}roast\(target\)/);
  await press(ctx, 'attack', id, ANN, [String(ship)]);
  assert.match(last(ctx).message.embeds[0].description, /changed this turn/);
  await press(ctx, 'end', id, ANN);
  g = await letBotsPlay(ctx, id);
  if (!g || g.phase !== 'play') return; // the bots sank Ann (rare)
  assert.equal(g.players[g.turn].id, ANN, 'both bots played, Ann again');
  assert.ok(ctx.actions.some((a) => a.call === 'message.edit'), 'the table follows');
  // Attack now (if the ship survived and was not hijacked).
  const mine = g.players[0].ships.find((s) => s.id === ship);
  if (mine && mine.prog.a.length) {
    const target = g.players[1].ships[0] ?? g.players[2].ships[0];
    await press(ctx, 'fire', `${id}:${ship}`, ANN, [String(target.id)]);
    g = game(ctx, id) ?? g;
  }
  await press(ctx, 'view', `${id}:surrender`, ANN);
  await press(ctx, 'surr', id, ANN);
  assert.equal(ctx.store.get(`g:${id}`), undefined, 'game over: stored game removed');
});

test('Deny window between two humans, then the timer task', async () => {
  const ctx = ctxWith({ deny_seconds: 5 });
  const id = (await runBlock(plugin, 'start', ctx, { vars: vars(), interaction: 'c1', config: {} })).results[''];
  await press(ctx, 'join', id, BOB);
  await press(ctx, 'start', id, ANN);
  let g = game(ctx, id);
  const me = g.turn;
  const other = 1 - me;
  const user = g.players[me].id;
  const foe = g.players[other].id;
  g.players[me].ships[0].prog.a = ['F'];
  g.players[other].hand = ['D'];
  g.salute = null;
  ctx.store.set(`g:${id}`, JSON.stringify(g));
  await press(ctx, 'fire', `${id}:${g.players[me].ships[0].id}`, user, [String(g.players[other].ships[0].id)]);
  g = game(ctx, id);
  assert.ok(g.pending, 'the window is open');
  await press(ctx, 'deny', id, foe);
  assert.equal(last(ctx).kind, 'update');
  await press(ctx, 'pass', id, user);
  g = game(ctx, id);
  assert.equal(g.pending, null);
  assert.equal(g.players[other].ships[0].p, 10, 'denied');
  // Turn time: the task ends the turn of an absent player.
  g.turnAt = 0;
  ctx.store.set(`g:${id}`, JSON.stringify(g));
  await runTask(plugin, 'tick', ctx);
  assert.equal(game(ctx, id).turn, other);
});

test('rules and an old lobby closes', async () => {
  const ctx = ctxWith({ language: 'de' });
  const id = (await runBlock(plugin, 'start', ctx, { vars: vars(), interaction: 'c1', config: {} })).results[''];
  await press(ctx, 'rules', id, BOB);
  assert.match(last(ctx).message.embeds[0].description, /Potato Kings/);
  const g = game(ctx, id);
  g.at = 0;
  ctx.store.set(`g:${id}`, JSON.stringify(g));
  await runTask(plugin, 'tick', ctx);
  assert.equal(ctx.store.get(`g:${id}`), undefined);
  assert.equal(ctx.store.get(`c:${CHANNEL}`), undefined);
});
