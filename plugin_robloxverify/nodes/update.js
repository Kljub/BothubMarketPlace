// Node plugin.plugin_robloxverify.update: gives the roles of a linked member
// again now (rank binds, game passes, nickname), or unlinks the member who
// asked (mode "unlink"). Ports "replied", "next", "not_found", "failed".
import { RobloxError } from '../services/roblox.js';
import { t } from '../services/i18n.js';
import { applyGuild, guildsOf, lang, linkOf, unlink } from '../services/verify.js';

const opt = (v) => (typeof v === 'string' && !v.startsWith('{') ? v.trim() : '');

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function updateBlock(ctx, { config, vars, interaction }) {
  const L = lang(ctx);
  const reply = async (text, port) => {
    if (interaction) await ctx.interaction.editReply(interaction, text);
    return { port: interaction ? 'replied' : port, results: { '': text } };
  };
  if (interaction) await ctx.interaction.deferReply(interaction, { ephemeral: true });
  if (config.mode === 'unlink') return reply(t(L, (await unlink(ctx, vars['user.id'])) ? 'unlink.done' : 'unlink.none'), 'next');
  const asked = opt(config.member).replace(/[<@!>]/g, '');
  const who = /^\d{17,20}$/.test(asked) ? asked : vars['user.id'];
  const link = await linkOf(ctx, who);
  if (!link) return reply(t(L, 'update.none', { user: `<@${who}>` }), 'not_found');
  try {
    const roles = (await applyGuild(ctx, vars['server.id'], who, link)) ?? [];
    for (const g of guildsOf(ctx)) if (g !== vars['server.id']) await applyGuild(ctx, g, who, link);
    const list = roles.map((r) => `<@&${r}>`).join(' ');
    return reply(t(L, 'update.done', { display: link.display, roles: list ? t(L, 'verify.roles', { list }) : '' }), 'next');
  } catch (err) {
    if (!(err instanceof RobloxError)) throw err;
    return reply(`❌ ${t(L, err.key, err.params)}`, 'failed');
  }
}
