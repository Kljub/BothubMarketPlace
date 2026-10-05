// The buttons under an own profile card and the two edit modals. Only the
// owner of a profile may use its buttons.
import { deleteProfile, getProfile, memberOf, modalFor, profileMessage, saveSection } from './profile.js';
import { setting } from './util.js';

const color = (ctx) => String(setting(ctx, 'color', '#e879f9'));

async function onlyOwner(ctx, ev, ownerId) {
  if (ev.user.id === ownerId) return true;
  await ctx.interaction.reply(ev.handle, '❌ This is not your profile. Use /profile-edit for your own.', { ephemeral: true });
  return false;
}

export const components = {
  async edit(ctx, ev) {
    const [section, owner] = String(ev.data).split(':');
    if (!(await onlyOwner(ctx, ev, owner))) return;
    const profile = await getProfile(ctx, ev.guildId, owner);
    await ctx.interaction.showModal(ev.handle, modalFor(section, profile, owner));
  },
  async remove(ctx, ev) {
    if (!(await onlyOwner(ctx, ev, ev.data))) return;
    await deleteProfile(ctx, ev.guildId, ev.data);
    await ctx.interaction.update(ev.handle, { content: '🗑️ Profile deleted.', embeds: [], components: [] });
  },
};

async function saved(ctx, ev, section) {
  if (!(await onlyOwner(ctx, ev, ev.data))) return;
  const profile = await saveSection(ctx, ev.guildId, ev.user.id, section, ev.fields);
  const member = await memberOf(ctx, ev.guildId, ev.user.id);
  await ctx.interaction.reply(ev.handle, { content: '✅ Profile saved.', ...profileMessage(profile, member, { color: color(ctx), own: true }) }, { ephemeral: true });
}

export const modals = {
  about: (ctx, ev) => saved(ctx, ev, 'about'),
  favorites: (ctx, ev) => saved(ctx, ev, 'favorites'),
};
