#!/usr/bin/env node
// Builds index.json, the market index the BotHub API reads
// (BOTHUB_MARKET_INDEX): every zip in dist/ with id, version, URL and SHA-256.
// Old versions stay listed as long as their zip is in dist/.
//   npm run index            write index.json
//   npm run index -- --check fail when index.json is not up to date (CI)
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalize } from './lib/check.mjs';
import { distDir, pluginsDir, root } from './lib/plugins.mjs';

const BASE = process.env.MARKET_BASE_URL ?? 'https://raw.githubusercontent.com/Kljub/BothubMarketPlace/main/dist';
const ZIP = /^([a-z0-9][a-z0-9-]{1,63})-(\d{1,4}\.\d{1,4}\.\d{1,6})\.zip$/;

const plugins = [];
for (const file of (await readdir(distDir)).sort()) {
  const m = ZIP.exec(file);
  if (!m) continue;
  const [, id, version] = m;
  const bytes = await readFile(join(distDir, file));
  const entry = { id, version, url: `${BASE}/${file}`, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
  if (existsSync(join(pluginsDir, id, 'bothub.json'))) {
    const { bothub: b, manifest: man } = await normalize(join(pluginsDir, id));
    if (man.version === version) {
      Object.assign(entry, {
        name: man.name, description: man.description, developer: b.developer, license: b.license ?? '',
        sdk: { version: man.sdk, permissions: man.permissions }, endpoints: man.endpoints,
        layers: {
          commands: man.commands.length, events: man.events.length, services: man.tasks.length + man.endpoints.length,
          nodes: man.blocks.length, dashboard: man.settings ? 1 : 0,
        },
        voice: man.permissions.includes('discord.voice'),
      });
    }
  }
  plugins.push(entry);
}
const index = JSON.stringify({ schemaVersion: 1, plugins }, null, 2) + '\n';
const path = join(root, 'index.json');

if (process.argv.includes('--check')) {
  const current = existsSync(path) ? await readFile(path, 'utf8') : '';
  if (current !== index) {
    console.error('index.json is not up to date: run "npm run pack" and "npm run index"');
    process.exit(1);
  }
  console.log(`index.json up to date (${plugins.length} entries)`);
} else {
  await writeFile(path, index);
  console.log(`index.json: ${plugins.length} entries`);
}
