// Service "files": the temporary files of a server (storage + plugin files).
// A file record: { id, guild, name, text, file, filename, salt, hash, max,
// used, onePerUser, start, end, roles, createdBy, message: { channel, id } }.
// Storage keys: "f:<id>" record, "n:<guild>:<name>" id, "u:<id>:<user>" used,
// "ids" all IDs (for the expiry sweep). Access is checked on every click, so
// it stays right over restarts.
import { readJson, writeJson } from './util.js';

export const MAX_FILES = 100;

/** "2026-12-24 18:00" or ISO, read as UTC; null when empty, undefined when broken. */
export function parseDate(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(s);
  const t = m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)) : Date.parse(s);
  return Number.isFinite(t) ? t : undefined;
}

const key = (name) => String(name).trim().toLowerCase().slice(0, 64);

export async function byName(ctx, guild, name) {
  const id = await ctx.storage.get(`n:${guild}:${key(name)}`);
  return id ? readJson(ctx, `f:${id}`, null) : null;
}

export const byId = (ctx, id) => readJson(ctx, `f:${String(id).replace(/[^a-z0-9]/g, '')}`, null);

/** The newest file this member created on the server (default of the role commands). */
export async function latestOf(ctx, guild, userId) {
  let best = null;
  for (const id of await readJson(ctx, 'ids', [])) {
    const f = await byId(ctx, id);
    if (f && f.guild === guild && f.createdBy === userId && (!best || f.created > best.created)) best = f;
  }
  return best;
}

export async function save(ctx, f) {
  await writeJson(ctx, `f:${f.id}`, f);
}

export async function create(ctx, f) {
  const ids = await readJson(ctx, 'ids', []);
  if (ids.length >= MAX_FILES) throw new Error(`At most ${MAX_FILES} temporary files; delete old ones with /tempfile-delete.`);
  await save(ctx, f);
  await ctx.storage.set(`n:${f.guild}:${key(f.name)}`, f.id);
  await writeJson(ctx, 'ids', [...ids, f.id]);
}

export async function remove(ctx, f) {
  await ctx.storage.delete(`f:${f.id}`);
  await ctx.storage.delete(`n:${f.guild}:${key(f.name)}`);
  await writeJson(ctx, 'ids', (await readJson(ctx, 'ids', [])).filter((x) => x !== f.id));
  // The stored file goes unless another record still uses the same content.
  if (f.file) {
    for (const id of await readJson(ctx, 'ids', [])) if ((await byId(ctx, id))?.file === f.file) return;
    await ctx.files.delete(f.file).catch(() => undefined);
  }
}

export const hashPassword = (ctx, salt, password) => ctx.utils.hash(`${salt}:${password}`, 'sha256');

/** null when the member may open the file now, else { reason, close } (close: the button stays off for everyone). */
export async function denied(ctx, f, userId, now = Date.now()) {
  if (f.start && now < f.start) return { reason: `⏳ Available <t:${Math.floor(f.start / 1000)}:R>.` };
  if (f.end && now > f.end) return { reason: '⏰ This file is no longer available.', close: true };
  if (f.max !== null && f.used >= f.max) return { reason: '🚫 The usage limit is reached.', close: true };
  if (f.onePerUser && (await ctx.storage.has(`u:${f.id}:${userId}`))) return { reason: '🚫 You already used this file.' };
  if (f.roles.length) {
    const member = await ctx.member.get(f.guild, userId).catch(() => null);
    if (!member || !f.roles.some((r) => (member.roles ?? []).includes(r))) return { reason: '🚫 None of your roles may open this file.' };
  }
  return null;
}

/** The board message of a file with its access button. */
export function fileMessage(f, closed = false) {
  const lines = [
    f.hash ? '🔒 Password protected' : '🔓 No password',
    f.max !== null ? `Uses: ${f.used} / ${f.max}` : 'Uses: unlimited',
    f.onePerUser ? '👤 Once per member' : '♾️ Members may open it again',
    f.start ? `From <t:${Math.floor(f.start / 1000)}:f>` : null,
    f.end ? `Until <t:${Math.floor(f.end / 1000)}:f>` : null,
    f.roles.length ? `Roles: ${f.roles.map((r) => `<@&${r}>`).join(' ')}` : null,
  ].filter(Boolean);
  return {
    embeds: [{ color: closed ? '#6b7280' : '#5865f2', title: `📎 ${f.name}`.slice(0, 256), description: lines.join('\n') }],
    components: [[{ key: 'access', data: f.id, label: closed ? 'Closed' : 'Access', emoji: '📎', style: 'primary', disabled: closed }]],
  };
}

/** Edits the board message (e.g. button off); a deleted message is ignored. */
export async function refresh(ctx, f, closed = false) {
  if (f.message?.id) await ctx.message.edit(f.message.channel, f.message.id, fileMessage(f, closed)).catch(() => undefined);
}

/** Opens the file for the member: counts the use and answers privately with text and file. */
export async function grant(ctx, f, handle, userId) {
  f.used += 1;
  await save(ctx, f);
  await ctx.storage.set(`u:${f.id}:${userId}`, '1');
  const text = f.text || (f.file ? '' : 'ℹ️ No content.');
  await ctx.interaction.reply(handle, text || `📎 ${f.name}`, { ephemeral: true, ...(f.file ? { file: f.file } : {}) });
  await refresh(ctx, f, f.max !== null && f.used >= f.max);
}
