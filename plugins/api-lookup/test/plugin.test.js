// Checks that bothub.json, the layer files, the code and the texts fit
// together (the same checks as "npm run validate"). Keep this test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { check } from '#market';

test('bothub.json, layers, handlers and texts are consistent', async () => {
  const errors = await check(fileURLToPath(new URL('..', import.meta.url)));
  assert.deepEqual(errors, []);
});
