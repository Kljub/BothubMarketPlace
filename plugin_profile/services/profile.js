// Service "profile": a profile card per member and server. The values live in
// the plugin's Data Storage variable "member_profile" (one object per member,
// per server; admins see and edit it under Data Storage). Two modals fill it:
// "About" (about me, pronouns, age, location, color) and "Favorites"
// (hobbies, game, movie or series, music, food). Discord allows 5 fields per
// modal, hence two.

const VAR = 'member_profile';

export const SECTIONS = {
  about: {
    title: 'Your profile: about you',
    fields: [
      { key: 'about', label: 'About me', style: 'long', max: 500 },
      { key: 'pronouns', label: 'Pronouns', max: 40 },
      { key: 'age', label: 'Age', max: 3 },
      { key: 'location', label: 'Where you are from', max: 60 },
      { key: 'color', label: 'Color (e.g. #e879f9)', max: 7 },
    ],
  },
  favorites: {
    title: 'Your profile: favorites',
    fields: [
      { key: 'hobbies', label: 'Hobbies', style: 'long', max: 200 },
      { key: 'game', label: 'Favorite game', max: 100 },
      { key: 'movie', label: 'Favorite movie or series', max: 100 },
      { key: 'music', label: 'Favorite music', max: 100 },
      { key: 'food', label: 'Favorite food', max: 100 },
    ],
  },
};

const LABELS = { pronouns: 'Pronouns', age: 'Age', location: 'From', hobbies: 'Hobbies', game: '🎮 Game', movie: '🎬 Movie / series', music: '🎵 Music', food: '🍕 Food' };

// The variable is created once per bot (ctx) and process.
const ready = new WeakSet();
async function ensureVariable(ctx) {
  if (ready.has(ctx)) return;
  await ctx.variables.create({ key: VAR, name: 'Member profile', description: 'Profile card of /profile (one per member and server).', type: 'object', owner: 'member', perServer: true, default: {} });
  ready.add(ctx);
}

/** The member's profile ({} when empty). */
export async function getProfile(ctx, guildId, userId) {
  await ensureVariable(ctx);
  const raw = await ctx.variables.get(VAR, { guildId, userId });
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(String(raw ?? '{}'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Cleans the answer of a modal and stores it into the profile. */
export async function saveSection(ctx, guildId, userId, section, fields) {
  const def = SECTIONS[section];
  if (!def) throw new Error('unknown section');
  const profile = await getProfile(ctx, guildId, userId);
  for (const f of def.fields) {
    let v = String(fields?.[f.key] ?? '').trim().slice(0, f.max);
    if (f.key === 'age' && v && !/^\d{1,3}$/.test(v)) v = '';
    if (f.key === 'color' && v && !/^#?[0-9a-fA-F]{6}$/.test(v)) v = '';
    if (f.key === 'color' && v && !v.startsWith('#')) v = `#${v}`;
    if (v) profile[f.key] = v;
    else delete profile[f.key];
  }
  profile.updatedAt = new Date().toISOString();
  await ctx.variables.set(VAR, profile, { guildId, userId });
  return profile;
}

export async function deleteProfile(ctx, guildId, userId) {
  await ensureVariable(ctx);
  await ctx.variables.reset(VAR, { guildId, userId });
}

export const isEmpty = (profile) => !Object.keys(profile).some((k) => k !== 'updatedAt');

/** The modal of a section, filled with the saved values. */
export function modalFor(section, profile, userId) {
  const def = SECTIONS[section] ?? SECTIONS.about;
  return {
    key: section === 'favorites' ? 'favorites' : 'about',
    data: userId,
    title: def.title,
    fields: def.fields.map((f) => ({ key: f.key, label: f.label, style: f.style ?? 'short', required: false, max: f.max, value: String(profile[f.key] ?? '') })),
  };
}

/** The profile card; own: with edit buttons for its owner. */
export function profileMessage(profile, member, { color, own }) {
  const fields = [];
  for (const key of ['pronouns', 'age', 'location']) if (profile[key]) fields.push({ name: LABELS[key], value: String(profile[key]), inline: true });
  if (profile.hobbies) fields.push({ name: LABELS.hobbies, value: String(profile.hobbies) });
  for (const key of ['game', 'movie', 'music', 'food']) if (profile[key]) fields.push({ name: LABELS[key], value: String(profile[key]), inline: true });
  const embed = {
    color: profile.color || color,
    title: `📇 ${member.displayName}`,
    description: profile.about ? String(profile.about) : undefined,
    thumbnail_url: member.avatar || undefined,
    fields,
    footer: profile.updatedAt ? `Updated ${String(profile.updatedAt).slice(0, 10)}` : undefined,
  };
  const message = { embeds: [embed] };
  if (own) {
    message.components = [[
      { key: 'edit', data: `about:${member.id}`, label: 'About', emoji: '✏️', style: 'secondary' },
      { key: 'edit', data: `favorites:${member.id}`, label: 'Favorites', emoji: '⭐', style: 'secondary' },
      { key: 'remove', data: member.id, label: 'Delete', emoji: '🗑️', style: 'danger' },
    ]];
  }
  return message;
}

/** Name and avatar of a member (falls back to the ID). */
export async function memberOf(ctx, guildId, userId) {
  try {
    const m = await ctx.member.get(guildId, userId);
    return { id: userId, displayName: m.displayName || m.name || userId, avatar: m.avatar || '' };
  } catch {
    return { id: userId, displayName: `<@${userId}>`, avatar: '' };
  }
}
