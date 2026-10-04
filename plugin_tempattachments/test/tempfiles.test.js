import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runModal, runTask } from '#sdk-testing';
import plugin from '../index.js';
import { parseDate } from '../services/files.js';

const GUILD = '100000000000000001';
const CHANNEL = '300000000000000001';
const ADMIN = '200000000000000001';
const BOB = '200000000000000002';
const ROLE = '400000000000000001';
const URL = 'https://cdn.discordapp.com/attachments/1/2/rules.pdf';
const permissions = ['storage', 'storage.files', 'scheduler', 'discord.messages.send', 'discord.messages.edit', 'discord.interactions.reply', 'discord.modals', 'discord.members.read'];
const vars = { 'server.id': GUILD, 'channel.id': CHANNEL, 'user.id': ADMIN };
const ctxWith = (extra = {}) => createTestContext({
  id: 'plugin_tempattachments', permissions,
  attachments: { [URL]: Buffer.from('%PDF-1.7 rules').toString('base64') },
  discord: { 'member.get': (g, u) => ({ id: u, roles: u === BOB ? [ROLE] : [] }) },
  ...extra,
});
const click = (ctx, data, user = BOB, handle = `h-${Math.random()}`) => runComponent(plugin, 'access', ctx, { data, handle, user: { id: user, name: 'u', displayName: 'u' }, guildId: GUILD, channelId: CHANNEL });
const lastAnswer = (ctx) => ctx.answers.at(-1);

test('parseDate: UTC dates, empty, broken', () => {
  assert.equal(parseDate('2026-12-24 18:00'), Date.UTC(2026, 11, 24, 18, 0));
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('soon'), undefined);
});

test('create: stores the attachment, posts the board, the button sends it privately and counts uses', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'create', ctx, { vars, interaction: 'cmd-1', config: { name: 'Rules', attachment: URL, text: 'Read this', max: '2' } });
  assert.equal(out.port, 'replied');
  assert.equal(lastAnswer(ctx).ephemeral, true);
  assert.equal(ctx.sent.length, 1);
  const board = ctx.sent[0].message;
  assert.equal(board.embeds[0].title, '📎 Rules');
  const id = board.components[0][0].data;

  const dup = await runBlock(plugin, 'create', ctx, { vars, config: { name: 'rules', text: 'x' } });
  assert.equal(dup.port, 'failed', 'names are unique per server');

  await click(ctx, id);
  const a = lastAnswer(ctx);
  assert.equal(a.ephemeral, true);
  assert.equal(a.message, 'Read this');
  assert.match(a.file, /^[0-9a-f]{16}\.pdf$/);

  await click(ctx, id);
  assert.ok(ctx.calls.includes('message.edit'), 'limit reached: the button goes off');
  await click(ctx, id);
  assert.match(lastAnswer(ctx).message, /limit is reached/);
});

test('password modal, once per member, roles and dates', async () => {
  const ctx = ctxWith();
  await runBlock(plugin, 'create', ctx, { vars, config: { name: 'Secret', text: 'The code is 42', password: 'pw', once: 'yes' } });
  const id = ctx.sent[0].message.components[0][0].data;
  await click(ctx, id);
  assert.equal(lastAnswer(ctx).kind, 'showModal');
  await runModal(plugin, 'password', ctx, { password: 'nope' }, { data: id, handle: 'm1', user: { id: BOB, name: 'b', displayName: 'b' }, guildId: GUILD });
  assert.equal(lastAnswer(ctx).message, '❌ Wrong password.');
  await runModal(plugin, 'password', ctx, { password: 'pw' }, { data: id, handle: 'm2', user: { id: BOB, name: 'b', displayName: 'b' }, guildId: GUILD });
  assert.equal(lastAnswer(ctx).message, 'The code is 42');
  await click(ctx, id);
  assert.match(lastAnswer(ctx).message, /already used/);

  await runBlock(plugin, 'create', ctx, { vars, config: { name: 'Staff', text: 'staff only' } });
  const staff = ctx.sent[1].message.components[0][0].data;
  await runBlock(plugin, 'allow_role', ctx, { vars, config: { name: 'Staff', role: ROLE } });
  await click(ctx, staff, ADMIN);
  assert.match(lastAnswer(ctx).message, /None of your roles/);
  await click(ctx, staff, BOB);
  assert.equal(lastAnswer(ctx).message, 'staff only');

  await runBlock(plugin, 'create', ctx, { vars, config: { name: 'Later', text: 'x', start: '2999-01-01 00:00' } });
  await click(ctx, ctx.sent[2].message.components[0][0].data);
  assert.match(lastAnswer(ctx).message, /^⏳ Available/);
  const bad = await runBlock(plugin, 'create', ctx, { vars, config: { name: 'Bad', text: 'x', start: '2027-01-02', end: '2027-01-01' } });
  assert.equal(bad.port, 'failed');
});

test('sweep switches expired buttons off; delete removes record and file', async () => {
  const ctx = ctxWith();
  await runBlock(plugin, 'create', ctx, { vars, config: { name: 'Old', attachment: URL, end: '2000-01-01 00:00' } });
  await runTask(plugin, 'sweep', ctx);
  assert.ok(ctx.calls.includes('message.edit'));
  const files = await ctx.files.list();
  assert.equal(files.length, 1);
  const del = await runBlock(plugin, 'delete', ctx, { vars, config: { name: 'old' } });
  assert.equal(del.port, 'next');
  assert.equal((await ctx.files.list()).length, 0);
  assert.equal((await runBlock(plugin, 'delete', ctx, { vars, config: { name: 'old' } })).port, 'failed');
});
