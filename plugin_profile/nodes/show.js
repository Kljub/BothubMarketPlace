// Node plugin.plugin_profile.show: the profile card of a member (the node's
// user, else the one who ran the command). Own profiles get edit buttons.
// Results: '' (display name), .about, .empty (true/false). Ports: replied,
// next, empty.
import { getProfile, isEmpty, memberOf, profileMessage } from '../services/profile.js';
import { setting } from '../services/util.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function show(ctx, { config, vars, interaction }) {
  const guildId = String(vars['server.id'] ?? '');
  const me = String(vars['user.id'] ?? '');
  const target = String(config.user ?? '').trim() || me;
  if (!guildId || !/^\d{17,20}$/.test(target)) {
    if (interaction) await ctx.interaction.reply(interaction, '❌ Profiles work on a server only.', { ephemeral: true });
    return { port: interaction ? 'replied' : 'empty', results: { '.empty': 'true' } };
  }
  const profile = await getProfile(ctx, guildId, target);
  const member = await memberOf(ctx, guildId, target);
  const empty = isEmpty(profile);
  const results = { '': member.displayName, '.about': String(profile.about ?? ''), '.empty': String(empty) };
  if (interaction) {
    if (empty) {
      const text = target === me ? '📇 You have no profile yet. Create it with /profile-edit.' : `📇 **${member.displayName}** has no profile yet.`;
      await ctx.interaction.reply(interaction, text, { ephemeral: true });
    } else {
      await ctx.interaction.reply(interaction, profileMessage(profile, member, { color: String(setting(ctx, 'color', '#e879f9')), own: target === me }));
    }
    return { port: 'replied', results };
  }
  return { port: empty ? 'empty' : 'next', results };
}
