import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runModal } from '#sdk-testing';
import plugin from '../index.js';
import manifest from '../bothub.json' with { type: 'json' };

const GUILD = '200000000000000001';
const ME = '100000000000000001';
const OTHER = '100000000000000002';
const vars = (user = ME) => ({ 'user.id': user, 'server.id': GUILD });
const ctxWith = () => createTestContext({
  id: 'plugin_profile', permissions: manifest.sdk.permissions,
  discord: { 'member.get': (g, id) => ({ id, name: id === ME ? 'daniel' : 'anna', displayName: id === ME ? 'Daniel' : 'Anna', bot: false, avatar: 'https://cdn.discordapp.com/a.png', joinedAt: null, roles: [], voiceChannelId: null }) },
});
const ev = (key, extra) => ({ handle: `h-${key}`, key, data: '', user: { id: ME, name: 'daniel', displayName: 'Daniel' }, guildId: GUILD, channelId: '300000000000000001', ...extra });

test('profile: empty at first, edit form, saved card with buttons', async () => {
  const ctx = ctxWith();
  let out = await runBlock(plugin, 'show', ctx, { config: { user: '' }, vars: vars(), interaction: 'cmd-1' });
  assert.equal(out.results['.empty'], 'true');
  assert.match(ctx.answers.at(-1).message, /no profile yet/);
  // /profile-edit favorites opens the second form.
  out = await runBlock(plugin, 'edit', ctx, { config: { section: 'favorites' }, vars: vars(), interaction: 'cmd-2' });
  assert.equal(out.port, 'opened');
  const modal = ctx.answers.filter((a) => a.kind === 'showModal').at(-1).modal;
  assert.equal(modal.key, 'favorites');
  assert.deepEqual(modal.fields.map((f) => f.key), ['hobbies', 'game', 'movie', 'music', 'food']);
  await runModal(plugin, 'favorites', ctx, { hobbies: 'Climbing', game: 'Dead by Daylight', movie: '', music: 'Synthwave', food: 'Ramen' }, { data: ME });
  await runModal(plugin, 'about', ctx, { about: 'Hi, I build bots.', pronouns: 'he/him', age: 'thirty', location: 'Germany', color: '22c55e' }, { data: ME });
  out = await runBlock(plugin, 'show', ctx, { config: { user: '' }, vars: vars(), interaction: 'cmd-3' });
  assert.equal(out.port, 'replied');
  const card = ctx.answers.at(-1).message;
  const embed = card.embeds[0];
  assert.equal(embed.title, '📇 Daniel');
  assert.equal(embed.description, 'Hi, I build bots.');
  assert.equal(embed.color, '#22c55e', 'own color, # added');
  assert.deepEqual(embed.fields.map((f) => f.name), ['Pronouns', 'From', 'Hobbies', '🎮 Game', '🎵 Music', '🍕 Food'], 'no age (not a number), no empty movie');
  assert.deepEqual(card.components[0].map((b) => b.key), ['edit', 'edit', 'remove'], 'own card: buttons');
  // Another member sees the card without buttons and cannot use them.
  await runBlock(plugin, 'show', ctx, { config: { user: ME }, vars: vars(OTHER), interaction: 'cmd-4' });
  assert.equal(ctx.answers.at(-1).message.components, undefined);
  await runComponent(plugin, 'remove', ctx, ev('remove', { data: ME, user: { id: OTHER, name: 'anna', displayName: 'Anna' } }));
  assert.match(ctx.answers.at(-1).message, /not your profile/);
  // The owner deletes it.
  await runComponent(plugin, 'remove', ctx, ev('remove', { data: ME }));
  out = await runBlock(plugin, 'show', ctx, { config: { user: ME }, vars: vars(), interaction: 'cmd-5' });
  assert.equal(out.results['.empty'], 'true');
});

test('profile: the edit button opens the form with the saved values', async () => {
  const ctx = ctxWith();
  await runModal(plugin, 'about', ctx, { about: 'Hello', pronouns: '', age: '30', location: '', color: '' }, { data: ME });
  await runComponent(plugin, 'edit', ctx, ev('edit', { data: `about:${ME}` }));
  const modal = ctx.answers.filter((a) => a.kind === 'showModal').at(-1).modal;
  assert.equal(modal.fields.find((f) => f.key === 'about').value, 'Hello');
  assert.equal(modal.fields.find((f) => f.key === 'age').value, '30');
});
