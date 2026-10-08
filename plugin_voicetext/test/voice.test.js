import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runEvent } from '#sdk-testing';
import plugin from '../index.js';

const GUILD = '900000000000000001';
const VOICE = '900000000000000002';
const TEXT = '900000000000000003';
const CATEGORY = '900000000000000004';
const NEW_TEXT = '900000000000000005';
const ANN = '900000000000000011';
const BOB = '900000000000000012';

let created = [];
const ctxWith = (config) =>
  createTestContext({
    id: 'plugin_voicetext',
    permissions: ['storage', 'discord.events.voice', 'discord.channels.read', 'discord.channels.write', 'discord.channels.permissions', 'discord.messages.send'],
    config,
    discord: {
      'channel.get': (id) => ({ id, parentId: CATEGORY }),
      'channel.create': (guild, o) => {
        created.push([guild, o]);
        return { id: NEW_TEXT, name: o.name };
      },
    },
  });
const ev = (action, user, channel, old) => ({ 'voice.action': action, 'server.id': GUILD, 'user.id': user, 'user.name': 'Ann', 'user.bot': false, 'channel.id': channel, 'channel.name': 'Talk', ...(old ? { 'old_channel.id': old } : {}) });
const perms = (ctx) => ctx.actions.filter((a) => a.call === 'channel.setPermissions').map((a) => [a.args[0], a.args[1], a.args[2].allow ? 'allow' : 'deny']);

test('linked channel: opened on join, closed on leave', async () => {
  const ctx = ctxWith({ links: [{ _id: '1', voice: { id: VOICE, guild: GUILD }, text: { id: TEXT, guild: GUILD } }], greeting: 'Hi {user}' });
  await runEvent(plugin, 'voiceStateUpdate', ctx, ev('join', ANN, VOICE));
  await runEvent(plugin, 'voiceStateUpdate', ctx, ev('leave', ANN, VOICE));
  assert.deepEqual(perms(ctx), [[TEXT, ANN, 'allow'], [TEXT, ANN, 'deny']]);
  assert.deepEqual(ctx.sent.map((m) => [m.channelId, m.message]), [[TEXT, `Hi <@${ANN}>`]]);
  assert.equal(ctx.actions.some((a) => a.call === 'channel.delete'), false);
});

test('automatic channel: created once, hidden for @everyone, deleted when the last member leaves', async () => {
  created = [];
  const ctx = ctxWith({ auto: true, auto_name: '{voice}-text' });
  await runEvent(plugin, 'voiceStateUpdate', ctx, ev('join', ANN, VOICE));
  await runEvent(plugin, 'voiceStateUpdate', ctx, ev('join', BOB, VOICE));
  assert.equal(created.length, 1);
  assert.equal(created[0][1].name, 'talk-text');
  assert.equal(created[0][1].parentId, CATEGORY);
  assert.deepEqual(perms(ctx), [[NEW_TEXT, GUILD, 'deny'], [NEW_TEXT, ANN, 'allow'], [NEW_TEXT, BOB, 'allow']]);
  await runEvent(plugin, 'voiceStateUpdate', ctx, ev('leave', ANN, VOICE));
  assert.equal(ctx.actions.some((a) => a.call === 'channel.delete'), false);
  await runEvent(plugin, 'voiceStateUpdate', ctx, ev('leave', BOB, VOICE));
  assert.deepEqual(ctx.actions.filter((a) => a.call === 'channel.delete').map((a) => a.args[0]), [NEW_TEXT]);
});

test('switch: leaves the old channel, joins the new; bots and other servers are ignored', async () => {
  const OTHER = '900000000000000006';
  const ctx = ctxWith({ links: [{ _id: '1', voice: { id: VOICE, guild: GUILD }, text: { id: TEXT, guild: GUILD } }] });
  await runEvent(plugin, 'voiceStateUpdate', ctx, ev('switch', ANN, VOICE, OTHER));
  await runEvent(plugin, 'voiceStateUpdate', ctx, { ...ev('join', BOB, VOICE), 'user.bot': true });
  await runEvent(plugin, 'voiceStateUpdate', ctx, { ...ev('join', BOB, VOICE), 'server.id': '900000000000000099' });
  assert.deepEqual(perms(ctx), [[TEXT, ANN, 'allow']]);
});

test('automatic channels only for the listed categories', async () => {
  created = [];
  const ctx = ctxWith({ auto: true, auto_channels: [{ id: '900000000000000098', guild: GUILD }] });
  await runEvent(plugin, 'voiceStateUpdate', ctx, ev('join', ANN, VOICE));
  assert.equal(created.length, 0);
});
