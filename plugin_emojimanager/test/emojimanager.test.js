import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent } from '#sdk-testing';
import plugin from '../index.js';

const USER = '100000000000000001';
const OTHER = '100000000000000009';
const GUILD = '200000000000000001';
const CHANNEL = '300000000000000001';
const vars = { 'user.id': USER, 'server.id': GUILD, 'channel.id': CHANNEL };
const permissions = ['storage', 'storage.files', 'discord.messages.send', 'discord.messages.files', 'discord.interactions.reply', 'discord.emojis.read'];
const emojis = [
  { name: 'pogchamp', image: 'https://cdn.example.test/pog.png' },
  { name: 'bad name!', image: 'https://cdn.example.test/x.png' },
  { name: 'nolink', image: 'http://insecure.test/x.png' },
];
const serverEmojis = () => [{ id: '1', name: 'Wave', animated: false, available: true, url: 'https://cdn.discordapp.com/emojis/1.png', mention: '<:Wave:1>' }];
const ctxWith = (config = {}) => createTestContext({ id: 'plugin_emojimanager', permissions, config: { emojis, ...config }, discord: { 'emoji.list': serverEmojis } });

test('menu: private select of list and server emojis', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'menu', ctx, { vars, interaction: 'cmd-1' });
  assert.equal(out.port, 'replied');
  assert.equal(out.results['.count'], '2', 'bad names and http links are left out');
  const answer = ctx.answers[0];
  assert.equal(answer.ephemeral, true);
  const select = answer.message.components[0][0];
  assert.deepEqual(select.options.map((o) => o.value), ['pogchamp', 'wave']);
  assert.equal(select.data, USER);
});

test('pick: only the opener; posts the emoji big and counts it', async () => {
  const ctx = ctxWith();
  await runComponent(plugin, 'pick', ctx, { data: USER, values: ['pogchamp'], user: { id: OTHER, name: 'x', displayName: 'X' } });
  assert.equal(ctx.answers.at(-1).ephemeral, true, 'another member is refused');
  assert.equal(ctx.sent.length, 0);

  await runComponent(plugin, 'pick', ctx, { data: USER, values: ['pogchamp'], user: { id: USER, name: 'ann', displayName: 'Ann' }, guildId: GUILD, channelId: CHANNEL });
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].channelId, CHANNEL);
  assert.equal(ctx.sent[0].message.embeds[0].image_url, 'https://cdn.example.test/pog.png');
  assert.match(ctx.sent[0].message.embeds[0].description, new RegExp(`<@${USER}>`));
  assert.equal(ctx.answers.at(-1).kind, 'update');
  assert.equal(ctx.store.get(`uses:${GUILD}:pogchamp`), '1');
});

test('send: by name, server emojis optional, not_found', async () => {
  const ctx = ctxWith({ show_sender: false });
  const out = await runBlock(plugin, 'send', ctx, { vars, config: { name: ':Wave:' } });
  assert.deepEqual([out.port, out.results[''], out.results['.uses']], ['next', 'wave', '1']);
  assert.equal(ctx.sent[0].message.embeds[0].description, undefined, 'sender hidden');
  const off = ctxWith({ server_emojis: false });
  assert.equal((await runBlock(plugin, 'send', off, { vars, config: { name: 'wave' } })).port, 'not_found');
  assert.equal((await runBlock(plugin, 'menu', ctxWith({ emojis: [], server_emojis: false }), { vars, interaction: 'cmd' })).port, 'empty');
  const quick = ctxWith();
  const sent = await runBlock(plugin, 'menu', quick, { vars, interaction: 'cmd-2', config: { name: 'pogchamp' } });
  assert.deepEqual([sent.port, quick.sent.length, quick.answers[0].ephemeral], ['sent', 1, true], 'a name sends right away');
  assert.equal((await runBlock(plugin, 'menu', quick, { vars, config: { name: 'nope' } })).port, 'not_found');
});
