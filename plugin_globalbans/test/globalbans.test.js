import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runEvent, runTask } from '#sdk-testing';
import plugin from '../index.js';
import { PREFIX, work } from '../services/bans.js';

const A = '900000000000000001';
const B = '900000000000000002';
const C = '900000000000000003';
const LOG = '900000000000000009';
const BAD = '900000000000000077';
const STAFF = '900000000000000088';

const ctxWith = (config = {}) =>
  createTestContext({
    id: 'plugin_globalbans',
    permissions: ['storage', 'scheduler', 'discord.events.members', 'discord.guilds.read', 'discord.members.ban', 'discord.messages.send', 'discord.interactions.reply'],
    config: { log_channel: { id: LOG, guild: A }, ...config },
    guilds: [{ id: A, name: 'Alpha' }, { id: B, name: 'Beta' }, { id: C, name: 'Gamma' }],
    discord: { 'guild.list': () => [{ id: A, name: 'Alpha' }, { id: B, name: 'Beta' }, { id: C, name: 'Gamma' }] },
  });
const bans = (ctx) => ctx.actions.filter((a) => a.call === 'member.ban').map((a) => [a.args[0], a.args[1]]);
const unbans = (ctx) => ctx.actions.filter((a) => a.call === 'member.unban').map((a) => [a.args[0], a.args[1]]);

test('a ban on one server bans on all others, with a report', async () => {
  const ctx = ctxWith();
  await runEvent(plugin, 'guildBanAdd', ctx, { 'server.id': A, 'server.name': 'Alpha', 'user.id': BAD, reason: 'spam' });
  assert.deepEqual(bans(ctx), [[B, BAD], [C, BAD]]);
  assert.ok(ctx.actions.find((a) => a.call === 'member.ban').args[2].startsWith(PREFIX));
  assert.equal(ctx.sent.at(-1).channelId, LOG);
  assert.match(ctx.sent.at(-1).message.embeds[0].description, /banned on \*\*2\*\* servers/);
});

test('own bans, trusted users, other sources and excluded servers are left alone', async () => {
  const ctx = ctxWith({ trusted: [STAFF], sources: [A], exclude: [C] });
  await runEvent(plugin, 'guildBanAdd', ctx, { 'server.id': B, 'user.id': BAD, reason: `${PREFIX} spam` });
  await runEvent(plugin, 'guildBanAdd', ctx, { 'server.id': A, 'user.id': STAFF, reason: 'oops' });
  await runEvent(plugin, 'guildBanAdd', ctx, { 'server.id': B, 'user.id': BAD, reason: 'not a source' });
  assert.deepEqual(bans(ctx), []);
  await runEvent(plugin, 'guildBanAdd', ctx, { 'server.id': A, 'user.id': BAD, reason: 'spam' });
  assert.deepEqual(bans(ctx), [[B, BAD]]);
});

test('unbans follow only with sync_unban, only for global bans, without echo', async () => {
  const off = ctxWith();
  await runEvent(plugin, 'guildBanAdd', off, { 'server.id': A, 'user.id': BAD, reason: 'x' });
  await runEvent(plugin, 'guildBanRemove', off, { 'server.id': A, 'user.id': BAD });
  assert.deepEqual(unbans(off), []);
  const on = ctxWith({ sync_unban: true });
  await runEvent(plugin, 'guildBanRemove', on, { 'server.id': A, 'user.id': BAD });
  assert.deepEqual(unbans(on), [], 'never banned globally');
  await runEvent(plugin, 'guildBanAdd', on, { 'server.id': A, 'user.id': BAD, reason: 'x' });
  await runEvent(plugin, 'guildBanRemove', on, { 'server.id': A, 'user.id': BAD });
  assert.deepEqual(unbans(on), [[B, BAD], [C, BAD]]);
  await runEvent(plugin, 'guildBanRemove', on, { 'server.id': B, 'user.id': BAD });
  assert.equal(unbans(on).length, 2, 'the unban made by the plugin is not spread again');
});

test('/globalban bans everywhere, also here; big queues go on in the task', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'ban', ctx, { config: { user: `<@${BAD}>`, reason: 'raid' }, vars: { 'server.id': A, 'user.id': STAFF, 'user.name': 'mod' } });
  assert.equal(out.port, 'next');
  assert.deepEqual(bans(ctx).map((b) => b[0]), [A, B, C]);
  const self = await runBlock(plugin, 'ban', ctx, { config: { user: STAFF }, vars: { 'user.id': STAFF } });
  assert.equal(self.port, 'failed');
  // A run stops after 7 s; the task "work" finishes the rest.
  const slow = ctxWith();
  let t = 0;
  const clock = () => (t += 4000);
  await slow.storage.set('q', JSON.stringify([{ op: 'ban', user: BAD, reason: 'x', from: A, guilds: [B, C], ok: 0, failed: [] }]));
  await work(slow, clock);
  assert.deepEqual(bans(slow), [[B, BAD]]);
  await runTask(plugin, 'work', slow);
  assert.deepEqual(bans(slow), [[B, BAD], [C, BAD]]);
});
