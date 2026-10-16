// Node plugin.plugin_patreon.sync_now: starts a full Patreon sync now and
// works on it for a few seconds (the rest follows every minute).
import { lang, startPass, tick } from '../services/sync.js';
import { PatreonError } from '../services/patreon.js';
import { t } from '../services/i18n.js';
import { readJson } from '../services/storage.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function syncNow(ctx, { interaction }) {
  const L = lang(ctx);
  if (interaction) await ctx.interaction.deferReply(interaction, { ephemeral: true });
  let text;
  let port = 'next';
  try {
    if (!(await startPass(ctx))) {
      const s = await readJson(ctx, 'sync', {});
      text = t(L, 'sync.busy', { patrons: s.patrons ?? 0 });
    } else {
      const s = await tick(ctx);
      text = t(L, s.running ? 'sync.started' : 'sync.done', { patrons: s.patrons, linked: s.linked, changed: s.changed });
    }
  } catch (err) {
    if (!(err instanceof PatreonError)) throw err;
    text = `❌ ${t(L, err.key)}`;
    port = 'failed';
  }
  if (interaction) await ctx.interaction.editReply(interaction, text);
  return { port: interaction && port === 'next' ? 'replied' : port, results: { '': text } };
}
