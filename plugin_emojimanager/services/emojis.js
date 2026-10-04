// Service "emojis": the emojis of the menu. Two sources:
//   - the list on the settings page: name + uploaded image (plugin files,
//     storage.files) or an https link, and
//   - the server's own custom emojis ("server_emojis", discord.emojis.read).
// /emoji-menu add and delete change the list with ctx.config.set, so the
// dashboard shows the same list. Use counts per server live in ctx.storage
// ("uses:<guild>:<name>").
import { setting } from './util.js';

export const MENU_MAX = 25; // Discord: 25 options per select menu
export const LIST_MAX = 50; // "max" of the list field in dashboard/settings.json
export const NAME = /^[a-z0-9_-]{1,32}$/;
const LINK = /^https:\/\/\S+$/;
const FILE = /^[0-9a-f]{16}\.(png|gif|webp|jpg)$/;

/** The entries of the settings list as they are stored (with _id). */
export function listEntries(ctx) {
  const list = setting(ctx, 'emojis', []);
  return Array.isArray(list) ? list : [];
}

/** Name + image of every emoji the menu offers on a server (list first, then the server's own). */
export async function emojiList(ctx, guildId) {
  const out = [];
  const seen = new Set();
  for (const e of listEntries(ctx)) {
    const name = String(e?.name ?? '').toLowerCase();
    const file = String(e?.file ?? '');
    const image = String(e?.image ?? '');
    if (!NAME.test(name) || seen.has(name)) continue;
    // An upload wins over a link.
    if (FILE.test(file)) out.push({ name, file, source: 'list' });
    else if (LINK.test(image)) out.push({ name, image, source: 'list' });
    else continue;
    seen.add(name);
  }
  if (guildId && setting(ctx, 'server_emojis', true) !== false) {
    let server = [];
    try {
      server = await ctx.emoji.list(guildId);
    } catch {
      server = []; // permission off or server unknown: the list alone
    }
    for (const e of server) {
      const name = String(e.name ?? '').toLowerCase();
      if (!e.available || !name || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, image: String(e.url), source: 'server', animated: e.animated === true });
    }
  }
  return out;
}

/** The emoji with this name, or null. */
export async function findEmoji(ctx, guildId, name) {
  const want = cleanName(name);
  return (await emojiList(ctx, guildId)).find((e) => e.name === want) ?? null;
}

/** ":Wave:" -> "wave". */
export function cleanName(name) {
  return String(name ?? '').trim().toLowerCase().replace(/^:|:$/g, '');
}

/** The message that shows the emoji big: an embed with the image (and who sent it). */
export function emojiMessage(ctx, emoji, userId) {
  // "attachment": the uploaded file sent with the message (message.sendFile).
  const e = { color: String(setting(ctx, 'color', '#2b2d31')), image_url: emoji.file ? 'attachment' : emoji.image };
  if (userId && setting(ctx, 'show_sender', true) !== false) e.description = `<@${userId}> · **:${emoji.name}:**`;
  return { embeds: [e] };
}

/** Counts one use; returns the new count. */
export function countUse(ctx, guildId, name) {
  return ctx.storage.increment(`uses:${guildId}:${name}`);
}

/** Sends the emoji to a channel and counts it. */
export async function sendEmoji(ctx, channelId, guildId, emoji, userId) {
  const message = emojiMessage(ctx, emoji, userId);
  const id = emoji.file ? await ctx.message.sendFile(channelId, emoji.file, message) : await ctx.message.send(channelId, message);
  const uses = await countUse(ctx, guildId, emoji.name);
  return { id, uses };
}

/**
 * Adds an emoji to the list: the image of a Discord attachment (stored in the
 * plugin files) or an https link. Throws Error with a key:
 * bad_name, exists, full, bad_image.
 */
export async function addEmoji(ctx, name, image) {
  const clean = cleanName(name);
  if (!NAME.test(clean)) throw Object.assign(new Error('bad_name'), { reason: 'bad_name' });
  const list = listEntries(ctx);
  if (list.some((e) => cleanName(e?.name) === clean)) throw Object.assign(new Error('exists'), { reason: 'exists' });
  if (list.length >= LIST_MAX) throw Object.assign(new Error('full'), { reason: 'full' });
  const url = String(image ?? '').trim();
  let entry;
  if (/^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/(ephemeral-)?attachments\//.test(url)) {
    try {
      const stored = await ctx.files.fromDiscord(url);
      entry = { name: clean, file: stored.name, image: '' };
    } catch (err) {
      throw Object.assign(new Error('bad_image'), { reason: 'bad_image', cause: err });
    }
  } else if (LINK.test(url)) {
    entry = { name: clean, file: '', image: url };
  } else {
    throw Object.assign(new Error('bad_image'), { reason: 'bad_image' });
  }
  await ctx.config.set('emojis', [...list, entry]);
  return entry;
}

/** Removes an emoji of the list (its uploaded image goes with it); false when there is none. */
export async function deleteEmoji(ctx, name) {
  const clean = cleanName(name);
  const list = listEntries(ctx);
  const rest = list.filter((e) => cleanName(e?.name) !== clean);
  if (rest.length === list.length) return false;
  await ctx.config.set('emojis', rest);
  return true;
}
