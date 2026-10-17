// Node plugin.plugin_amp.info: state, uptime, CPU, memory, players and
// address of a game server; managers get start / stop / restart / backup
// buttons. Ports "replied", "next", "failed".
import { opt, runBlock } from '../services/blocks.js';
import { t } from '../services/i18n.js';
import { findServer, infoMessage, mayManage } from '../services/servers.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function infoBlock(ctx, input) {
  const { config, vars } = input;
  return runBlock(ctx, input, async (L) => {
    const inst = await findServer(ctx, opt(config.server));
    const guildId = vars['server.id'] || null;
    const buttons = !!guildId && config.buttons !== false && (await mayManage(ctx, { userId: String(vars['user.id'] ?? ''), guildId, channelId: vars['channel.id'] || null }));
    const { message, state } = await infoMessage(ctx, L, inst, buttons);
    const fields = message.embeds[0].fields;
    const field = (key) => fields.find((f) => f.name.startsWith(t(L, key)))?.value ?? '';
    return {
      message,
      results: { '': inst.friendly, '.id': inst.id, '.state': state, '.state_text': t(L, `state.${state}`), '.players': field('info.players'), '.cpu': field('info.cpu'), '.ram': field('info.ram'), '.game': inst.module },
    };
  });
}
