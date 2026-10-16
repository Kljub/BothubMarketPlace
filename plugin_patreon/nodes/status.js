// Node plugin.plugin_patreon.status: the Patreon pledge of a member (the one
// who asked, or config "member") from the last sync. Ports "replied",
// "next", "not_found".
import { lang, record, syncMinutes } from '../services/sync.js';
import { t } from '../services/i18n.js';

const idOf = (v) => String(v ?? '').replace(/[<@!>]/g, '').trim();

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function status(ctx, { config, vars, interaction }) {
  const L = lang(ctx);
  const asked = idOf(config.member);
  const who = /^\d{17,20}$/.test(asked) ? asked : vars['user.id'];
  const rec = who ? await record(ctx, who) : null;
  if (!rec) {
    const text = who === vars['user.id'] ? t(L, 'notfound.self', { min: syncMinutes(ctx) }) : t(L, 'notfound.other', { user: `<@${who}>` });
    if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
    return { port: 'not_found', results: { '': text } };
  }
  const fields = [
    { name: t(L, 'status.state'), value: t(L, `state.${rec.status ?? 'none'}`), inline: true },
    { name: t(L, 'status.tiers'), value: rec.tiers?.join(', ') || t(L, 'status.none'), inline: true },
    { name: t(L, 'status.amount'), value: `${(rec.cents / 100).toFixed(2)}`, inline: true },
    { name: t(L, 'status.lifetime'), value: `${(rec.lifetime / 100).toFixed(2)}`, inline: true },
  ];
  if (rec.since) fields.push({ name: t(L, 'status.since'), value: `<t:${Math.floor(Date.parse(rec.since) / 1000)}:D>`, inline: true });
  const embed = { title: t(L, 'status.title', { name: rec.name || who }), description: `<@${who}>`, fields, color: '#f96854' };
  if (interaction) await ctx.interaction.reply(interaction, { embeds: [embed] }, { ephemeral: true });
  return {
    port: interaction ? 'replied' : 'next',
    results: { '': rec.status ?? '', '.tiers': (rec.tiers ?? []).join(', '), '.amount': (rec.cents / 100).toFixed(2), '.active': String(rec.status === 'active_patron') },
  };
}
