import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runTask } from '#sdk-testing';
import plugin from '../index.js';
import settings from '../dashboard/settings.json' with { type: 'json' };

const GUILD = '100000000000000001';
const VOICE = '300000000000000009';
const ADMIN = '200000000000000001';
const BOB = '200000000000000002';
const AIRHORN = 'https://cdn.discordapp.com/attachments/1/2/airhorn.mp3';
const NOTES = 'https://cdn.discordapp.com/attachments/1/3/notes.txt';
const permissions = ['storage', 'storage.files', 'scheduler', 'discord.voice.connect', 'discord.voice.speak', 'discord.interactions.reply', 'discord.members.read', 'discord.guilds.read'];
const ctxWith = () => createTestContext({
  id: 'plugin_soundboard', permissions, config: { volume: '50' }, settings,
  attachments: { [AIRHORN]: Buffer.from('ID3 airhorn').toString('base64'), [NOTES]: Buffer.from('hello').toString('base64') },
  discord: { 'member.get': (g, u) => ({ id: u, roles: [], voiceChannelId: u === BOB ? VOICE : null }), 'guild.list': () => [{ id: GUILD, name: 'G', memberCount: 2 }] },
});
const vars = { 'server.id': GUILD, 'user.id': ADMIN };

test('add, play in the voice channel, list, remove', async () => {
  const ctx = ctxWith();
  const added = await runBlock(plugin, 'add', ctx, { vars, config: { name: 'AirHorn', attachment: AIRHORN } });
  assert.equal(added.port, 'next');
  assert.equal((await runBlock(plugin, 'add', ctx, { vars, config: { name: 'airhorn', attachment: AIRHORN } })).port, 'failed', 'names are unique');
  assert.equal((await runBlock(plugin, 'add', ctx, { vars, config: { name: 'notes', attachment: NOTES } })).results[''], '❌ Only mp3, ogg, wav or webm.');
  assert.equal((await runBlock(plugin, 'add', ctx, { vars, config: { name: 'bad name!', attachment: AIRHORN } })).port, 'failed');

  const noVoice = await runBlock(plugin, 'play', ctx, { vars, config: { sound: 'airhorn', channel: '' } });
  assert.equal(noVoice.results[''], '❌ Join a voice channel first.');
  const played = await runBlock(plugin, 'play', ctx, { vars, config: { sound: 'airhorn', channel: VOICE } });
  assert.equal(played.port, 'next');
  assert.equal(ctx.played.at(-1).volume, 0.5);

  const listed = await runBlock(plugin, 'list', ctx, {});
  assert.match(listed.results[''], /airhorn\*\* · played 1×/);
  assert.equal((await runBlock(plugin, 'remove', ctx, { config: { name: 'airhorn' } })).port, 'next');
  assert.equal((await ctx.files.list()).length, 0, 'the file goes with it');
});

test('panel buttons play in the clicker\'s voice channel; idle leaves', async () => {
  const ctx = ctxWith();
  await runBlock(plugin, 'add', ctx, { vars, config: { name: 'airhorn', attachment: AIRHORN } });
  await runBlock(plugin, 'panel', ctx, { vars, interaction: 'cmd-1' });
  const panel = ctx.answers.at(-1).message;
  assert.equal(panel.components[0][0].data, 'airhorn');

  await runComponent(plugin, 'play', ctx, { data: 'airhorn', handle: 'c1', user: { id: ADMIN, name: 'a', displayName: 'a' }, guildId: GUILD });
  assert.equal(ctx.answers.at(-1).message, '❌ Join a voice channel first.');
  await runComponent(plugin, 'play', ctx, { data: 'airhorn', handle: 'c2', user: { id: BOB, name: 'b', displayName: 'b' }, guildId: GUILD });
  assert.equal(ctx.answers.at(-1).message, '🔊 **airhorn**');
  assert.equal((await ctx.voice.state(GUILD)).channelId, VOICE);

  await ctx.storage.set(`last:${GUILD}`, '0');
  await ctx.voice.stop(GUILD);
  await runTask(plugin, 'idle', ctx);
  assert.equal((await ctx.voice.state(GUILD)).channelId, null);
});

test('the sounds are the settings list: dashboard uploads play, 1.0.0 storage moves over', async () => {
  const ctx = ctxWith();
  const put = await ctx.files.put(Buffer.from('ID3 drum').toString('base64'), 'drum.mp3');
  await ctx.config.set('sounds', [{ name: 'Drum', file: put.name }]);
  const played = await runBlock(plugin, 'play', ctx, { vars, config: { sound: 'drum', channel: VOICE } });
  assert.equal(played.port, 'next');
  await runBlock(plugin, 'add', ctx, { vars, config: { name: 'airhorn', attachment: AIRHORN } });
  assert.deepEqual(ctx.settingsNow.sounds.map((s) => s.name), ['Drum', 'airhorn'], '/soundboard-add shows up on the settings page');

  const old = ctxWith();
  const f = await old.files.put(Buffer.from('ID3 old').toString('base64'), 'old.mp3');
  await old.storage.set('sounds', JSON.stringify([{ name: 'old', file: f.name, plays: 3 }]));
  const listed = await runBlock(plugin, 'list', old, {});
  assert.match(listed.results[''], /old\*\* · played 3×/);
  assert.equal(old.settingsNow.sounds[0].name, 'old');
  assert.equal(await old.storage.get('sounds'), null);
});
