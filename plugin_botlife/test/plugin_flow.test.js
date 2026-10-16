import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent } from '#sdk-testing';
import plugin from '../index.js';
import manifest from '../bothub.json' with { type: 'json' };

const GUILD = '200000000000000001';
const ANN = '100000000000000001';
const BEN = '100000000000000002';
const OBIT = '900000000000000009';
const vars = (user = ANN) => ({ 'server.id': GUILD, 'user.id': user, 'channel.id': '300000000000000001' });
const ctxWith = (config = {}, storage = {}) => createTestContext({ id: 'plugin_botlife', permissions: manifest.sdk.permissions, config: { cooldown: 0, ...config }, storage });
const click = (ctx, data, user = ANN) => runComponent(plugin, 'bl', ctx, { data, user: { id: user, name: 'x', displayName: 'X' } });
const pick = (ctx, menu, value, user = ANN) => runComponent(plugin, 'bls', ctx, { data: menu, values: [value], user: { id: user, name: 'x', displayName: 'X' } });
const life = (ctx, user = ANN) => JSON.parse(ctx.store.get(`L:${GUILD}:${user}`));
const save = (ctx, L, user = ANN) => ctx.store.set(`L:${GUILD}:${user}`, JSON.stringify(L));
const buttons = (msg) => msg.components.flat().filter((c) => c.key === 'bl').map((c) => c.data);

test('/botlife: a new life in a private panel; again: the same life', async () => {
  const ctx = ctxWith({ language: 'de', currency: '€' });
  const out = await runBlock(plugin, 'start', ctx, { config: { gender: 'female', name: 'Ann' }, vars: vars(), interaction: 'cmd-1' });
  assert.equal(out.port, 'replied');
  assert.match(out.results[''], /^Ann /);
  const a = ctx.answers.at(-1);
  assert.equal(a.options?.ephemeral ?? a.ephemeral, true);
  assert.match(a.message.embeds[0].title, /Ann .* · 0/);
  assert.match(a.message.embeds[0].description, /Gesundheit ▰/);
  assert.ok(buttons(a.message).includes('age:'));
  assert.equal(life(ctx).cur, '€');
  await runBlock(plugin, 'start', ctx, { config: { name: 'Other' }, vars: vars(), interaction: 'cmd-2' });
  assert.match(ctx.answers.at(-1).message.embeds[0].title, /Ann/, 'the existing life opens');
});

test('panel: age up, views, an activity, an error stays on the view', async () => {
  const ctx = ctxWith();
  await runBlock(plugin, 'start', ctx, { vars: vars(), interaction: 'c' });
  const L = life(ctx);
  Object.assign(L, { age: 20, money: 100, pending: null, school: null, degrees: ['high'] });
  save(ctx, L);
  await click(ctx, 'age:');
  const up = ctx.answers.at(-1);
  assert.equal(up.kind, 'update');
  assert.ok(life(ctx).age === 21 || life(ctx).dead, 'one year older');
  if (life(ctx).pending) {
    const choice = up.message.components.flat()[0];
    if (choice.type === 'select') await pick(ctx, 'choose', choice.options[0].value);
    else await click(ctx, choice.data);
  }
  if (life(ctx).dead) return;
  await click(ctx, 'view:activities');
  assert.equal(ctx.answers.at(-1).message.components[0][0].data, 'activity');
  await pick(ctx, 'activity', 'gym');
  assert.match(ctx.answers.at(-1).message.embeds[0].fields.at(-1).value, /Gym: health \+\d/);
  await pick(ctx, 'activity', 'vacation');
  const err = ctx.answers.at(-1);
  assert.match(err.message.content, /❌ You need \$3,000/);
  assert.equal(err.message.components[0][0].data, 'activity', 'still on the activities view');
  await pick(ctx, 'activity', 'casino');
  assert.ok(buttons(ctx.answers.at(-1).message).includes('act:casino|100'));
  await click(ctx, 'act:casino|100');
  assert.equal(life(ctx).money !== 100, true);
});

test('cooldown between years', async () => {
  const ctx = ctxWith({ cooldown: 30 });
  await runBlock(plugin, 'start', ctx, { vars: vars(), interaction: 'c' });
  const L = life(ctx);
  L.pending = null;
  save(ctx, L);
  await click(ctx, 'age:');
  const L2 = life(ctx);
  L2.pending = null;
  save(ctx, L2);
  await click(ctx, 'age:');
  assert.match(ctx.answers.at(-1).message.content, /age up again in \d+ s/);
  assert.equal(life(ctx).age, 1);
});

test('people: pick a person, spend time; jobs: apply from the occupation view', async () => {
  const ctx = ctxWith();
  await runBlock(plugin, 'start', ctx, { vars: vars(), interaction: 'c' });
  const L = life(ctx);
  Object.assign(L, { age: 25, sm: 100, pending: null, school: null, degrees: ['high', 'uni:cs'] });
  save(ctx, L);
  await click(ctx, 'view:people');
  assert.match(ctx.answers.at(-1).message.content, /mother/);
  await pick(ctx, 'person', '0');
  assert.ok(buttons(ctx.answers.at(-1).message).includes('rel:0|time'));
  await click(ctx, 'rel:0|time');
  assert.match(ctx.answers.at(-1).message.embeds[0].fields.at(-1).value, /You spent time with/);
  await click(ctx, 'view:job');
  const offers = ctx.answers.at(-1).message.components.flat().find((c) => c.data === 'apply');
  assert.ok(offers.options.some((o) => o.value === 'software'));
});

test('death: obituary in the channel, continue as a child or start anew', async () => {
  const ctx = ctxWith({ obituary_channel: { id: OBIT, guild: GUILD } });
  await runBlock(plugin, 'start', ctx, { vars: vars(), interaction: 'c' });
  const L = life(ctx);
  Object.assign(L, { age: 121, h: 0, pending: null, money: 1_000 });
  L.rel.push({ n: 'Kid Doe', g: 'm', a: 40, k: 'child', c: 80 });
  save(ctx, L);
  await click(ctx, 'age:');
  assert.ok(life(ctx).dead);
  assert.equal(ctx.sent.at(-1).channelId, OBIT);
  assert.match(ctx.sent.at(-1).message.embeds[0].description, /died at 122/);
  const heirSelect = ctx.answers.at(-1).message.components.flat().find((c) => c.data === 'heir');
  await pick(ctx, 'heir', heirSelect.options[0].value);
  const next = life(ctx);
  assert.equal(`${next.first} ${next.last}`, 'Kid Doe');
  assert.equal(next.gen, 2);
  await click(ctx, 'view:confirm_new');
  await click(ctx, 'new:go');
  assert.equal(life(ctx).gen, 1);
  assert.equal(life(ctx).age, 0);
});

test('profile and ranking', async () => {
  const ctx = ctxWith();
  await runBlock(plugin, 'start', ctx, { vars: vars(ANN), interaction: 'a' });
  await runBlock(plugin, 'start', ctx, { vars: vars(BEN), interaction: 'b' });
  const B = life(ctx, BEN);
  B.money = 1_000_000;
  save(ctx, B, BEN);
  const p = await runBlock(plugin, 'profile', ctx, { config: { member: `<@${BEN}>` }, vars: vars(ANN), interaction: 'p' });
  assert.equal(p.port, 'replied');
  assert.match(ctx.answers.at(-1).message.content, new RegExp(BEN));
  const top = await runBlock(plugin, 'top', ctx, { config: { by: 'money' }, vars: vars(), interaction: 't' });
  assert.equal(top.results['.count'], '2');
  assert.match(top.results[''], new RegExp(`^🥇 <@${BEN}>`));
  const none = await runBlock(plugin, 'profile', ctx, { config: { member: '100000000000000099' }, vars: vars() });
  assert.equal(none.port, 'not_found');
});

test('crime can be switched off', async () => {
  const ctx = ctxWith({ crime: false });
  await runBlock(plugin, 'start', ctx, { vars: vars(), interaction: 'c' });
  const L = life(ctx);
  Object.assign(L, { age: 20, pending: null });
  save(ctx, L);
  await click(ctx, 'view:main');
  assert.ok(!buttons(ctx.answers.at(-1).message).includes('view:crime'));
  await pick(ctx, 'crime', 'shoplift');
  assert.match(ctx.answers.at(-1).message.content, /That does not work/);
});
