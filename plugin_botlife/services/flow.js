// Service "flow": a life per member and server in the plugin storage, one
// change at a time (lock), the dashboard settings and the obituary.
// Storage: "L:<guild>:<user>" the life (JSON, a few KB), "ix:<guild>" the
// members with a life (ranking), "lk:<guild>:<user>" / "lt:…" the lock.
import { LifeError, label, money } from './engine.js';
import { COUNTRIES } from './data.js';
import { t } from './i18n.js';
import { readJson, writeJson } from './storage.js';
import { setting } from './util.js';
import { ribbonText } from './view.js';

const LOCK_MS = 10_000;
const MAX_INDEX = 700;

export const lang = (ctx) => (setting(ctx, 'language', 'en') === 'de' ? 'de' : 'en');
export const rng = () => Math.random;

/** Dashboard settings that change play. */
export function options(ctx) {
  const cd = Math.floor(Number(setting(ctx, 'cooldown', 2)));
  return {
    lang: lang(ctx),
    cur: String(setting(ctx, 'currency', '$')).slice(0, 3) || '$',
    crime: setting(ctx, 'crime', true) !== false,
    cooldown: Number.isFinite(cd) ? Math.min(60, Math.max(0, cd)) : 2,
  };
}

const key = (guild, user) => `L:${guild}:${user}`;
export const loadLife = (ctx, guild, user) => readJson(ctx, key(guild, user), null);

export async function saveLife(ctx, guild, user, L) {
  await writeJson(ctx, key(guild, user), L);
  const ix = await readJson(ctx, `ix:${guild}`, []);
  if (!ix.includes(user)) {
    ix.push(user);
    await writeJson(ctx, `ix:${guild}`, ix.slice(-MAX_INDEX));
  }
}

/** The lives of a server (ranking): [{ user, L }]. */
export async function serverLives(ctx, guild) {
  const out = [];
  for (const user of await readJson(ctx, `ix:${guild}`, [])) {
    const L = await loadLife(ctx, guild, user);
    if (L) out.push({ user, L });
  }
  return out;
}

async function lock(ctx, id) {
  const n = await ctx.storage.increment(`lk:${id}`);
  if (n === 1) {
    await ctx.storage.set(`lt:${id}`, String(Date.now()));
    return true;
  }
  const since = Number(await ctx.storage.get(`lt:${id}`)) || 0;
  if (Date.now() - since > LOCK_MS) {
    await ctx.storage.set(`lt:${id}`, String(Date.now()));
    return true;
  }
  return false;
}

async function unlock(ctx, id) {
  await ctx.storage.delete(`lk:${id}`);
  await ctx.storage.delete(`lt:${id}`);
}

/**
 * Runs fn(L) on the stored life under a lock and saves it (fn may return a
 * new life to replace it). Posts the obituary when the life ended.
 * Throws LifeError('err.busy') while another click runs.
 */
export async function withLife(ctx, guild, user, fn) {
  const id = `${guild}:${user}`;
  if (!(await lock(ctx, id))) throw new LifeError('err.busy');
  try {
    const L = await loadLife(ctx, guild, user);
    const wasDead = Boolean(L?.dead);
    const out = (await fn(L)) ?? L;
    if (out) {
      await saveLife(ctx, guild, user, out);
      if (out === L && out.dead && !wasDead) await obituary(ctx, user, out);
    }
    return out;
  } finally {
    await unlock(ctx, id);
  }
}

/** The public obituary (setting "obituary_channel"). */
async function obituary(ctx, user, L) {
  const channel = setting(ctx, 'obituary_channel', null)?.id;
  if (!channel) return;
  const c = COUNTRIES[L.country];
  const text = t(L.lang, 'ui.obituary', { name: `${c?.flag ?? ''} ${L.first} ${L.last} (<@${user}>)`, age: L.dead.age, cause: t(L.lang, L.dead.cause), estate: money(L, L.dead.estate), ribbon: ribbonText(L, L.dead.ribbon) });
  await ctx.message.send(channel, { embeds: [{ color: '#6b7280', description: text, footer: { text: `BotLife · ${label(L, c?.name ?? ['', ''])}` } }] }).catch(() => undefined);
}
