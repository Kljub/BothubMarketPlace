// Service "answer": what every block needs: whose account to show and the
// reply on errors.
import { accountFor } from './games.js';
import { parseRiotId, StatsError } from './henrik.js';
import { t } from './i18n.js';
import { getLink } from './links.js';

/** A user ID from "<@123>", "123" or "". */
export const userId = (v) => /^<?@?!?(\d{15,22})>?$/.exec(String(v ?? '').trim())?.[1] ?? '';

/**
 * The account to show in a game: the Riot ID typed, else the linked one of
 * the member named, else the caller's linked one.
 */
export async function target(ctx, L, game, config, vars) {
  const typed = String(config.player ?? '').trim();
  if (typed) {
    const id = parseRiotId(typed);
    if (!id) throw new StatsError('err.bad_id');
    return accountFor(ctx, game, id);
  }
  const guild = vars['server.id'];
  const member = userId(config.member);
  const self = vars['user.id'];
  const who = member || self;
  const l = guild && who ? await getLink(ctx, guild, who) : null;
  if (!l) throw new StatsError(member ? 'err.not_linked' : 'err.bad_id', { who: member === self ? t(L, 'you') : `<@${member}>` });
  return accountFor(ctx, game, l);
}

/** Port of an error. */
export function portOf(err) {
  if (['err.not_found', 'err.no_data', 'err.bad_id', 'err.not_linked', 'err.no_server'].includes(err.code)) return 'not_found';
  if (err.code.startsWith('err.not_set_up')) return 'not_set_up';
  return 'failed';
}

/** Runs a block body; StatsErrors become an ephemeral reply and a port. */
export async function guarded(ctx, L, interaction, body) {
  try {
    return await body();
  } catch (err) {
    if (!(err instanceof StatsError)) throw err;
    const text = t(L, err.code, { id: '?', ...err.params });
    if (interaction) await ctx.interaction.reply(interaction, `❌ ${text}`, { ephemeral: true });
    return { port: interaction ? 'replied' : portOf(err), results: { '.error': text } };
  }
}
