// Service "links": members link their Riot ID (/riot-link), per server.
// Storage: "l:<guild>:<user>" = { name, tag } (the Riot ID; each game finds its account),
// "li:<guild>" = [user IDs], "lg" = [guild IDs with links].
import { readJson, writeJson } from './storage.js';

export const MAX_LINKS = 200;

export const getLink = (ctx, guild, user) => readJson(ctx, `l:${guild}:${user}`, null);

/** Links a member; false when the server is full. */
export async function setLink(ctx, guild, user, acc) {
  const ids = await readJson(ctx, `li:${guild}`, []);
  if (!ids.includes(user)) {
    if (ids.length >= MAX_LINKS) return false;
    ids.push(user);
    await writeJson(ctx, `li:${guild}`, ids);
  }
  const guilds = await readJson(ctx, 'lg', []);
  if (!guilds.includes(guild)) await writeJson(ctx, 'lg', [...guilds, guild]);
  await writeJson(ctx, `l:${guild}:${user}`, { name: acc.name, tag: acc.tag });
  return true;
}

/** Removes a member's link; false when there was none. */
export async function removeLink(ctx, guild, user) {
  const had = await ctx.storage.has(`l:${guild}:${user}`);
  await ctx.storage.delete(`l:${guild}:${user}`);
  const ids = await readJson(ctx, `li:${guild}`, []);
  if (ids.includes(user)) await writeJson(ctx, `li:${guild}`, ids.filter((x) => x !== user));
  return had;
}

/** The links of one server: [{ user, name, tag }]. */
export async function serverLinks(ctx, guild) {
  const out = [];
  for (const user of await readJson(ctx, `li:${guild}`, [])) {
    const l = await getLink(ctx, guild, user);
    if (l?.name && l.tag) out.push({ user, name: l.name, tag: l.tag });
  }
  return out;
}

/** The links of every server of the bot. */
export async function allLinks(ctx) {
  const out = [];
  for (const guild of await readJson(ctx, 'lg', [])) for (const l of await serverLinks(ctx, guild)) out.push({ guild, ...l });
  return out;
}
