// Node plugin.plugin_amp.servers: the shared game servers with state and
// players. Ports "replied", "next", "failed".
import { runBlock } from '../services/blocks.js';
import { t } from '../services/i18n.js';
import { line, stateOf, visible } from '../services/servers.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function serversBlock(ctx, input) {
  return runBlock(ctx, input, async (L) => {
    const list = await visible(ctx);
    const text = list.length ? list.slice(0, 40).map((i) => line(L, i)).join('\n') : t(L, 'list.empty');
    const running = list.filter((i) => stateOf(i) === 'ready').length;
    return {
      message: { embeds: [{ color: '#1e88e5', title: `🎮 ${t(L, 'list.title')} (${running}/${list.length})`, description: text.slice(0, 4000), footer: { text: 'AMP' } }] },
      results: { '': text.slice(0, 4000), '.count': String(list.length), '.running': String(running), '.names': list.map((i) => i.friendly).join(', ').slice(0, 4000) },
    };
  });
}
