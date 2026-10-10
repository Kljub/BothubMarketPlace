// Node plugin.plugin_riotstats.matches (/valorant-matches, /lol-matches,
// /tft-matches): the last matches of a Riot ID (or of a linked member), one
// line each. Results: '' (Riot ID), .count, .error.
// Ports: replied, next, not_found, not_set_up, failed.
import { guarded, target } from '../services/answer.js';
import { GAMES, matches as show } from '../services/games.js';
import { riotId } from '../services/henrik.js';
import { lang } from '../services/i18n.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function matches(ctx, { config, vars, interaction }) {
  const L = lang(ctx);
  const game = GAMES.includes(config.game) ? config.game : 'valorant';
  return guarded(ctx, L, interaction, async () => {
    const acc = await target(ctx, L, game, config, vars);
    const out = await show(ctx, L, game, acc, config.mode);
    if (interaction) await ctx.interaction.reply(interaction, out.message);
    return { port: interaction ? 'replied' : 'next', results: { '': riotId(acc), '.count': String(out.count) } };
  });
}
