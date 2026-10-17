// Node plugin.plugin_amp.backup: starts a backup of a game server (managers
// only). Ports "replied", "next", "failed".
import { opt, runBlock } from '../services/blocks.js';
import { t } from '../services/i18n.js';
import { backup, findServer } from '../services/servers.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function backupBlock(ctx, input) {
  const { config, vars } = input;
  return runBlock(ctx, input, async (L) => {
    const inst = await findServer(ctx, opt(config.server));
    const title = (opt(config.title) || `Discord ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`).slice(0, 100);
    await backup(ctx, inst, title, String(vars['user.name'] || vars['user.id'] || 'Discord'));
    const text = t(L, 'backup.done', { name: inst.friendly, title });
    return { message: text, results: { '': text, '.server': inst.friendly, '.title': title } };
  }, { manage: true });
}
