// Node plugin.plugin_riotstats.stats (/valorant, /lol, /tft, /lor): the
// profile of a Riot ID (or of a linked member) in one game. With a command it
// answers itself with an embed.
// Results: '' (Riot ID), .rank, .points (RR or LP), .winrate (TFT: top 4 %),
// .kda (TFT: average place), .games, .error.
// Ports: replied, next, not_found, not_set_up, failed.
import { guarded, target } from '../services/answer.js';
import { GAMES, stats as show } from '../services/games.js';
import { riotId } from '../services/henrik.js';
import { lang } from '../services/i18n.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function stats(ctx, { config, vars, interaction }) {
  const L = lang(ctx);
  const game = GAMES.includes(config.game) ? config.game : 'valorant';
  return guarded(ctx, L, interaction, async () => {
    const acc = await target(ctx, L, game, config, vars);
    const out = await show(ctx, L, game, acc);
    if (interaction) await ctx.interaction.reply(interaction, out.message);
    return { port: interaction ? 'replied' : 'next', results: { '': riotId(acc), ...out.results } };
  });
}
