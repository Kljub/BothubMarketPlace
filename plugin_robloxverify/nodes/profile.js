// Node plugin.plugin_robloxverify.profile: the Roblox profile of a member
// (linked account) or of a username: avatar, names, join date, friends,
// followers, groups. Ports "replied", "next", "not_found", "failed".
import { counts, findUser, groups, headshot, profile, profileUrl, RobloxError } from '../services/roblox.js';
import { t } from '../services/i18n.js';
import { lang, linkOf } from '../services/verify.js';

const opt = (v) => (typeof v === 'string' && !v.startsWith('{') ? v.trim() : '');

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function profileBlock(ctx, { config, vars, interaction }) {
  const L = lang(ctx);
  const say = async (text, port) => {
    if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
    return { port, results: { '': text } };
  };
  const member = opt(config.member).replace(/[<@!>]/g, '');
  const name = opt(config.username);
  try {
    let id = null;
    let discord = null;
    if (name) {
      id = (await findUser(ctx, name))?.id ?? null;
      if (!id) return say(t(L, 'err.notfound', { name: name.slice(0, 40) }), 'not_found');
    } else {
      discord = /^\d{17,20}$/.test(member) ? member : vars['user.id'];
      id = (await linkOf(ctx, discord))?.id ?? null;
      if (!id) return say(t(L, 'update.none', { user: `<@${discord}>` }), 'not_found');
    }
    const [p, pic, c, gs] = await Promise.all([profile(ctx, id), headshot(ctx, id), counts(ctx, id), groups(ctx, id).catch(() => [])]);
    if (!p) return say(t(L, 'err.notfound', { name: id }), 'not_found');
    const fields = [
      { name: t(L, 'profile.created'), value: p.created ? `<t:${Math.floor(Date.parse(p.created) / 1000)}:D>` : '—', inline: true },
      { name: t(L, 'profile.friends'), value: String(c.friends), inline: true },
      { name: t(L, 'profile.followers'), value: c.followers.toLocaleString('en-US'), inline: true },
    ];
    if (gs.length) fields.push({ name: `${t(L, 'profile.groups')} (${gs.length})`, value: gs.slice(0, 5).map((g) => `${g.name} · ${g.role}`).join('\n').slice(0, 1024) });
    if (discord) fields.push({ name: t(L, 'profile.discord'), value: `<@${discord}>`, inline: true });
    const embed = {
      color: '#e2231a',
      title: `${p.displayName}${p.verified ? ' ☑️' : ''}`,
      url: profileUrl(p.id),
      description: `@${p.name} · ID ${p.id}${p.description ? `\n\n${p.description.slice(0, 300)}` : ''}`,
      fields,
      footer: { text: 'Roblox' },
    };
    if (pic) embed.thumbnail_url = pic;
    if (interaction) await ctx.interaction.reply(interaction, { embeds: [embed] });
    return { port: interaction ? 'replied' : 'next', results: { '': p.name, '.id': p.id, '.display': p.displayName, '.url': profileUrl(p.id), '.avatar': pic } };
  } catch (err) {
    if (!(err instanceof RobloxError)) throw err;
    return say(`❌ ${t(L, err.key, err.params)}`, 'failed');
  }
}
