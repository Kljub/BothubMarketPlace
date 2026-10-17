// Node plugin.plugin_amp.settings: lists the settings of a game server that
// match a search, or sets one to a value (managers only). Ports "replied",
// "next", "failed".
import { opt, runBlock } from '../services/blocks.js';
import { findServer, settings } from '../services/servers.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function settingsBlock(ctx, input) {
  const { config } = input;
  return runBlock(ctx, input, async (L) => {
    const inst = await findServer(ctx, opt(config.server));
    const out = await settings(ctx, L, inst, opt(config.search), opt(config.value));
    const message = out.title ? { embeds: [{ color: '#1e88e5', title: `⚙️ ${out.title}`, description: out.text }] } : out.text;
    return { message, results: { '': out.text } };
  }, { manage: true, ephemeral: true });
}
