#!/usr/bin/env node
// Copies what this repo needs from the BotHub repo:
//   sdk/dist/testing.js (+ .d.ts)            -> lib/sdk-testing.js  ("#sdk-testing" in tests)
//   sdk/dist/index.d.ts                      -> lib/sdk.d.ts       (types for editors)
//   shared/plugin-manifest.schema.json       -> schema/
//   shared/sdk-permissions.json              -> schema/
// Usage: npm run sync-sdk -- ../Bothub   (build the SDK there first: cd sdk && npx tsc)
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { root } from './lib/plugins.mjs';

const bothub = resolve(process.argv[2] ?? join(root, '..', 'Bothub'));
const from = (p) => {
  const file = join(bothub, p);
  if (!existsSync(file)) {
    console.error(`sync-sdk: missing ${file} (build the SDK: cd sdk && npx tsc)`);
    process.exit(1);
  }
  return file;
};

await mkdir(join(root, 'lib'), { recursive: true });
await mkdir(join(root, 'schema'), { recursive: true });
// testing.js imports only types from index.js; keep the file standalone.
const testing = (await readFile(from('sdk/dist/testing.js'), 'utf8')).replace(/^import .*from '\.\/index\.js';\n/m, '');
await writeFile(join(root, 'lib', 'sdk-testing.js'), `// Copied from BotHub sdk/dist/testing.js by scripts/sync-sdk.mjs; do not edit.\n${testing}`);
await copyFile(from('sdk/dist/testing.d.ts'), join(root, 'lib', 'sdk-testing.d.ts'));
await copyFile(from('sdk/dist/index.d.ts'), join(root, 'lib', 'sdk.d.ts'));
await copyFile(from('shared/plugin-manifest.schema.json'), join(root, 'schema', 'plugin-manifest.schema.json'));
await copyFile(from('shared/sdk-permissions.json'), join(root, 'schema', 'sdk-permissions.json'));
console.log(`synced from ${bothub}`);
