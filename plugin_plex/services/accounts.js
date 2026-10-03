// Service "accounts": Discord user <-> Plex account (ctx.storage) and the
// plex.tv PIN login (https://plex.tv, "http.outbound", services.hosts).
//   acc:<discordId>      {username, uuid, email, linkedAt}
//   plexname:<lower>     discordId   (webhook "media.play" -> member)
//   pin:<discordId>      {id, code, guild, expires}  (pending link, 15 min)
import { readJson, writeJson } from './storage.js';

const PLEX_TV = 'https://plex.tv/api/v2';
const PIN_TTL_MS = 15 * 60_000;

/** Same for every bot of this instance: plex.tv shows it as the app name. */
export const clientId = (ctx) => `bothub-plex-${ctx.botId}`;

const plexHeaders = (ctx, token) => ({
  Accept: 'application/json',
  'X-Plex-Client-Identifier': clientId(ctx),
  'X-Plex-Product': 'BotHub',
  ...(token ? { 'X-Plex-Token': token } : {}),
});

export const account = (ctx, userId) => readJson(ctx, `acc:${userId}`, null);

export async function byPlexName(ctx, name) {
  const id = await ctx.storage.get(`plexname:${String(name).toLowerCase().slice(0, 100)}`);
  return id ? { userId: id, account: await account(ctx, id) } : null;
}

/** Starts the plex.tv login: returns the URL the member opens. */
export async function startLink(ctx, userId, guildId) {
  const res = await ctx.http.post(`${PLEX_TV}/pins`, undefined, { headers: { ...plexHeaders(ctx), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'strong=true' });
  const pin = res.json;
  if (res.status >= 400 || !pin?.id || !pin?.code) throw new Error(`plex.tv: HTTP ${res.status}`);
  await writeJson(ctx, `pin:${userId}`, { id: pin.id, code: pin.code, guild: guildId, expires: Date.now() + PIN_TTL_MS });
  await addPending(ctx, userId);
  const q = new URLSearchParams({ clientID: clientId(ctx), code: pin.code, 'context[device][product]': 'BotHub' });
  return `https://app.plex.tv/auth#?${q.toString()}`;
}

async function pendingList(ctx) {
  return readJson(ctx, 'pins', []);
}
async function addPending(ctx, userId) {
  const list = await pendingList(ctx);
  if (!list.includes(userId)) list.push(userId);
  await writeJson(ctx, 'pins', list.slice(-100));
}

/**
 * Checks the pending logins (task "link_poll"). Returns the finished links:
 * [{ userId, guild, account }]. Expired PINs are dropped.
 */
export async function pollLinks(ctx) {
  const done = [];
  const keep = [];
  for (const userId of await pendingList(ctx)) {
    const pin = await readJson(ctx, `pin:${userId}`, null);
    if (!pin || pin.expires < Date.now()) {
      await ctx.storage.delete(`pin:${userId}`);
      continue;
    }
    const res = await ctx.http.get(`${PLEX_TV}/pins/${encodeURIComponent(pin.id)}`, { headers: plexHeaders(ctx) });
    const token = res.json?.authToken;
    if (!token) {
      keep.push(userId);
      continue;
    }
    const me = await ctx.http.get(`${PLEX_TV}/user`, { headers: plexHeaders(ctx, token) });
    await ctx.storage.delete(`pin:${userId}`);
    if (me.status >= 400 || !me.json?.username) continue;
    // The member's own plex.tv token is not stored: only who they are.
    const acc = { username: String(me.json.username), uuid: String(me.json.uuid ?? ''), email: String(me.json.email ?? ''), linkedAt: new Date().toISOString() };
    await writeJson(ctx, `acc:${userId}`, acc);
    await ctx.storage.set(`plexname:${acc.username.toLowerCase().slice(0, 100)}`, userId);
    done.push({ userId, guild: pin.guild, account: acc });
  }
  await writeJson(ctx, 'pins', keep);
  return done;
}

export async function unlink(ctx, userId) {
  const acc = await account(ctx, userId);
  if (!acc) return null;
  await ctx.storage.delete(`acc:${userId}`);
  await ctx.storage.delete(`plexname:${acc.username.toLowerCase().slice(0, 100)}`);
  return acc;
}
