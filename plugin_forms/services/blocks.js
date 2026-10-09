// The blocks behind /form and /form-panel. With a command they answer it
// themselves (port "replied"); in other graphs they hand on (next / failed).
import { formByName, formsOf, panelMessage } from './forms.js';
import { openForm } from './interactions.js';

async function answer(ctx, interaction, ok, text) {
  if (interaction && text) {
    await ctx.interaction.reply(interaction, text, { ephemeral: true });
    return { port: ok ? 'replied' : 'failed', results: { '': text } };
  }
  return { port: ok ? 'next' : 'failed', results: { '': text } };
}

const known = (ctx, guild) => formsOf(ctx, guild).map((f) => `\`${f.name}\``).join(', ') || 'none yet (Plugins → Forms)';

/** Opens a form for the member who ran the command (needs a command or button). */
export async function openBlock(ctx, { config, vars, interaction }) {
  const guild = vars['server.id'];
  if (!guild) return answer(ctx, interaction, false, '❌ Only on a server.');
  if (!interaction) return answer(ctx, null, false, 'A form opens only from a command or button.');
  const res = await openForm(ctx, interaction, guild, vars['user.id'], config.name);
  if (!res.ok && res.text.includes('no such')) return answer(ctx, interaction, false, `❌ There is no form \`${String(config.name ?? '')}\`. Forms: ${known(ctx, guild)}.`);
  return res.ok ? { port: 'replied', results: { '': 'opened' } } : answer(ctx, interaction, false, res.text);
}

/** Posts the panel of a form (text + button) in this channel or a picked one. */
export async function panelBlock(ctx, { config, vars, interaction }) {
  const guild = vars['server.id'];
  const channel = String(config.channel ?? '').replace(/\D/g, '') || vars['channel.id'];
  if (!guild || !channel) return answer(ctx, interaction, false, '❌ Only on a server.');
  const form = formByName(ctx, guild, config.name);
  if (!form) return answer(ctx, interaction, false, `❌ There is no form \`${String(config.name ?? '')}\`. Forms: ${known(ctx, guild)}.`);
  await ctx.message.send(channel, panelMessage(form));
  return answer(ctx, interaction, true, `✅ The panel of \`${form.name}\` is posted.`);
}
