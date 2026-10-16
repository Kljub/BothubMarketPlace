// Node plugin.plugin_musicquiz.top: the server's music quiz leaderboard
// (points, right answers or quiz wins).
import { lang, leaderboard } from '../services/game.js';
import { t } from '../services/i18n.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function top(ctx, { config, vars, interaction }) {
  const L = lang(ctx);
  const by = ['points', 'correct', 'wins'].includes(config.by) ? config.by : 'points';
  const list = (await leaderboard(ctx, vars['server.id'], by)).slice(0, 10);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = list.map((e, i) => t(L, 'top.line', { rank: medals[i] ?? `**${i + 1}.**`, user: `<@${e.id}>`, points: e.p, correct: e.c, wins: e.w }));
  const text = lines.join('\n') || t(L, 'top.empty');
  if (interaction) await ctx.interaction.reply(interaction, { embeds: [{ title: t(L, 'top.title'), description: text, color: '#eab308' }] });
  return { port: interaction ? 'replied' : 'next', results: { '': text, '.first': list[0] ? list[0].id : '' } };
}
