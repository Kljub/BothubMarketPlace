// Service "blocks": what the blocks of the plugin share. A block answers the
// command itself when it runs from one (port "replied"), else it only
// leaves results (port "next"); problems go to port "failed" with the text
// as result.
import { lang, t } from './i18n.js';
import { errorText } from './interactions.js';
import { mayManage } from './servers.js';

/** A config value; an option that was left out stays "{option_x}" and counts as empty. */
export const opt = (v) => (typeof v === 'string' && !/^\{[^}]*\}$/.test(v.trim()) ? v.trim() : '');

/**
 * Runs a block body: fn(L) answers { message, results, ephemeral }.
 * manage: only members of the setting "managers" may use it.
 */
export async function runBlock(ctx, { vars, interaction }, fn, { manage = false, ephemeral = false } = {}) {
  const L = lang(ctx);
  const fail = async (text) => {
    if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
    return { port: 'failed', results: { '': text, '.error': text } };
  };
  if (manage) {
    const guildId = vars['server.id'] || null;
    if (!guildId) return fail(`❌ ${t(L, 'err.server')}`);
    if (!(await mayManage(ctx, { userId: String(vars['user.id'] ?? ''), guildId, channelId: vars['channel.id'] || null }))) return fail(`❌ ${t(L, 'err.access')}`);
  }
  try {
    if (interaction) await ctx.interaction.deferReply(interaction, { ephemeral }).catch(() => undefined);
    const out = await fn(L);
    if (interaction) await ctx.interaction.editReply(interaction, out.message);
    return { port: interaction ? 'replied' : 'next', results: out.results ?? {} };
  } catch (err) {
    const text = errorText(L, err);
    if (interaction) await ctx.interaction.editReply(interaction, text).catch(() => undefined);
    return { port: 'failed', results: { '': text, '.error': text } };
  }
}
