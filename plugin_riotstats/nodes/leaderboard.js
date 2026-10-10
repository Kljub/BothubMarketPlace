// Node plugin.plugin_riotstats.leaderboard (/riot-leaderboard): the linked
// members of this server by rank in one game (values saved by the tracker,
// the game commands and /riot-link; no requests).
// Results: '' (the list as text), .count, .error. Ports: replied, next, failed.
import { guarded } from '../services/answer.js';
import { cachedAccount, GAME_NAMES, RANKED, rankView, stateKey } from '../services/games.js';
import { riotId, StatsError } from '../services/henrik.js';
import { lang, t } from '../services/i18n.js';
import { serverLinks } from '../services/links.js';
import { readJson } from '../services/storage.js';
import { setting } from '../services/util.js';

const MEDALS = ['🥇', '🥈', '🥉'];

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function leaderboard(ctx, { config, vars, interaction }) {
  const L = lang(ctx);
  const game = RANKED.includes(config.game) ? config.game : 'valorant';
  return guarded(ctx, L, interaction, async () => {
    const guild = vars['server.id'];
    if (!guild) throw new StatsError('err.server');
    const rows = [];
    for (const l of await serverLinks(ctx, guild)) {
      const acc = await cachedAccount(ctx, game, l);
      const s = acc ? await readJson(ctx, stateKey(game, acc.puuid), null) : null;
      rows.push({ ...l, view: s?.rank ? rankView(L, game, s.rank) : { score: -2, text: t(L, 'lb_unknown') } });
    }
    rows.sort((a, b) => b.view.score - a.view.score);
    const lines = rows.slice(0, 20).map((r, i) => `${MEDALS[i] ?? `${i + 1}.`} <@${r.user}> · ${riotId(r)} — ${r.view.text}`);
    const text = lines.join('\n') || t(L, 'lb_none');
    if (interaction) {
      await ctx.interaction.reply(interaction, {
        embeds: [{ color: String(setting(ctx, 'color', '#ff4655')), title: `🏆 ${t(L, 'lb_title', { game: GAME_NAMES[game] })}`, description: text, footer: { text: t(L, 'lb_footer') } }],
      });
    }
    return { port: interaction ? 'replied' : 'next', results: { '': text, '.count': String(rows.length) } };
  });
}
