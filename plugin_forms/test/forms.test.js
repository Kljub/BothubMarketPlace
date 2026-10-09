import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runModal } from '#sdk-testing';
import plugin from '../index.js';
import { questions } from '../services/forms.js';

const modals = (ctx) => ctx.answers.filter((a) => a.kind === 'showModal').map((a) => a.modal);
const replies = (ctx) => ctx.answers.filter((a) => a.kind === 'reply').map((a) => String(a.message));

const GUILD = '900000000000000001';
const ANSWERS = '900000000000000002';
const HERE = '900000000000000003';
const ROLE = '900000000000000004';
const STAFF = '900000000000000005';
const ANN = '900000000000000011';
const MOD = '900000000000000012';

const form = { _id: '1', name: 'apply', title: 'Staff application', questions: 'Your age\nWhy you? (long)\nDiscord experience (optional)', channel: { id: ANSWERS, guild: GUILD }, review: true, accept_role: { id: ROLE, guild: GUILD }, once: true };
const ctxWith = (config = {}, members = {}) =>
  createTestContext({
    id: 'plugin_forms',
    permissions: ['storage', 'discord.messages.send', 'discord.messages.edit', 'discord.interactions.reply', 'discord.modals', 'discord.members.read', 'discord.roles.assign'],
    config: { forms: [form], ...config },
    discord: { 'member.get': (g, id) => ({ id, roles: members[id] ?? [] }) },
  });

test('questions: max 5, long and optional marks', () => {
  assert.deepEqual(questions('A\nB (long)\nC (optional)\nD\nE\nF'), [
    { label: 'A', long: false, required: true }, { label: 'B', long: true, required: true }, { label: 'C', long: false, required: false },
    { label: 'D', long: false, required: true }, { label: 'E', long: false, required: true },
  ]);
});

test('/form-panel posts the button; the button opens the modal', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'panel', ctx, { config: { name: 'APPLY' }, vars: { 'server.id': GUILD, 'channel.id': HERE } });
  assert.equal(out.port, 'next');
  assert.equal(ctx.sent[0].channelId, HERE);
  assert.equal(ctx.sent[0].message.components[0][0].key, 'open');
  await runComponent(plugin, 'open', ctx, { data: 'apply', guildId: GUILD, user: { id: ANN } });
  const modal = modals(ctx).at(-1);
  assert.equal(modal.title, 'Staff application');
  assert.deepEqual(modal.fields.map((f) => [f.key, f.style, f.required]), [['q0', 'short', true], ['q1', 'long', true], ['q2', 'short', false]]);
});

test('answer goes to the channel; accept gives the role, once blocks a second answer until decided', async () => {
  const ctx = ctxWith({ reviewers: [{ id: STAFF, guild: GUILD }] }, { [MOD]: [STAFF] });
  await runModal(plugin, 'answer', ctx, { q0: '21', q1: 'I like helping' }, { data: 'apply', guildId: GUILD, user: { id: ANN } });
  const posted = ctx.sent.at(-1);
  assert.equal(posted.channelId, ANSWERS);
  assert.equal(posted.message.embeds[0].fields[1].value, 'I like helping');
  const id = posted.message.components[0][0].data;
  await runComponent(plugin, 'open', ctx, { data: 'apply', guildId: GUILD, user: { id: ANN } });
  assert.match(replies(ctx).at(-1), /already sent/);
  await runComponent(plugin, 'accept', ctx, { data: id, guildId: GUILD, user: { id: ANN } });
  assert.match(replies(ctx).at(-1), /Only reviewers/);
  await runComponent(plugin, 'accept', ctx, { data: id, guildId: GUILD, user: { id: MOD } });
  assert.ok(ctx.actions.some((a) => a.call === 'member.addRole' && a.args[1] === ANN && a.args[2] === ROLE));
  const opened = modals(ctx).length;
  await runComponent(plugin, 'open', ctx, { data: 'apply', guildId: GUILD, user: { id: ANN } });
  assert.equal(modals(ctx).length, opened + 1);
});

test('unknown form names list the forms', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'panel', ctx, { config: { name: 'nope' }, vars: { 'server.id': GUILD, 'channel.id': HERE } });
  assert.equal(out.port, 'failed');
  assert.match(out.results[''], /`apply`/);
});
