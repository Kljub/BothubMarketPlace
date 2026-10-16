// Service "sync": Patreon tiers to Discord roles.
//
// A full sync reads every member of the campaign, page by page (200 per
// page, a few pages per minute because a task has 10 s), and gives each
// patron with a Discord connection the roles of the settings on every
// server of them. At the end of a pass, members who are no longer in the
// campaign lose the roles. Webhooks (members:pledge:create/update/delete)
// update one patron at once between the passes.
//
// Storage: "pm:<discord id>" a patron { pid, name, status, tiers, cents,
// lifetime, since, roles: ["guild:role"], pass }, "pp:<patreon member id>"
// = discord id, "ix:<n>" the tracked discord ids in chunks of 600,
// "sync" the pass { pass, cursor, patrons, linked, changed, running, done },
// "tiers" the campaign's tiers, "camp" the campaign id.
import { campaign, member, membersPage, PatreonError } from './patreon.js';
import { t } from './i18n.js';
import { readJson, writeJson } from './storage.js';
import { setting } from './util.js';

const CHUNK = 600;
const PAGES_PER_TICK = 3;
const TICK_BUDGET_MS = 6500;

export const lang = (ctx) => (setting(ctx, 'language', 'en') === 'de' ? 'de' : 'en');
export const syncMinutes = (ctx) => Math.max(5, Number(setting(ctx, 'sync_minutes', '30')) || 30);

// --- the index of tracked members ---------------------------------------

async function indexAll(ctx) {
  const out = [];
  for (let n = 0; ; n++) {
    const chunk = await readJson(ctx, `ix:${n}`, null);
    if (!chunk) return out;
    out.push(...chunk);
  }
}

async function indexAdd(ctx, id) {
  for (let n = 0; ; n++) {
    const chunk = await readJson(ctx, `ix:${n}`, null);
    if (chunk?.includes(id)) return;
    if (!chunk || chunk.length < CHUNK) {
      await writeJson(ctx, `ix:${n}`, [...(chunk ?? []), id]);
      return;
    }
  }
}

async function indexRemove(ctx, id) {
  for (let n = 0; ; n++) {
    const chunk = await readJson(ctx, `ix:${n}`, null);
    if (!chunk) return;
    if (chunk.includes(id)) {
      await writeJson(ctx, `ix:${n}`, chunk.filter((x) => x !== id));
      return;
    }
  }
}

// --- roles ------------------------------------------------------------------

const refKey = (ref) => (ref?.id && ref?.guild ? `${ref.guild}:${ref.id}` : null);

/** "guild:role" keys of every role the settings may give (tiers, patron, former). */
export function managedRoles(ctx) {
  const keys = setting(ctx, 'tiers', []).map((x) => refKey(x.role));
  keys.push(refKey(setting(ctx, 'patron_role', null)), refKey(setting(ctx, 'former_role', null)));
  return [...new Set(keys.filter(Boolean))];
}

/** Does a tier rule fit the patron (tier title or ID; else the minimum amount)? */
export function ruleFits(rule, p) {
  const want = String(rule.tier ?? '').trim().toLowerCase();
  if (want) return p.tiers.some((x) => x.title.toLowerCase() === want || x.id === want);
  const min = Number(rule.min_amount);
  return Number.isFinite(min) && min > 0 && p.cents >= Math.round(min * 100);
}

/** The "guild:role" keys a patron should have; p null: not in the campaign. */
export function wantedRoles(ctx, p) {
  const out = new Set();
  const active = p?.status === 'active_patron';
  if (active) {
    for (const rule of setting(ctx, 'tiers', [])) if (ruleFits(rule, p)) out.add(refKey(rule.role));
    out.add(refKey(setting(ctx, 'patron_role', null)));
  } else if (p && ['former_patron', 'declined_patron'].includes(p.status)) {
    out.add(refKey(setting(ctx, 'former_role', null)));
  }
  out.delete(null);
  return [...out];
}

/** Adds and takes roles; returns the keys the member now has from the plugin and how many calls changed something. */
async function applyRoles(ctx, discordId, had, want) {
  const managed = new Set(managedRoles(ctx));
  const remove = setting(ctx, 'remove_roles', true) !== false;
  let changed = 0;
  for (const key of want) {
    if (had.includes(key)) continue;
    const [guild, role] = key.split(':');
    await ctx.member.addRole(guild, discordId, role, 'Patreon').then(() => changed++, () => undefined);
  }
  const kept = [...want];
  for (const key of had) {
    if (want.includes(key)) continue;
    if (!remove && managed.has(key)) {
      kept.push(key);
      continue;
    }
    const [guild, role] = key.split(':');
    await ctx.member.removeRole(guild, discordId, role, 'Patreon pledge changed or ended').then(() => changed++, () => undefined);
  }
  return { roles: kept, changed };
}

const tierText = (p) => (p?.tiers?.length ? ` (${p.tiers.map((x) => x.title).join(', ')})` : '');

/**
 * Brings one patron up to date: record, roles, announcement and log line.
 * announce: new active patrons are announced (not on the very first pass).
 */
export async function updatePatron(ctx, p, { pass = null, announce = true } = {}) {
  if (!p?.discord) return 0;
  const key = `pm:${p.discord}`;
  const prev = await readJson(ctx, key, null);
  const want = wantedRoles(ctx, p);
  const { roles, changed } = await applyRoles(ctx, p.discord, prev?.roles ?? [], want);
  await writeJson(ctx, key, { pid: p.pid, name: p.name, status: p.status, tiers: p.tiers.map((x) => x.title), cents: p.cents, lifetime: p.lifetime, since: p.since, roles, pass: pass ?? prev?.pass ?? null });
  await ctx.storage.set(`pp:${p.pid}`, p.discord);
  if (!prev) await indexAdd(ctx, p.discord);
  const L = lang(ctx);
  const tiersBefore = (prev?.tiers ?? []).join('|');
  const tiersNow = p.tiers.map((x) => x.title).join('|');
  if (prev?.status === p.status && tiersBefore === tiersNow) return changed;
  const became = p.status === 'active_patron' && prev?.status !== 'active_patron';
  const channel = setting(ctx, 'announce_channel', null)?.id;
  if (became && announce && channel) {
    const text = String(setting(ctx, 'announce_message', '') || t(L, 'announce.default'))
      .replaceAll('{user}', `<@${p.discord}>`)
      .replaceAll('{name}', p.name)
      .replaceAll('{tier}', tierText(p))
      .replaceAll('{amount}', (p.cents / 100).toFixed(2));
    await ctx.message.send(channel, { content: text.slice(0, 2000), mentionUsers: true }).catch(() => undefined);
  }
  const log = setting(ctx, 'log_channel', null)?.id;
  if (log && (prev || p.status === 'active_patron')) {
    await ctx.message.send(log, t(L, 'log.change', { user: p.discord, name: p.name || '?', state: t(L, `state.${p.status ?? 'none'}`), tier: tierText(p) })).catch(() => undefined);
  }
  return changed;
}

/** A tracked member who is no longer in the campaign: roles go, record goes. */
async function dropMember(ctx, discordId) {
  const rec = await readJson(ctx, `pm:${discordId}`, null);
  const { changed } = rec ? await applyRoles(ctx, discordId, rec.roles ?? [], []) : { changed: 0 };
  if (rec?.pid) await ctx.storage.delete(`pp:${rec.pid}`);
  await ctx.storage.delete(`pm:${discordId}`);
  await indexRemove(ctx, discordId);
  return changed;
}

/** Starts a pass now (also when one ran recently); false when one is running. */
export async function startPass(ctx, now = Date.now()) {
  const state = await readJson(ctx, 'sync', {});
  if (state.running) return false;
  const camp = await campaign(ctx);
  await ctx.storage.set('camp', camp.id);
  await writeJson(ctx, 'tiers', camp.tiers);
  await writeJson(ctx, 'sync', { ...state, running: true, pass: now, cursor: null, patrons: 0, linked: 0, changed: 0, first: !state.done });
  return true;
}

/**
 * Task "tick": starts a pass when the interval is over and works on the
 * running pass for a few seconds. Returns the sync state.
 */
export async function tick(ctx, now = Date.now()) {
  let state = await readJson(ctx, 'sync', {});
  if (!state.running && now - (state.done ?? 0) >= syncMinutes(ctx) * 60_000) {
    await startPass(ctx, now);
    state = await readJson(ctx, 'sync', {});
  }
  if (!state.running) return state;
  const campId = await ctx.storage.get('camp');
  const started = Date.now();
  for (let i = 0; i < PAGES_PER_TICK && Date.now() - started < TICK_BUDGET_MS; i++) {
    const page = await membersPage(ctx, campId, state.cursor);
    for (const p of page.patrons) {
      state.patrons++;
      if (!p.discord) continue;
      state.linked++;
      state.changed += await updatePatron(ctx, p, { pass: state.pass, announce: !state.first });
    }
    state.cursor = page.next;
    await writeJson(ctx, 'sync', state);
    if (!page.next) break;
  }
  if (state.cursor) return state;
  // End of the pass: who was not seen left the campaign (or removed Discord from Patreon).
  for (const id of await indexAll(ctx)) {
    const rec = await readJson(ctx, `pm:${id}`, null);
    if (!rec || rec.pass !== state.pass) state.changed += await dropMember(ctx, id);
  }
  state = { ...state, running: false, cursor: null, done: now, first: false };
  await writeJson(ctx, 'sync', state);
  return state;
}

/** Webhook "patreon": one member changed (pledge created, updated or deleted). */
export async function onWebhook(ctx, payload) {
  const data = payload?.data;
  if (!data?.id || data.type !== 'member') return;
  // The webhook body often lacks the user's Discord connection: ask the API.
  const p = await member(ctx, data.id).catch((err) => {
    if (err instanceof PatreonError) return null;
    throw err;
  });
  if (p?.discord) {
    await updatePatron(ctx, p);
    return;
  }
  // Deleted pledge or no Discord any more: the member we knew loses the roles.
  const known = await ctx.storage.get(`pp:${data.id}`);
  if (known) await dropMember(ctx, known);
}

/** Event guildMemberAdd: a patron joins a server; the roles of that server come back. */
export async function onJoin(ctx, payload) {
  const user = String(payload['user.id'] ?? '');
  const guild = String(payload['server.id'] ?? '');
  const rec = /^\d{17,20}$/.test(user) ? await readJson(ctx, `pm:${user}`, null) : null;
  if (!rec) return;
  for (const key of rec.roles ?? []) {
    const [g, role] = key.split(':');
    if (g === guild) await ctx.member.addRole(g, user, role, 'Patreon').catch(() => undefined);
  }
}

/** The stored record of a member, or null. */
export const record = (ctx, discordId) => readJson(ctx, `pm:${discordId}`, null);
