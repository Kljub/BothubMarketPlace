// Service "sounds": the sounds of the bot (storage "sounds" = [{ name, file,
// filename, by, plays }]); the audio is a plugin file (storage.files, mp3,
// ogg, wav or webm up to 8 MB). Playing joins the member's voice channel;
// the "idle" task leaves after a minute without sound.
import { readJson, setting, writeJson } from './util.js';

export const MAX_SOUNDS = 25;
const NAME = /^[a-z0-9_-]{1,32}$/;
const AUDIO = /\.(mp3|ogg|wav|webm)$/;

export const list = (ctx) => readJson(ctx, 'sounds', []);
export const cleanName = (v) => String(v ?? '').trim().toLowerCase();

export async function find(ctx, name) {
  return (await list(ctx)).find((s) => s.name === cleanName(name)) ?? null;
}

/** Adds a sound from a Discord attachment; returns an error text or null. */
export async function add(ctx, name, url, by) {
  const n = cleanName(name);
  if (!NAME.test(n)) return '❌ Name: a-z, 0-9, _ and - (max. 32).';
  const sounds = await list(ctx);
  if (sounds.some((s) => s.name === n)) return `❌ There already is a sound \`${n}\`.`;
  if (sounds.length >= MAX_SOUNDS) return `❌ At most ${MAX_SOUNDS} sounds; remove one first.`;
  if (!url) return '❌ Attach the sound file (mp3, ogg, wav or webm).';
  let stored;
  try {
    stored = await ctx.files.fromDiscord(url);
  } catch (err) {
    return String(err?.message ?? err).includes('too_big') ? '❌ The file is too big (max. 8 MB).' : '❌ The file could not be stored.';
  }
  if (!AUDIO.test(stored.name)) {
    if (!sounds.some((s) => s.file === stored.name)) await ctx.files.delete(stored.name).catch(() => undefined);
    return '❌ Only mp3, ogg, wav or webm.';
  }
  await writeJson(ctx, 'sounds', [...sounds, { name: n, file: stored.name, filename: stored.filename, by, plays: 0 }]);
  return null;
}

export async function removeSound(ctx, name) {
  const sounds = await list(ctx);
  const s = sounds.find((x) => x.name === cleanName(name));
  if (!s) return false;
  const rest = sounds.filter((x) => x !== s);
  await writeJson(ctx, 'sounds', rest);
  if (!rest.some((x) => x.file === s.file)) await ctx.files.delete(s.file).catch(() => undefined);
  return true;
}

/** Plays a sound in the voice channel; returns an error text or null. */
export async function play(ctx, guildId, channelId, name) {
  if (!channelId) return '❌ Join a voice channel first.';
  const sounds = await list(ctx);
  const s = sounds.find((x) => x.name === cleanName(name));
  if (!s) return `❌ Sound \`${cleanName(name)}\` not found.`;
  try {
    const state = await ctx.voice.state(guildId);
    if (state.channelId !== channelId) await ctx.voice.join(guildId, channelId);
    await ctx.voice.play(guildId, s.file, { volume: Number(setting(ctx, 'volume', '100')) / 100 });
  } catch (err) {
    const e = String(err?.message ?? err);
    return e.includes('busy') ? '❌ Something else plays on this server right now (e.g. music).' : `❌ Could not play: ${e}`;
  }
  s.plays += 1;
  await writeJson(ctx, 'sounds', sounds);
  await writeJson(ctx, `last:${guildId}`, Date.now());
  return null;
}

/** The panel: one button per sound (5 per row, max. 25). */
export function panel(sounds) {
  const rows = [];
  for (let i = 0; i < sounds.length && i < MAX_SOUNDS; i += 5) {
    rows.push(sounds.slice(i, i + 5).map((s) => ({ key: 'play', data: s.name, label: s.name, emoji: '🔊', style: 'secondary' })));
  }
  return { embeds: [{ color: '#a855f7', title: '🔊 Soundboard', description: sounds.length ? 'Click a sound: it plays in your voice channel.' : 'No sounds yet. Add one with /soundboard-add.' }], components: rows };
}
