// Service "backups": the backups of each server, newest first, in storage
// "b:<guild>" = [{ file, createdAt, counts, size, by, trigger, name }]. The
// backup itself is a JSON plugin file (guild.snapshot); the dashboard lists
// it for download. "keep" (settings) backups per server stay.
import { readJson, setting, writeJson } from './util.js';

export const list = (ctx, guild) => readJson(ctx, `b:${guild}`, []);

export function parts(ctx) {
  const out = ['roles', 'channels', 'emojis', 'settings', 'bans'].filter((p) => setting(ctx, `include_${p}`, p !== 'bans'));
  return out.length ? out : ['roles', 'channels'];
}

/** Makes a backup of the server and drops the oldest beyond "keep". */
export async function create(ctx, guild, by, trigger) {
  const snap = await ctx.guild.snapshot(guild, { parts: parts(ctx) });
  const entry = { file: snap.file.name, createdAt: snap.createdAt, counts: snap.counts, size: snap.size, by, trigger, name: snap.guild.name };
  const keep = Math.max(1, Number(setting(ctx, 'keep', 3)));
  const all = [entry, ...(await list(ctx, guild)).filter((b) => b.file !== entry.file)];
  for (const old of all.slice(keep)) await ctx.files.delete(old.file).catch(() => undefined);
  await writeJson(ctx, `b:${guild}`, all.slice(0, keep));
  // Which servers have backups (for /backup clone and the schedule).
  const known = await readJson(ctx, 'servers', []);
  if (!known.includes(guild)) await writeJson(ctx, 'servers', [...known, guild]);
  return entry;
}

export async function remove(ctx, guild, index) {
  const all = await list(ctx, guild);
  const b = all[index];
  if (!b) return null;
  await ctx.files.delete(b.file).catch(() => undefined);
  await writeJson(ctx, `b:${guild}`, all.filter((_, i) => i !== index));
  return b;
}

export const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);
export const countsLine = (c) => `Roles **${c.roles ?? 0}** · Channels **${c.channels ?? 0}** · Emojis **${c.emojis ?? 0}** · Bans **${c.bans ?? 0}**`;
export const when = (iso) => `<t:${Math.floor(Date.parse(iso) / 1000)}:f>`;

/** Local date, time (HH:MM) and weekday (0 = Sunday) in a time zone; null for an unknown zone. */
export function zoned(tz, now = new Date()) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(now).map((p) => [p.type, p.value]));
    const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`, weekday: days[parts.weekday] };
  } catch {
    return null;
  }
}
