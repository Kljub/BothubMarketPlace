// Node plugin.plugin_amp.create: a new game server from a deployment
// template of the AMP controller (managers only; templates shared in the
// settings). Ports "replied", "next", "failed".
import { opt, runBlock } from '../services/blocks.js';
import { t } from '../services/i18n.js';
import { create } from '../services/servers.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function createBlock(ctx, input) {
  const { config } = input;
  return runBlock(ctx, input, async (L) => {
    const made = await create(ctx, opt(config.template), opt(config.name));
    const text = t(L, 'create.done', { name: made.name, template: made.template });
    return { message: text, results: { '': text, '.name': made.name, '.template': made.template } };
  }, { manage: true });
}
