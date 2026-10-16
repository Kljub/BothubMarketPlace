// Service "roblox": the public Roblox web APIs (no key): users, groups,
// game passes, avatar pictures, friends and followers.

export class RobloxError extends Error {
  constructor(key, params = {}) {
    super(key);
    this.key = key;
    this.params = params;
  }
}

async function get(ctx, url, query) {
  const res = await ctx.http.get(url, query ? { query } : undefined).catch(() => null);
  if (!res) throw new RobloxError('err.api');
  if (res.status === 404) return null;
  if (res.status === 429) throw new RobloxError('err.busy');
  if (res.status !== 200 || !res.json) throw new RobloxError('err.api');
  return res.json;
}

/** { id, name, displayName } of a username (or a user ID); null when there is none. */
export async function findUser(ctx, input) {
  const s = String(input ?? '').trim().replace(/^@/, '');
  const url = s.match(/roblox\.com\/users\/(\d{1,15})/i)?.[1];
  if (url || /^\d{1,15}$/.test(s)) {
    const u = await profile(ctx, url ?? s);
    return u ? { id: u.id, name: u.name, displayName: u.displayName } : null;
  }
  if (!/^[A-Za-z0-9_]{3,20}$/.test(s)) return null;
  const res = await ctx.http.post('https://users.roblox.com/v1/usernames/users', { usernames: [s], excludeBannedUsers: true }).catch(() => null);
  if (!res) throw new RobloxError('err.api');
  if (res.status === 429) throw new RobloxError('err.busy');
  const u = res.json?.data?.[0];
  return u?.id ? { id: String(u.id), name: String(u.name), displayName: String(u.displayName ?? u.name) } : null;
}

/** A user's profile: { id, name, displayName, description, created, banned, verified }. */
export async function profile(ctx, id) {
  const u = await get(ctx, `https://users.roblox.com/v1/users/${encodeURIComponent(id)}`);
  if (!u?.id) return null;
  return { id: String(u.id), name: String(u.name), displayName: String(u.displayName ?? u.name), description: String(u.description ?? ''), created: u.created ?? null, banned: u.isBanned === true, verified: u.hasVerifiedBadge === true };
}

/** Group ID -> rank (0 = not in the group). */
export async function groupRanks(ctx, id) {
  const json = await get(ctx, `https://groups.roblox.com/v2/users/${encodeURIComponent(id)}/groups/roles`);
  return new Map((json?.data ?? []).map((x) => [String(x.group?.id), Number(x.role?.rank) || 0]));
}

/** The groups with names: [{ id, name, role, rank }]. */
export async function groups(ctx, id) {
  const json = await get(ctx, `https://groups.roblox.com/v2/users/${encodeURIComponent(id)}/groups/roles`);
  return (json?.data ?? []).map((x) => ({ id: String(x.group?.id), name: String(x.group?.name ?? ''), role: String(x.role?.name ?? ''), rank: Number(x.role?.rank) || 0 }));
}

/** Does the user own the game pass? (The inventory must not be private.) */
export async function ownsPass(ctx, id, passId) {
  const json = await get(ctx, `https://inventory.roblox.com/v1/users/${encodeURIComponent(id)}/items/GamePass/${encodeURIComponent(passId)}`);
  return Array.isArray(json?.data) && json.data.length > 0;
}

/** The avatar headshot picture address, '' when none. */
export async function headshot(ctx, id) {
  const json = await get(ctx, 'https://thumbnails.roblox.com/v1/users/avatar-headshot', { userIds: String(id), size: '150x150', format: 'Png' }).catch(() => null);
  const url = json?.data?.[0]?.imageUrl;
  return typeof url === 'string' && url.startsWith('https://') ? url : '';
}

/** Friends and followers. */
export async function counts(ctx, id) {
  const [f, fo] = await Promise.all([
    get(ctx, `https://friends.roblox.com/v1/users/${encodeURIComponent(id)}/friends/count`).catch(() => null),
    get(ctx, `https://friends.roblox.com/v1/users/${encodeURIComponent(id)}/followers/count`).catch(() => null),
  ]);
  return { friends: Number(f?.count) || 0, followers: Number(fo?.count) || 0 };
}

export const profileUrl = (id) => `https://www.roblox.com/users/${id}/profile`;
