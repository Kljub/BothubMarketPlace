import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock } from '#sdk-testing';
import plugin from '../index.js';
import { tick } from '../services/board.js';

const GUILD = '900000000000000001';
const BOARD = '900000000000000002';
const SUPPORT = '900000000000000003';
const ADMIN = '900000000000000004';
const ANN = '900000000000000011';
const BOB = '900000000000000012';
const EVE = '900000000000000013';
const GUEST = '900000000000000014';

const members = [
  { id: ANN, roles: [SUPPORT] },
  { id: BOB, roles: [SUPPORT, ADMIN] },
  { id: EVE, roles: [ADMIN] },
  { id: GUEST, roles: [] },
];
const ctxWith = (config = {}) =>
  createTestContext({
    id: 'plugin_staffactivity',
    permissions: ['storage', 'scheduler', 'discord.messages.send', 'discord.messages.edit', 'discord.members.read', 'discord.interactions.reply'],
    config: {
      channel: { id: BOARD, guild: GUILD },
      teams: [{ _id: '1', name: 'Support', role: { id: SUPPORT, guild: GUILD } }, { _id: '2', name: 'Admins', role: { id: ADMIN, guild: GUILD } }],
      ...config,
    },
    discord: {
      'member.list': () => members,
      'member.get': (g, id) => members.find((m) => m.id === id) ?? null,
    },
  });
const duty = (ctx, user, status, note = '') => runBlock(plugin, 'set_status', ctx, { config: { status, note }, vars: { 'server.id': GUILD, 'user.id': user } });
const board = (ctx) => {
  const edits = ctx.actions.filter((a) => a.call === 'message.edit');
  return edits.length ? edits.at(-1).args[2].embeds[0] : ctx.sent.at(-1).message.embeds[0];
};

test('duty on, idle, off: board by team, colours and counts', async () => {
  const ctx = ctxWith();
  assert.equal((await duty(ctx, ANN, 'on', 'tickets')).port, 'next');
  await duty(ctx, BOB, 'idle');
  const e = board(ctx);
  assert.match(e.title, /1 on duty · 1 idle/);
  assert.equal(e.color, '#22c55e');
  const [support, admins] = e.description.split('\n\n');
  assert.match(support, /^\*\*Support\*\*/);
  assert.match(support.split('\n')[1], new RegExp(`🟢 \\*\\*<@${ANN}>\\*\\* - On duty · since <t:\\d+:R> · tickets`));
  assert.match(support, new RegExp(`🟡 \\*\\*<@${BOB}>\\*\\* - Idle`));
  assert.match(admins, new RegExp(`🔴 \\*\\*<@${EVE}>\\*\\* - Off duty`));
  assert.equal(ctx.sent.length, 1, 'one board message, edited afterwards');
});

test('only team members, off-duty members hidden when wanted', async () => {
  const ctx = ctxWith({ show_off: false });
  assert.equal((await duty(ctx, GUEST, 'on')).port, 'failed');
  await duty(ctx, EVE, 'on');
  const e = board(ctx);
  assert.doesNotMatch(e.description, new RegExp(ANN));
  assert.match(e.description, new RegExp(`🟢 \\*\\*<@${EVE}>`));
});

test('the task turns old statuses off', async () => {
  const ctx = ctxWith({ auto_off_hours: 2 });
  await duty(ctx, ANN, 'on');
  assert.equal(await tick(ctx, Date.now() + 1 * 3_600_000), 0);
  assert.equal(await tick(ctx, Date.now() + 3 * 3_600_000), 1);
  assert.match(board(ctx).title, /0 on duty · 0 idle/);
});

test('German board', async () => {
  const ctx = ctxWith({ language: 'de' });
  await duty(ctx, ANN, 'on');
  assert.match(board(ctx).title, /1 im Dienst/);
});
