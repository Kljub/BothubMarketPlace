import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runTask } from '#sdk-testing';
import plugin from '../index.js';
import { zoned } from '../services/backups.js';

const GUILD = '100000000000000001';
const OTHER = '100000000000000002';
const ADMIN = '200000000000000001';
const permissions = ['storage', 'storage.files', 'scheduler', 'discord.server.backup', 'discord.server.restore', 'discord.guilds.read', 'discord.interactions.reply', 'discord.messages.send'];
const restores = [];
const ctxWith = (config = {}) => createTestContext({
  id: 'plugin_serverbackup', permissions, config: { keep: 2, include_bans: false, schedule: false, ...config },
  guilds: [{ id: GUILD, name: 'Home', memberCount: 5 }, { id: OTHER, name: 'Other', memberCount: 2 }],
  discord: {
    'guild.snapshot.data': (g, parts) => ({ settings: { name: g === GUILD ? 'Home' : 'Other' }, roles: [{ id: 'r' }], channels: parts.includes('channels') ? [{ id: 'c1' }, { id: 'c2' }] : [] }),
    'guild.restore.report': (g, backup, opts) => (restores.push({ g, from: backup.guild.id, mode: opts.mode }), { mode: opts.mode, created: { roles: 1, channels: 2, emojis: 0, bans: 0 }, deleted: { roles: 0, channels: 0 }, failed: [] }),
    'guild.list': () => [{ id: GUILD, name: 'Home', memberCount: 5 }],
  },
});
const vars = (g = GUILD) => ({ 'server.id': g, 'user.id': ADMIN });
const settle = () => new Promise((r) => setTimeout(r, 10));

test('create keeps the newest backups; info and delete', async () => {
  const ctx = ctxWith();
  for (let i = 0; i < 3; i++) {
    await runBlock(plugin, 'create', ctx, { vars: vars() });
  }
  const files = await ctx.files.list();
  assert.ok(files.length >= 1 && files.length <= 2);
  assert.match(files[0].filename, /^backup-100000000000000001-\d{4}-\d{2}-\d{2}\.json$/);
  const info = await runBlock(plugin, 'info', ctx, { vars: vars() });
  assert.match(info.results[''], /Channels \*\*2\*\*/);
  assert.equal((await runBlock(plugin, 'delete', ctx, { vars: vars(), config: { number: '9' } })).port, 'failed');
});

test('restore asks first, then restores and reports by DM; clone takes another server', async () => {
  const ctx = ctxWith();
  await runBlock(plugin, 'create', ctx, { vars: vars(OTHER) });
  const out = await runBlock(plugin, 'clone', ctx, { vars: vars(), interaction: 'cmd', config: { source: OTHER, mode: 'replace' } });
  assert.equal(out.port, 'replied');
  const ask = ctx.answers.at(-1);
  assert.match(ask.message.content, /Clone \*\*Other\*\*/);
  assert.match(ask.message.content, /Replace/);
  const confirm = ask.message.components[0][0];
  await runComponent(plugin, 'confirm', ctx, { data: confirm.data, handle: 'b1', user: { id: '200000000000000009', name: 'x', displayName: 'x' }, guildId: GUILD });
  assert.match(ctx.answers.at(-1).message, /Not your question/);
  await runComponent(plugin, 'confirm', ctx, { data: confirm.data, handle: 'b2', user: { id: ADMIN, name: 'a', displayName: 'a' }, guildId: GUILD });
  await settle();
  assert.deepEqual(restores.at(-1), { g: GUILD, from: OTHER, mode: 'replace' });
  assert.match(ctx.sent.at(-1).message, /Restore done/);
  assert.equal(ctx.sent.at(-1).channelId, `dm:${ADMIN}`);
  assert.equal((await runBlock(plugin, 'restore', ctx, { vars: vars(), interaction: 'c2', config: {} })).port, 'failed', 'no backup of this server yet');
});

test('schedule: at the set time once', async () => {
  const now = zoned('UTC');
  const ctx = ctxWith({ schedule: true, schedule_day: 'daily', schedule_time: now.time, timezone: 'UTC' });
  await runTask(plugin, 'schedule', ctx);
  await runTask(plugin, 'schedule', ctx);
  assert.equal((await ctx.files.list()).length, 1);
  assert.equal(zoned('Not/AZone'), null);
});
