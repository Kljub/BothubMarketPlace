// Node plugin.plugin_arcenciel.models: lists the checkpoints of Arc en Ciel
// (all, or matching a search term) privately, with a select menu to pick one
// for the member's own images. Results: '' (how many), .current (the
// member's model). Ports: replied, next, not_set_up, failed.
import { ArcError, NOT_SET_UP } from '../services/arc.js';
import { answer } from '../services/flow.js';
import { listFor, modelsMessage, userModel } from '../services/models.js';
import { setting } from '../services/util.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function models(ctx, { config, vars, interaction }) {
  const guildId = String(vars['server.id'] ?? '');
  const userId = String(vars['user.id'] ?? '');
  const query = String(config.search ?? '').trim();
  try {
    const list = await listFor(ctx, userId, query);
    const current = await userModel(ctx, guildId, userId);
    if (interaction) {
      await ctx.interaction.reply(interaction, modelsMessage({ list, page: 0, query, current, color: String(setting(ctx, 'color', '#e879f9')) }), { ephemeral: true });
    }
    return { port: interaction ? 'replied' : 'next', results: { '': String(list.length), '.current': current } };
  } catch (err) {
    if (!(err instanceof ArcError)) throw err;
    await answer(ctx, interaction, `❌ ${err.message}`);
    return { port: interaction ? 'replied' : err.message === NOT_SET_UP ? 'not_set_up' : 'failed', results: { '.error': err.message } };
  }
}
