// Service "accounts": Discord user <-> Jellyfin user, linked with Jellyfin
// Quick Connect: the bot asks the server for a 6-digit code (with the admin's
// API key), the member enters it in Jellyfin (profile → Quick Connect), the
// task "link_poll" sees the approval, reads the user and logs the new session
// out at once. No password and no member token is kept.
// Links hold for every bot of the instance (ctx.globalStorage, permission
// "storage.global"), like the Jellyfin servers (admin secrets):
//   acc:<discordId>      {server, userId, username, linkedAt}
//   jfuser:<userId>      discordId   (webhook PlaybackStart -> member)
// Per bot (ctx.storage):
//   qc:<discordId>       {server, secret, code, guild, expires}  (pending link, 10 min)
//   qcs                  [discordId] pending links
import { jf, normId, SERVERS } from './jellyfin.js';
import { readJson, writeJson } from './storage.js';

const TTL_MS = 10 * 60_000;

const gRead = async (ctx, key) => {
  const raw = await ctx.globalStorage.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** The member's Jellyfin account, or null. */
export const account = (ctx, userId) => gRead(ctx, `acc:${userId}`);

/** The member of a Jellyfin user (webhooks), or null. */
export async function byJellyfinUser(ctx, jellyfinUserId) {
  const id = await ctx.globalStorage.get(`jfuser:${normId(jellyfinUserId)}`);
  return id ? { userId: id, account: await account(ctx, id) } : null;
}

/**
 * Starts Quick Connect on a server (1..5): returns { code, serverName }.
 * Throws an Error with a readable text when the server refuses.
 */
export async function startLink(ctx, userId, guildId, server = 1) {
  const slot = Math.min(Math.max(1, Number(server) || 1), SERVERS.length);
  const info = await jf(ctx, '/System/Info', undefined, slot);
  const res = await jf(ctx, '/QuickConnect/Initiate', undefined, slot, { method: 'POST' });
  if (!res.ok || !res.json?.Secret || !res.json?.Code) {
    if (res.error === 'unauthorized' && info.ok) throw new Error('Quick Connect is off on the Jellyfin server (Dashboard → General → Quick Connect).');
    throw new Error(`Jellyfin did not start Quick Connect (${res.error ?? 'no code'}).`);
  }
  await writeJson(ctx, `qc:${userId}`, { server: slot, secret: String(res.json.Secret), code: String(res.json.Code), guild: guildId, expires: Date.now() + TTL_MS });
  const list = await readJson(ctx, 'qcs', []);
  if (!list.includes(userId)) list.push(userId);
  await writeJson(ctx, 'qcs', list.slice(-100));
  return { code: String(res.json.Code), serverName: String(info.json?.ServerName ?? 'Jellyfin') };
}

/**
 * Checks the pending Quick Connect codes (task "link_poll"). Returns the
 * finished links: [{ userId, guild, account }]. Expired codes are dropped.
 */
export async function pollLinks(ctx) {
  const done = [];
  const keep = [];
  for (const userId of await readJson(ctx, 'qcs', [])) {
    const qc = await readJson(ctx, `qc:${userId}`, null);
    if (!qc || qc.expires < Date.now()) {
      await ctx.storage.delete(`qc:${userId}`);
      continue;
    }
    const state = await jf(ctx, '/QuickConnect/Connect', { secret: qc.secret }, qc.server);
    if (state.status === 404) {
      await ctx.storage.delete(`qc:${userId}`);
      continue;
    }
    if (!state.ok || state.json?.Authenticated !== true) {
      keep.push(userId);
      continue;
    }
    await ctx.storage.delete(`qc:${userId}`);
    const auth = await jf(ctx, '/Users/AuthenticateWithQuickConnect', undefined, qc.server, { method: 'POST', json: { Secret: qc.secret } });
    const user = auth.json?.User;
    if (!auth.ok || !user?.Id) continue;
    // The session Quick Connect made is not needed: log it out again.
    if (auth.json.AccessToken) {
      await ctx.http.secret({ url: SERVERS[qc.server - 1].url, path: '/Sessions/Logout', method: 'POST', query: { ApiKey: String(auth.json.AccessToken) } }).catch(() => undefined);
    }
    const acc = { server: qc.server, userId: normId(user.Id), username: String(user.Name ?? '?'), linkedAt: new Date().toISOString() };
    await ctx.globalStorage.set(`acc:${userId}`, JSON.stringify(acc));
    await ctx.globalStorage.set(`jfuser:${acc.userId}`, userId);
    done.push({ userId, guild: qc.guild, account: acc });
  }
  await writeJson(ctx, 'qcs', keep);
  return done;
}

export async function unlink(ctx, userId) {
  const acc = await account(ctx, userId);
  if (!acc) return null;
  await ctx.globalStorage.delete(`acc:${userId}`);
  await ctx.globalStorage.delete(`jfuser:${acc.userId}`);
  return acc;
}
