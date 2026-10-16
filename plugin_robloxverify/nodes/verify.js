// Node plugin.plugin_robloxverify.verify: /roblox-verify [username]. Step 1
// gives a phrase for the Roblox profile, step 2 (button "Done" or the
// command again) checks it and gives the roles. Ports "replied", "next"
// (linked), "pending" (waiting for the phrase), "failed".
import { answer } from '../services/interactions.js';
import { RobloxError } from '../services/roblox.js';
import { t } from '../services/i18n.js';
import { lang, verify } from '../services/verify.js';

const opt = (v) => (typeof v === 'string' && !v.startsWith('{') ? v.trim() : '');

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function verifyBlock(ctx, { config, vars, interaction }) {
  const L = lang(ctx);
  const guild = vars['server.id'];
  if (!guild) return { port: 'failed', results: { '': t(L, 'err.server') } };
  if (interaction) await ctx.interaction.deferReply(interaction, { ephemeral: true });
  let out;
  try {
    out = await verify(ctx, guild, vars['user.id'], opt(config.username));
  } catch (err) {
    if (!(err instanceof RobloxError)) throw err;
    out = { text: `❌ ${t(L, err.key, err.params)}` };
  }
  if (interaction) await ctx.interaction.editReply(interaction, answer(ctx, out));
  const port = interaction ? 'replied' : out.linked ? 'next' : out.pending ? 'pending' : 'failed';
  return { port, results: { '': out.text, '.linked': String(!!out.linked), '.roblox': out.link?.name ?? '' } };
}
