// Node plugin.plugin_amp.login: the login panel (state of the connection,
// "Log in to AMP" and "Log out"), privately for managers. Ports "replied",
// "next", "failed".
import { loginOf } from '../services/amp.js';
import { runBlock } from '../services/blocks.js';
import { panelMessage } from '../services/interactions.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function loginBlock(ctx, input) {
  return runBlock(ctx, input, async () => {
    const stored = await loginOf(ctx);
    return { message: await panelMessage(ctx), results: { '': stored ? stored.username : '', '.connected': stored ? 'true' : 'false', '.panel': stored?.name ?? '' } };
  }, { manage: true, ephemeral: true });
}
