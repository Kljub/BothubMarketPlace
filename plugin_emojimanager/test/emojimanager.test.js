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
  assert.equal(select.data, `${USER}:0`);
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

test('menu: no limit; 25 per select menu, 100 per page, page buttons only for the opener', async () => {
  const many = Array.from({ length: 230 }, (_, i) => ({ name: `e${String(i).padStart(3, '0')}`, image: `https://cdn.example.test/${i}.png` }));
  const ctx = ctxWith({ emojis: many, server_emojis: false });
  const out = await runBlock(plugin, 'menu', ctx, { vars, interaction: 'cmd-2' });
  assert.equal(out.results['.count'], '230');
  const first = ctx.answers[0].message;
  assert.equal(first.components.length, 5, '4 select menus and the page buttons');
  assert.deepEqual(first.components.slice(0, 4).map((r) => r[0].options.length), [25, 25, 25, 25]);
  assert.match(first.content, /page 1 of 3/);
  const next = first.components[4][1];
  await runComponent(plugin, 'page', ctx, { handle: 'h-next', data: next.data, user: { id: USER }, guildId: GUILD });
  const second = ctx.answers.at(-1).message;
  assert.match(second.content, /page 2 of 3/);
  assert.equal(second.components[0][0].options[0].value, 'e100');
  await runComponent(plugin, 'page', ctx, { handle: 'h-other', data: next.data, user: { id: OTHER }, guildId: GUILD });
  assert.equal(ctx.answers.at(-1).ephemeral, true, 'someone else gets a private note');
});
