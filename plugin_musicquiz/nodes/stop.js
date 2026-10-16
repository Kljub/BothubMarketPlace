// Node plugin.plugin_musicquiz.stop: ends the quiz of the server early
// (the host at once, others a few minutes after the last round started).
import { stopGame } from '../services/game.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function stop(ctx, { vars, interaction }) {
  const text = await stopGame(ctx, vars['server.id'], vars['user.id']);
  if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
  return { port: interaction ? 'replied' : 'next', results: { '': text } };
}
