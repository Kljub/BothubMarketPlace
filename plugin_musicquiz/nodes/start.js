// Node plugin.plugin_musicquiz.start: starts a music quiz in the channel of
// the command (services/game.js). The member must be in a voice channel;
// the Music module plays the clips there. Ports: "replied" (command),
// "next", "failed" (result .error).
import { lang, QuizError, startGame } from '../services/game.js';
import { SOURCES } from '../services/deezer.js';
import { t } from '../services/i18n.js';
import { setting } from '../services/util.js';

/** An option that was left empty may come as "{option_x}". */
const opt = (v) => (typeof v === 'string' && !v.startsWith('{') ? v.trim() : '');

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function start(ctx, { config, vars, interaction }) {
  const L = lang(ctx);
  const source = opt(config.genre) || setting(ctx, 'source', 'charts');
  const mode = opt(config.mode) || setting(ctx, 'mode', 'title');
  const input = {
    guild: vars['server.id'],
    channel: vars['channel.id'],
    host: vars['user.id'],
    source: source in SOURCES ? source : 'charts',
    playlist: opt(config.playlist),
    rounds: Number(opt(config.rounds)) || Number(setting(ctx, 'rounds', 10)) || 10,
    mode: ['title', 'artist', 'mixed'].includes(mode) ? mode : 'title',
  };
  // Loading the songs takes a moment: answer Discord first.
  if (interaction) await ctx.interaction.deferReply(interaction, { ephemeral: true });
  try {
    const game = await startGame(ctx, input);
    const text = t(L, 'start.ok', { channel: game.ch, rounds: game.r.length });
    if (interaction) await ctx.interaction.editReply(interaction, text);
    return { port: interaction ? 'replied' : 'next', results: { '': text, '.rounds': String(game.r.length) } };
  } catch (err) {
    if (!(err instanceof QuizError)) throw err;
    const text = `❌ ${t(L, err.key, err.params)}`;
    if (interaction) await ctx.interaction.editReply(interaction, text);
    return { port: 'failed', results: { '.error': text } };
  }
}
