// /ask and /ask-reset. The answer takes longer than a block may run, so
// /ask answers at once ("thinking") and the rest runs on in the plugin
// process, then edits that answer (the handle lives 15 minutes). In an event
// (e.g. "AI: answer mentions") "Post the answer" does the same with a
// message in the event's channel.
import { ask, clip, forget } from './ai.js';

const yes = (v) => [true, 'true', 'yes', '1'].includes(typeof v === 'string' ? v.toLowerCase() : v);

export async function askBlock(ctx, { config, vars, interaction }) {
  const user = vars['user.id'] ?? '';
  const question = String(config.question ?? '').trim().slice(0, 4000);
  if (!question) {
    if (interaction) await ctx.interaction.reply(interaction, '❌ Ask something.', { ephemeral: true });
    return { port: 'failed', results: { '': 'empty question' } };
  }
  const channel = vars['channel.id'];
  if (!interaction && yes(config.reply) && channel) {
    void ask(ctx, user, question, { web: yes(config.web) })
      .then((answer) => ctx.message.send(channel, `🤖 <@${user}> ${clip(answer)}`))
      .catch((err) => ctx.message.send(channel, `❌ ${err.message}`).catch(() => undefined));
    return { port: 'replied', results: { '': '' } };
  }
  if (!interaction) {
    // In a graph without a command: wait for the answer (the block may time out on slow AIs).
    try {
      return { port: 'next', results: { '': clip(await ask(ctx, user, question, { web: yes(config.web) })) } };
    } catch (err) {
      return { port: 'failed', results: { '': err.message } };
    }
  }
  await ctx.interaction.deferReply(interaction);
  void ask(ctx, user, question, { web: yes(config.web) })
    .then((answer) => ctx.interaction.editReply(interaction, `🤖 ${clip(answer)}`))
    .catch((err) => ctx.interaction.editReply(interaction, `❌ ${err.message}`).catch(() => undefined));
  return { port: 'replied', results: { '': '' } };
}

export async function resetBlock(ctx, { vars, interaction }) {
  await forget(ctx, vars['user.id'] ?? '');
  if (interaction) await ctx.interaction.reply(interaction, '🧹 The AI forgot your conversation.', { ephemeral: true });
  return { port: interaction ? 'replied' : 'next', results: { '': '' } };
}
