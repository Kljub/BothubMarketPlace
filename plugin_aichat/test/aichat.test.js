import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock } from '#sdk-testing';
import plugin from '../index.js';
import manifest from '../bothub.json' with { type: 'json' };

const USER = '200000000000000001';
const CHANNEL = '300000000000000001';
const permissions = ['secrets.use', 'storage', 'discord.interactions.reply', 'discord.messages.send'];
const openai = (seen) => ({
  'api.openai.com': (req) => {
    seen.push(req);
    if (req.headers.Authorization !== 'Bearer sk-test') return { status: 401, json: { error: { message: 'bad key' } } };
    return { json: { choices: [{ message: { content: `Answer to: ${req.json.messages.at(-1).content}` } }] } };
  },
  'api.anthropic.com': (req) => {
    seen.push(req);
    return { json: { content: [{ text: `Claude: ${req.json.messages.at(-1).content}` }] } };
  },
});
const ctxWith = (config = {}, seen = []) => createTestContext({
  id: 'plugin_aichat', permissions, manifest: { id: 'plugin_aichat', secrets: manifest.services.secrets }, hosts: manifest.services.hosts,
  secrets: { AI_API_KEY: 'sk-test' }, web: openai(seen),
  config: { provider: 'openai', model: '', system_prompt: 'Be short.', positive_prompt: 'friendly', negative_prompt: 'swearing', max_tokens: 500, temperature: 70, history_length: 2, session_minutes: 30, web_search: false, ...config },
});
const vars = { 'user.id': USER };

test('ask: prompts, key from the secret, memory of the last exchanges', async () => {
  const seen = [];
  const ctx = ctxWith({}, seen);
  const out = await runBlock(plugin, 'ask', ctx, { vars, config: { question: 'Hi?' } });
  assert.equal(out.results[''], 'Answer to: Hi?');
  const sys = seen[0].json.messages[0];
  assert.equal(sys.role, 'system');
  assert.match(sys.content, /Be short\.\n\nBehave like this: friendly\n\nNever do this: swearing/);
  assert.equal(seen[0].json.temperature, 0.7);
  await runBlock(plugin, 'ask', ctx, { vars, config: { question: 'And?' } });
  assert.deepEqual(seen[1].json.messages.slice(1).map((m) => m.content), ['Hi?', 'Answer to: Hi?', 'And?']);
  await runBlock(plugin, 'reset', ctx, { vars });
  await runBlock(plugin, 'ask', ctx, { vars, config: { question: 'Fresh' } });
  assert.equal(seen[2].json.messages.length, 2, 'system + question only');
});

test('anthropic format; command answers later by editing', async () => {
  const seen = [];
  const ctx = ctxWith({ provider: 'anthropic' }, seen);
  const out = await runBlock(plugin, 'ask', ctx, { vars, interaction: 'cmd', config: { question: 'Yo' } });
  assert.equal(out.port, 'replied');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(seen[0].headers['x-api-key'], 'sk-test');
  assert.equal(seen[0].json.system.startsWith('Be short.'), true);
  assert.equal(ctx.answers.at(-1).kind, 'editReply');
  assert.equal(ctx.answers.at(-1).message, '🤖 Claude: Yo');
});

test('mention event: the block posts the answer in the channel', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'ask', ctx, { vars: { ...vars, 'channel.id': CHANNEL }, config: { question: 'what time?', reply: 'yes' } });
  assert.equal(out.port, 'replied');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].message, `🤖 <@${USER}> Answer to: what time?`);
});

test('missing key: a readable error', async () => {
  const ctx = createTestContext({ id: 'plugin_aichat', permissions, manifest: { id: 'plugin_aichat', secrets: manifest.services.secrets }, hosts: manifest.services.hosts, secrets: {}, web: openai([]), config: { provider: 'openai' } });
  const out = await runBlock(plugin, 'ask', ctx, { vars, config: { question: 'x' } });
  assert.equal(out.port, 'failed');
  assert.match(out.results[''], /AI_API_KEY/);
});
