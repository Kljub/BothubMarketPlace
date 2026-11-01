import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runTask } from '#sdk-testing';
import plugin from '../index.js';
import { drawPairs, rerollPairs } from '../services/wichteln.js';

const GUILD = '100000000000000001';
const HOST = '200000000000000001';
const users = ['200000000000000002', '200000000000000003', '200000000000000004'];
const permissions = ['storage', 'scheduler', 'discord.messages.send', 'discord.interactions.reply', 'discord.modals'];
const ctxWith = (options = {}) => createTestContext({ id: 'plugin_wichteln', permissions, config: { language: 'de' }, ...options });
const vars = { 'server.id': GUILD, 'user.id': HOST, user: 'Host' };
const click = (ctx, key, data, user, extra = {}) => runComponent(plugin, key, ctx, { data, handle: `h${Math.random()}`, user: { id: user, name: user, displayName: `Name ${user.slice(-1)}` }, guildId: GUILD, ...extra });
const modal = (ctx, data, user, wish) => runComponent(plugin, 'wish', ctx, { data, handle: `m${Math.random()}`, user: { id: user, name: user, displayName: user }, guildId: GUILD, fields: { wish } }, 'modal');
const last = (ctx) => ctx.answers.at(-1);

test('draw: nobody draws themselves, everybody gets exactly one present', () => {
  for (let n = 3; n < 30; n++) {
    const members = Array.from({ length: n }, (_, i) => `m${i}`);
    const pairs = drawPairs(members, (min, max) => min + Math.floor(Math.random() * (max - min + 1)));
    assert.deepEqual(Object.keys(pairs).sort(), [...members].sort());
    assert.deepEqual(Object.values(pairs).sort(), [...members].sort(), 'each member receives once');
    for (const [giver, receiver] of Object.entries(pairs)) assert.notEqual(giver, receiver);
  }
});

async function round(ctx) {
  const out = await runBlock(plugin, 'start', ctx, { vars, interaction: 'cmd', config: { title: 'Weihnachten', budget: '20 €', date: '24.12.' } });
  assert.equal(out.port, 'replied');
  return out.results[''];
}

test('round: join, wish list, draw by the host, a DM for everybody', async () => {
  const ctx = ctxWith();
  const id = await round(ctx);
  const start = last(ctx).message;
  assert.match(start.embeds[0].title, /Wichteln: Weihnachten/);
  assert.equal(start.components[1][0].disabled, true, 'drawing needs 3 members');

  await click(ctx, 'join', id, users[0]);
  assert.equal(last(ctx).kind, 'update');
  await click(ctx, 'join', id, users[0]);
  assert.match(last(ctx).message, /schon dabei/);
  await click(ctx, 'join', id, users[1]);
  await click(ctx, 'join', id, users[2]);
  await click(ctx, 'leave', id, users[2]);
  assert.match(last(ctx).message.embeds[0].fields.at(-1).name, /Teilnehmer \(3\)/);
  await click(ctx, 'join', id, users[2]);
  assert.equal(last(ctx).message.components[1][0].disabled, false);

  await click(ctx, 'wish', id, users[0]);
  assert.equal(last(ctx).kind, 'showModal');
  await modal(ctx, id, users[0], 'Bücher und Socken');
  assert.match(last(ctx).message, /gespeichert/);

  await click(ctx, 'draw', id, users[0]);
  assert.match(last(ctx).message, /Nur <@200000000000000001>/, 'only the host draws');
  await click(ctx, 'leave', id, HOST);
  assert.match(last(ctx).message, /nicht austreten/);

  await click(ctx, 'draw', id, HOST);
  const drawn = ctx.answers.filter((a) => a.kind === 'update').at(-1).message;
  assert.match(drawn.embeds[0].description, /Namen sind gezogen/);
  assert.equal(drawn.components[0][0].key, 'reveal');

  const dms = ctx.sent.filter((m) => m.channelId.startsWith('dm:'));
  assert.equal(dms.length, 4);
  const receivers = new Set();
  for (const dm of dms) {
    const giver = dm.channelId.slice(3);
    const text = dm.message.embeds[0].description;
    const receiver = /<@(\d+)>/.exec(text)[1];
    assert.notEqual(receiver, giver);
    receivers.add(receiver);
    assert.equal(dm.message.embeds[0].title, '🎁 Wichteln: Weihnachten');
    if (receiver === users[0]) assert.equal(dm.message.embeds[0].fields.at(-1).value, 'Bücher und Socken', 'the wish list goes to the giver');
  }
  assert.equal(receivers.size, 4);

  // After the draw: nothing changes any more; the own name privately.
  await click(ctx, 'join', id, '200000000000000009');
  assert.match(last(ctx).message, /schon gezogen/);
  await click(ctx, 'reveal', id, users[1]);
  assert.equal(last(ctx).ephemeral, true);
  assert.match(last(ctx).message, /Du beschenkst/);
  await click(ctx, 'reveal', id, '200000000000000009');
  assert.match(last(ctx).message, /machst nicht mit/);
});

test('closed DMs: the host is told, the member sees the name with the button', async () => {
  const ctx = ctxWith({ discord: { 'message.dm': (user) => {
    if (user === users[1]) throw Object.assign(new Error('sdk.discord.dm_closed'), { code: 'sdk.discord.dm_closed' });
    return '1';
  } } });
  const id = await round(ctx);
  for (const u of users) await click(ctx, 'join', id, u);
  await click(ctx, 'draw', id, HOST);
  const note = ctx.answers.find((a) => a.kind === 'followUp');
  assert.ok(note?.ephemeral);
  assert.match(note.message, /<@200000000000000003>/);
  await click(ctx, 'reveal', id, users[1]);
  assert.match(last(ctx).message, /Du beschenkst/);
});

test('cancel by the host ends the round; the task cleans old rounds up', async () => {
  const ctx = ctxWith({ config: { language: 'en' } });
  const id = await round(ctx);
  await click(ctx, 'cancel', id, users[0]);
  assert.match(last(ctx).message, /Only <@/);
  await click(ctx, 'cancel', id, HOST);
  assert.match(last(ctx).message.embeds[0].description, /cancelled/);
  assert.deepEqual(last(ctx).message.components, []);
  await click(ctx, 'join', id, users[0]);
  assert.match(last(ctx).message, /no longer exists/);

  const old = await round(ctx);
  const e = JSON.parse(await ctx.storage.get(`event:${old}`));
  e.at = Date.now() - 100 * 24 * 60 * 60 * 1000;
  await ctx.storage.set(`event:${old}`, JSON.stringify(e));
  await runTask(plugin, 'cleanup', ctx);
  assert.equal(await ctx.storage.get(`event:${old}`), null);
});

test('only as a command on a server', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'start', ctx, { vars: {}, config: {} });
  assert.equal(out.port, 'failed');
});

const addressModal = (ctx, data, user, address) => runComponent(plugin, 'address', ctx, { data, handle: `a${Math.random()}`, user: { id: user, name: user, displayName: user }, guildId: GUILD, fields: { address } }, 'modal');

test('address: only the giver gets it; a change after the draw goes to the giver by DM', async () => {
  const ctx = ctxWith();
  const id = await round(ctx);
  for (const u of users) await click(ctx, 'join', id, u);

  await click(ctx, 'address', id, '200000000000000009');
  assert.match(last(ctx).message, /machst nicht mit/);
  await click(ctx, 'address', id, users[0]);
  assert.equal(last(ctx).kind, 'showModal');
  await addressModal(ctx, id, users[0], 'Musterstraße 1, 12345 Berlin');
  assert.match(last(ctx).message, /Adresse gespeichert/);

  await click(ctx, 'draw', id, HOST);
  const drawn = ctx.answers.filter((a) => a.kind === 'update').at(-1).message;
  assert.deepEqual(drawn.components[0].map((b) => b.key), ['reveal', 'address', 'wish', 'reroll']);
  const first = ctx.sent.filter((m) => m.channelId.startsWith('dm:'));
  const toGiver = first.find((m) => m.message.embeds[0].description.includes(`<@${users[0]}>`));
  assert.equal(toGiver.message.embeds[0].fields.at(-1).value, 'Musterstraße 1, 12345 Berlin');
  const others = first.filter((m) => m !== toGiver);
  for (const m of others) assert.ok(!JSON.stringify(m.message).includes('Musterstraße'), 'nobody else sees the address');

  // Change after the draw: one DM, only to the giver, marked as a change.
  const before = ctx.sent.length;
  await addressModal(ctx, id, users[0], 'Neue Straße 2, 54321 Hamburg');
  assert.match(last(ctx).message, /Adresse geändert/);
  const change = ctx.sent.slice(before);
  assert.equal(change.length, 1);
  assert.equal(change[0].channelId, toGiver.channelId);
  assert.match(change[0].message.embeds[0].description, /geändert/);
  assert.equal(change[0].message.embeds[0].fields.at(-1).value, 'Neue Straße 2, 54321 Hamburg');

  // The same text again sends nothing; reveal shows the new address.
  await addressModal(ctx, id, users[0], 'Neue Straße 2, 54321 Hamburg');
  assert.equal(ctx.sent.length, before + 1);
  await click(ctx, 'reveal', id, toGiver.channelId.slice(3));
  assert.match(last(ctx).message, /📮 Neue Straße 2/);

  // The wish list can change after the draw too.
  await modal(ctx, id, users[0], 'Tee');
  assert.match(last(ctx).message, /Wunschzettel geändert/);
  assert.equal(ctx.sent.length, before + 2);
  const e = JSON.parse(await ctx.storage.get(`event:${id}`));
  assert.deepEqual(e.updated, []);
  assert.deepEqual(e.pending, []);
});

test('new draw: nobody keeps their receiver, also when chance does not help', () => {
  const members = ['a', 'b', 'c', 'd', 'e'];
  const anyRandom = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
  const noChance = (min) => min;
  for (const random of [anyRandom, noChance]) {
    for (let n = 3; n <= members.length; n++) {
      const group = members.slice(0, n);
      const old = drawPairs(group, noChance);
      const pairs = rerollPairs(group, old, random);
      assert.deepEqual(Object.keys(pairs).sort(), [...group].sort());
      assert.deepEqual(Object.values(pairs).sort(), [...group].sort());
      for (const giver of group) {
        assert.notEqual(pairs[giver], giver);
        assert.notEqual(pairs[giver], old[giver]);
      }
    }
  }
});

async function drawnRound(ctx) {
  const id = await round(ctx);
  for (const u of users) await click(ctx, 'join', id, u);
  await click(ctx, 'draw', id, HOST);
  return id;
}

const backdate = async (ctx, id, change) => {
  const e = JSON.parse(await ctx.storage.get(`event:${id}`));
  change(e);
  await ctx.storage.set(`event:${id}`, JSON.stringify(e));
};

test('draw again: host only, confirmed, once a minute, a new DM for everybody', async () => {
  const ctx = ctxWith();
  const id = await drawnRound(ctx);
  const before = JSON.parse(await ctx.storage.get(`event:${id}`));

  await click(ctx, 'reroll', id, users[0]);
  assert.match(last(ctx).message, /Nur <@/);
  await click(ctx, 'reroll_yes', id, users[0]);
  assert.match(last(ctx).message, /Nur <@/);

  await click(ctx, 'reroll', id, HOST);
  assert.equal(last(ctx).ephemeral, true);
  assert.equal(last(ctx).message.components[0][0].key, 'reroll_yes');
  const sentBefore = ctx.sent.length;

  await click(ctx, 'reroll_yes', id, HOST);
  assert.match(last(ctx).message.content, /gerade erst/);
  assert.equal(ctx.sent.length, sentBefore, 'too soon: no DM');

  await backdate(ctx, id, (e) => { e.drawnAt = Date.now() - 61_000; });
  await click(ctx, 'reroll_yes', id, HOST);
  assert.match(last(ctx).message.content, /Neu ausgelost/);
  assert.deepEqual(last(ctx).message.components, []);

  const dms = ctx.sent.slice(sentBefore);
  assert.equal(dms.length, 4);
  const after = JSON.parse(await ctx.storage.get(`event:${id}`));
  for (const dm of dms) {
    const giver = dm.channelId.slice(3);
    assert.match(dm.message.embeds[0].description, /neu ausgelost/);
    assert.ok(dm.message.embeds[0].description.includes(`<@${after.pairs[giver]}>`));
    assert.notEqual(after.pairs[giver], before.pairs[giver]);
  }
  assert.deepEqual(after.rerolled, []);
  assert.deepEqual(after.pending, []);

  // A later change is a change again, not a new draw.
  await addressModal(ctx, id, users[0], 'Weg 3');
  const change = ctx.sent.at(-1);
  assert.match(change.message.embeds[0].description, /geändert/);
  assert.equal(change.channelId, `dm:${Object.keys(after.pairs).find((g) => after.pairs[g] === users[0])}`);
});

test('a round drawn by an older version gets the new buttons with the next reveal', async () => {
  const ctx = ctxWith();
  const id = await drawnRound(ctx);
  await backdate(ctx, id, (e) => { delete e.ui; delete e.drawnAt; });

  await click(ctx, 'reveal', id, users[1]);
  const answers = ctx.answers.slice(-2);
  assert.equal(answers[0].kind, 'update');
  assert.deepEqual(answers[0].message.components[0].map((b) => b.key), ['reveal', 'address', 'wish', 'reroll']);
  assert.equal(answers[1].kind, 'followUp');
  assert.equal(answers[1].ephemeral, true);
  assert.match(answers[1].message, /Du beschenkst/);

  await click(ctx, 'reveal', id, users[1]);
  assert.notEqual(last(ctx).kind, 'followUp', 'only once');
  assert.match(last(ctx).message, /Du beschenkst/);
});
