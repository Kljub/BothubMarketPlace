import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent } from '#sdk-testing';
import plugin from '../index.js';
import settings from '../dashboard/settings.json' with { type: 'json' };

const USER = '100000000000000001';
const MOD = '100000000000000002';
const GUILD = '200000000000000001';
const CHANNEL = '300000000000000001';
// A 1x1 PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ATTACHMENT = 'https://cdn.discordapp.com/ephemeral-attachments/1/2/wave.png?ex=1';
const permissions = ['storage', 'storage.files', 'discord.messages.send', 'discord.messages.files', 'discord.interactions.reply', 'discord.emojis.read'];
const ctxWith = (config = {}) => createTestContext({
  id: 'plugin_emojimanager', permissions, settings, config: { server_emojis: false, ...config },
  members: { [USER]: { permissions: [] }, [MOD]: { permissions: ['manage_guild_expressions'] } },
  attachments: { [ATTACHMENT]: PNG, 'https://cdn.discordapp.com/attachments/1/2/text.png': Buffer.from('not an image').toString('base64') },
});
const vars = (user) => ({ 'user.id': user, 'server.id': GUILD, 'channel.id': CHANNEL });

test('add: image of a Discord attachment, stored in the plugin files, only for managers', async () => {
  const ctx = ctxWith();
  const denied = await runBlock(plugin, 'manage', ctx, { vars: vars(USER), config: { action: 'add', name: 'wave', image: ATTACHMENT } });
  assert.equal(denied.results['.reason'], 'denied', 'default: Manage Expressions');
  assert.equal(ctx.fileStore.size, 0);

  const out = await runBlock(plugin, 'manage', ctx, { vars: vars(MOD), interaction: 'cmd-1', config: { action: 'add', name: ':Wave:', image: ATTACHMENT } });
  assert.deepEqual([out.port, out.results['']], ['replied', 'wave']);
  assert.match(ctx.answers.at(-1).message, /added/);
  const list = ctx.settingsNow.emojis;
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'wave');
  assert.match(list[0].file, /^[0-9a-f]{16}\.png$/);
  assert.ok(ctx.fileStore.has(list[0].file));

  const again = await runBlock(plugin, 'manage', ctx, { vars: vars(MOD), config: { action: 'add', name: 'wave', image: ATTACHMENT } });
  assert.equal(again.port, 'exists');
  const bad = await runBlock(plugin, 'manage', ctx, { vars: vars(MOD), config: { action: 'add', name: 'text', image: 'https://cdn.discordapp.com/attachments/1/2/text.png' } });
  assert.equal(bad.port, 'bad_image');
  assert.equal((await runBlock(plugin, 'manage', ctx, { vars: vars(MOD), config: { action: 'add', name: 'bad name!', image: ATTACHMENT } })).port, 'bad_name');
  const link = await runBlock(plugin, 'manage', ctx, { vars: vars(MOD), config: { action: 'add', name: 'pog', image: 'https://cdn.example.test/pog.png' } });
  assert.equal(link.port, 'done', 'an https link works too');
  const dm = await runBlock(plugin, 'manage', ctx, { vars: { 'user.id': MOD }, config: { action: 'add', name: 'dm', image: ATTACHMENT } });
  assert.equal(dm.port, 'denied', 'not in DMs');
});

test('uploaded images are posted as attachments; delete removes entry and file', async () => {
  const ctx = ctxWith();
  await runBlock(plugin, 'manage', ctx, { vars: vars(MOD), config: { action: 'add', name: 'wave', image: ATTACHMENT } });
  const file = ctx.settingsNow.emojis[0].file;

  await runComponent(plugin, 'pick', ctx, { data: USER, values: ['wave'], user: { id: USER, name: 'ann', displayName: 'Ann' }, guildId: GUILD, channelId: CHANNEL });
  const sent = ctx.sent.at(-1);
  assert.equal(sent.file, file);
  assert.equal(sent.message.embeds[0].image_url, `attachment://${file}`);

  const out = await runBlock(plugin, 'manage', ctx, { vars: vars(MOD), config: { action: 'delete', name: 'wave' } });
  assert.equal(out.port, 'done');
  assert.deepEqual(ctx.settingsNow.emojis, []);
  assert.equal(ctx.fileStore.has(file), false, 'the image goes with the entry');
  assert.equal((await runBlock(plugin, 'manage', ctx, { vars: vars(MOD), config: { action: 'delete', name: 'wave' } })).port, 'not_found');
});

test('dashboard uploads (file field) win over links; 1.0.0 links keep working', async () => {
  const name = 'c414cd0e204de974.png';
  const ctx = createTestContext({
    id: 'plugin_emojimanager', permissions, settings,
    config: { server_emojis: false, emojis: [{ name: 'up', file: name, image: 'https://cdn.example.test/old.png' }, { name: 'old', image: 'https://cdn.example.test/old.png' }] },
    files: { [name]: PNG },
  });
  const up = await runBlock(plugin, 'send', ctx, { vars: vars(USER), config: { name: 'up' } });
  assert.deepEqual([up.port, ctx.sent.at(-1).file], ['next', name]);
  const old = await runBlock(plugin, 'send', ctx, { vars: vars(USER), config: { name: 'old' } });
  assert.equal(old.port, 'next');
  assert.equal(ctx.sent.at(-1).file, undefined);
  assert.equal(ctx.sent.at(-1).message.embeds[0].image_url, 'https://cdn.example.test/old.png');
});
