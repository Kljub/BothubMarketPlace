// Node plugin.plugin_amp.power: start, stop, restart, kill or update a game
// server (managers only). Ports "replied", "next", "failed".
import { opt, runBlock } from '../services/blocks.js';
import { t } from '../services/i18n.js';
import { findServer, power } from '../services/servers.js';

const ACTIONS = ['start', 'stop', 'restart', 'kill', 'update'];

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function powerBlock(ctx, input) {
  const { config } = input;
  return runBlock(ctx, input, async (L) => {
    const wanted = opt(config.action).toLowerCase();
    const action = ACTIONS.includes(wanted) ? wanted : 'start';
    const inst = await findServer(ctx, opt(config.server));
    await power(ctx, inst, action);
    const text = t(L, `power.${action}`, { name: inst.friendly });
    return { message: text, results: { '': text, '.server': inst.friendly, '.action': action } };
  }, { manage: true });
}
