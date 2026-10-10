// Node plugin.plugin_riotstats.link (/riot-link, /riot-unlink): a member
// links their Riot ID on this server (for the game commands without a name,
// the leaderboard and the tracker) or removes the link. One Riot ID serves
// every Riot game.
// Results: '' (Riot ID), .games (games found), .error.
// Ports: replied, next, not_found, not_set_up, failed.
import { guarded } from '../services/answer.js';
import { accountFor, currentRank, GAME_NAMES, RANKED, rememberRank } from '../services/games.js';
import { parseRiotId, riotId, StatsError } from '../services/henrik.js';
import { lang, t } from '../services/i18n.js';
import { MAX_LINKS, removeLink, setLink } from '../services/links.js';
import { setting } from '../services/util.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function link(ctx, { config, vars, interaction }) {
  const L = lang(ctx);
  const say = async (text) => {
    if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
  };
  return guarded(ctx, L, interaction, async () => {
    const guild = vars['server.id'];
    const user = vars['user.id'];
    if (!guild || !user) throw new StatsError('err.server');
    if (config.action === 'unlink') {
      const had = await removeLink(ctx, guild, user);
      await say(t(L, had ? 'unlinked' : 'unlinked_none'));
      return { port: interaction ? 'replied' : 'next', results: { '': '' } };
    }
    const id = parseRiotId(config.player);
    if (!id) throw new StatsError('err.bad_id');
    // The account in every ranked game with a key; the rank at once for the leaderboard.
    const found = [];
    let name = null;
    let firstError = null;
    await Promise.all(RANKED.map(async (game) => {
      try {
        const acc = await accountFor(ctx, game, id);
        name ??= acc;
        const rank = await currentRank(ctx, game, acc).catch(() => null);
        if (rank) await rememberRank(ctx, game, acc.puuid, rank);
        found.push(game);
      } catch (err) {
        if (!(err instanceof StatsError)) throw err;
        if (!err.code.startsWith('err.not_set_up')) firstError ??= err;
      }
    }));
    if (!name) throw firstError ?? new StatsError('err.not_set_up_any');
    const games = RANKED.filter((g) => found.includes(g));
    if (!(await setLink(ctx, guild, user, name))) throw new StatsError('err.full', { max: MAX_LINKS });
    const channel = setting(ctx, 'channel', null)?.id;
    const tracked = games.filter((g) => setting(ctx, `track_${g}`, true) !== false);
    await say([
      t(L, 'linked', { id: riotId(name), games: games.map((g) => GAME_NAMES[g]).join(', ') }),
      channel && tracked.length ? t(L, 'linked_track', { channel }) : '',
    ].filter(Boolean).join('\n'));
    return { port: interaction ? 'replied' : 'next', results: { '': riotId(name), '.games': games.join(',') } };
  });
}
