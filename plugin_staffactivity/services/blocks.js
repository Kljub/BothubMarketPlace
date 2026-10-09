// Block behind /duty-on, /duty-idle and /duty-off: sets the status of the
// member who runs it (config.status: on, idle, off; config.note).
import { isStaff, setStatus, texts, updateBoard } from './board.js';

async function answer(ctx, interaction, ok, text) {
  if (interaction) {
    await ctx.interaction.reply(interaction, text, { ephemeral: true });
    return { port: ok ? 'replied' : 'failed', results: { '': text } };
  }
  return { port: ok ? 'next' : 'failed', results: { '': text } };
}

export async function setStatusBlock(ctx, { config, vars, interaction }) {
  const t = texts(ctx);
  const guild = vars['server.id'];
  const user = vars['user.id'];
  if (!guild || !user) return answer(ctx, interaction, false, t.noServer);
  const status = ['on', 'idle', 'off'].includes(String(config.status)) ? String(config.status) : 'on';
  if (!(await isStaff(ctx, guild, user))) return answer(ctx, interaction, false, t.notStaff);
  await setStatus(ctx, guild, user, status, config.note);
  await updateBoard(ctx, guild);
  return answer(ctx, interaction, true, t.set[status]);
}
