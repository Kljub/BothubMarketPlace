import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock } from '#sdk-testing';
import plugin from '../index.js';
import { ENDPOINT, pick } from '../services/api.js';

// The fake checks the key against the manifest "endpoints", like the bot.
const manifest = { id: 'starter', endpoints: [ENDPOINT] };

// A fake API server: the test decides what the endpoint answers.
function ctxWith(server) {
  return createTestContext({ id: 'starter', manifest, permissions: ['http.endpoints'], endpoints: server ? { [ENDPOINT]: server } : {} });
}

test('api_get: path, query and a field of the JSON answer', async () => {
  const ctx = ctxWith((req) => ({ status: 200, json: { data: { items: [{ name: `got ${req.path}?${req.query.q}` }] } } }));
  const out = await runBlock(plugin, 'api_get', ctx, { config: { path: '/search', query: 'q=cats', field: 'data.items.0.name' } });
  assert.equal(out.results[''], 'got /search?cats');
  assert.equal(out.results['.status'], '200');
  assert.equal(ctx.requests[0].method, 'GET');
});

test('api_get: HTTP errors go to port "failed"', async () => {
  const ctx = ctxWith(() => ({ status: 404, json: { error: 'not found' } }));
  const out = await runBlock(plugin, 'api_get', ctx, { config: { path: '/missing' } });
  assert.equal(out.port, 'failed');
  assert.equal(out.results['.status'], '404');
});

test('api_get: endpoint not shared, bad paths', async () => {
  await assert.rejects(runBlock(plugin, 'api_get', ctxWith(null), { config: { path: '/' } }), { message: 'sdk.http.not_shared' });
  const ctx = ctxWith(() => ({ json: {} }));
  await assert.rejects(runBlock(plugin, 'api_get', ctx, { config: { path: '/../admin' } }), { message: 'sdk.http.bad_path' });
});

test('pick reads nested fields', () => {
  assert.equal(pick({ a: [{ b: 1 }] }, 'a.0.b'), 1);
  assert.equal(pick({ a: 1 }, 'a.b.c'), undefined);
});
