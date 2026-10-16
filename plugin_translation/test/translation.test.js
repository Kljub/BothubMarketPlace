import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runEvent } from '#sdk-testing';
import plugin from '../index.js';
import manifest from '../bothub.json' with { type: 'json' };
import { languageOf } from '../services/deepl.js';

const G = '200000000000000001';
const CH = '300000000000000001';
const OTHER = '300000000000000009';
const ANN = '100000000000000001';
const MSG = '400000000000000001';
const KEY = 'DeepL-Auth-Key abc:fx';

function deepl(calls, status = 200) {
  return (req) => {
    calls.push(req);
    if (req.headers.Authorization !== KEY) return { status: 403, json: { message: 'Wrong key' } };
    if (status !== 200) return { status, json: {} };
    const to = req.json.target_lang;
    return { json: { translations: [{ detected_source_language: 'EN', text: `[${to}] ${req.json.text[0]}` }] } };
  };
}

function ctxWith(config = {}, { secrets = { DEEPL_API_KEY: KEY }, status = 200, calls = [] } = {}) {
  return createTestContext({
    id: 'plugin_translation', permissions: manifest.sdk.permissions, hosts: manifest.services.hosts,
    manifest: { id: 'plugin_translation', secrets: manifest.services.secrets }, secrets,
    web: { 'api-free.deepl.com': deepl(calls, status), 'api.deepl.com': deepl(calls, status) },
    config: { language: 'en', ...config },
    discord: {
      'message.get': () => ({ id: MSG, channelId: CH, guildId: G, content: 'Good morning', authorId: '100000000000000002', authorName: 'Ben', bot: false, url: `https://discord.com/channels/${G}/${CH}/${MSG}`, attachments: [] }),
      'member.get': (g, u) => ({ id: u, roles: u === ANN ? ['500000000000000001'] : [] }),
    },
  });
}

const react = (ctx, emoji, extra = {}) => runEvent(plugin, 'reactionAdd', ctx, { 'server.id': G, 'channel.id': CH, 'user.id': ANN, 'user.name': 'Ann', 'message.id': MSG, emoji, ...extra });

test('languages: codes, names, flags', () => {
  assert.equal(languageOf('de'), 'DE');
  assert.equal(languageOf('German'), 'DE');
  assert.equal(languageOf('en'), 'EN-GB');
  assert.equal(languageOf('pt_br'), 'PT-BR');
  assert.equal(languageOf('🇯🇵'), 'JA');
  assert.equal(languageOf('Klingon'), null);
});

test('/translate: default and chosen language, private answer, errors', async () => {
  const calls = [];
  const ctx = ctxWith({ default_target: 'German' }, { calls });
  const out = await runBlock(plugin, 'translate', ctx, { config: { text: 'Hello', to: '{option_to}' }, interaction: 'i1' });
  assert.deepEqual([out.port, out.results[''], out.results['.from'], out.results['.to']], ['replied', '[DE] Hello', 'EN', 'DE']);
  assert.equal(calls[0].url, 'https://api-free.deepl.com/v2/translate');
  const fr = await runBlock(plugin, 'translate', ctx, { config: { text: 'Hello', to: 'french' } });
  assert.equal(fr.results[''], '[FR] Hello');
  const bad = await runBlock(plugin, 'translate', ctx, { config: { text: 'Hello', to: 'Klingon' } });
  assert.match(bad.results['.error'], /Unknown language "Klingon"/);
  const long = await runBlock(plugin, 'translate', ctxWith({ char_limit: 50 }), { config: { text: 'x'.repeat(51) } });
  assert.match(long.results['.error'], /at most 50/);

  const paid = [];
  await runBlock(plugin, 'translate', ctxWith({ tier: 'paid' }, { calls: paid }), { config: { text: 'Hi' } });
  assert.equal(paid[0].url, 'https://api.deepl.com/v2/translate');

  const nokey = await runBlock(plugin, 'translate', ctxWith({}, { secrets: {} }), { config: { text: 'Hi' } });
  assert.match(nokey.results['.error'], /DEEPL_API_KEY/);
  const quota = await runBlock(plugin, 'translate', ctxWith({}, { status: 456 }), { config: { text: 'Hi' } });
  assert.match(quota.results['.error'], /quota/);
});

test('daily limit', async () => {
  const ctx = ctxWith({ daily_limit: 2 });
  for (let i = 0; i < 2; i++) assert.equal((await runBlock(plugin, 'translate', ctx, { config: { text: 'Hi' } })).port, 'next');
  const third = await runBlock(plugin, 'translate', ctx, { config: { text: 'Hi' } });
  assert.match(third.results['.error'], /daily translation limit/);
});

test('quick translation: flags, extra emojis, once per language, channels and roles, DM', async () => {
  const ctx = ctxWith({ trigger_emojis: ['🌐'], target: 'ES' });
  await react(ctx, '🇩🇪');
  let sent = ctx.sent.at(-1);
  assert.equal(sent.channelId, CH);
  assert.equal(sent.message.embeds[0].title, '🇩🇪 German');
  assert.equal(sent.message.embeds[0].description, '[DE] Good morning');
  assert.match(sent.message.embeds[0].fields[0].value, /^\[Ben\]\(https:\/\/discord\.com\/channels\//);
  await react(ctx, '🇦🇹');
  assert.equal(ctx.sent.length, 1, 'German again: once per message and language');
  await react(ctx, '🌐');
  assert.equal(ctx.sent.at(-1).message.embeds[0].description, '[ES] Good morning');
  await react(ctx, '👍');
  assert.equal(ctx.sent.length, 2, 'no trigger');

  const only = ctxWith({ quick_channels: [{ id: OTHER, guild: G }] });
  await react(only, '🇫🇷');
  assert.equal(only.sent.length, 0, 'other channel');

  const roles = ctxWith({ quick_roles: [{ id: '500000000000000001', guild: G }] });
  await react(roles, '🇫🇷', { 'user.id': '100000000000000003' });
  assert.equal(roles.sent.length, 0, 'member without the role');
  await react(roles, '🇫🇷');
  assert.equal(roles.sent.length, 1);

  const off = ctxWith({ flags: false });
  await react(off, '🇫🇷');
  assert.equal(off.sent.length, 0, 'flags switched off');

  const dm = ctxWith({ quick_reply: 'dm' });
  await react(dm, '🇯🇵');
  assert.equal(dm.sent.at(-1).channelId, `dm:${ANN}`);
});
