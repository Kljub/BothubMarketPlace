// Service "verify": links a Discord member with a Roblox account and gives
// the roles of the settings.
//
// Linking proves the account: the member puts a phrase of words into their
// Roblox profile ("About"); the bot reads the profile and finds it. Words,
// because Roblox hides numbers in profiles as ####.
// Roles: the verified role, rank binds (a group and a rank range) and game
// passes, on every server named in the settings; the nickname becomes the
// Roblox name. Members keep their link on every server of the bot.
//
// Storage: "u:<discord>" the link { id, name, display, at }, "r:<roblox id>"
// = discord id, "p:<discord>" the pending phrase, "ix:<n>" the linked
// members in chunks of 600, "sync" the cursor of the periodic update.
import { findUser, groupRanks, ownsPass, profile, profileUrl, RobloxError } from './roblox.js';
import { t } from './i18n.js';
import { readJson, writeJson } from './storage.js';
import { setting } from './util.js';

const WORDS = ['apple', 'river', 'tiger', 'cloud', 'pixel', 'rocket', 'maple', 'ocean', 'falcon', 'ember', 'comet', 'forest', 'lemon', 'quartz', 'violet', 'harbor', 'summit', 'velvet', 'canyon', 'breeze', 'meadow', 'orbit', 'saddle', 'thunder', 'willow', 'zephyr', 'glacier', 'lantern', 'marble', 'nectar'];
const PENDING_MS = 30 * 60_000;
const CHUNK = 600;
const MAX_PASSES = 10;

export const lang = (ctx) => (setting(ctx, 'language', 'en') === 'de' ? 'de' : 'en');

export function phrase(random = Math.random) {
  return ['bothub', ...Array.from({ length: 4 }, () => WORDS[Math.floor(random() * WORDS.length)])].join(' ');
}

// --- index of linked members ---------------------------------------------

export async function indexAll(ctx) {
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
    if (!chunk || chunk.length < CHUNK) return writeJson(ctx, `ix:${n}`, [...(chunk ?? []), id]);
  }
}

async function indexRemove(ctx, id) {
  for (let n = 0; ; n++) {
    const chunk = await readJson(ctx, `ix:${n}`, null);
    if (!chunk) return;
    if (chunk.includes(id)) return writeJson(ctx, `ix:${n}`, chunk.filter((x) => x !== id));
  }
}

// --- roles ------------------------------------------------------------------

const ref = (r) => (r?.id && r?.guild ? r : null);

/** The servers the settings name (roles of the verified role, rank binds, game passes). */
export function guildsOf(ctx) {
  const refs = [ref(setting(ctx, 'verified_role', null)), ...setting(ctx, 'rankbinds', []).map((x) => ref(x.role)), ...setting(ctx, 'gamepasses', []).map((x) => ref(x.role))];
  return [...new Set(refs.filter(Boolean).map((r) => r.guild))];
}

/** Does a rank bind fit (rank between min and max; min 0 means "not in the group" too)? */
export function bindFits(bind, rank) {
  const min = Math.max(0, Number(bind.min_rank ?? 1));
  const max = Math.min(255, Number(bind.max_rank ?? 255) || 255);
  return rank >= min && rank <= max && (rank > 0 || min === 0);
}

/**
 * The roles of one server: { want, managed } (role IDs). link null: not
 * linked (want only the unverified role).
 */
export async function rolesFor(ctx, guild, link) {
  const managed = new Set();
  const want = new Set();
  const verified = ref(setting(ctx, 'verified_role', null));
  const unverified = ref(setting(ctx, 'unverified_role', null));
  if (verified?.guild === guild) {
    managed.add(verified.id);
    if (link) want.add(verified.id);
  }
  if (unverified?.guild === guild) {
    managed.add(unverified.id);
    if (!link) want.add(unverified.id);
  }
  const binds = setting(ctx, 'rankbinds', []).filter((b) => ref(b.role)?.guild === guild && /^\d{1,15}$/.test(String(b.group ?? '')));
  const passes = setting(ctx, 'gamepasses', []).filter((p) => ref(p.role)?.guild === guild && /^\d{1,15}$/.test(String(p.gamepass ?? ''))).slice(0, MAX_PASSES);
  for (const b of binds) managed.add(b.role.id);
  for (const p of passes) managed.add(p.role.id);
  if (link) {
    const ranks = binds.length ? await groupRanks(ctx, link.id) : new Map();
    for (const b of binds) if (bindFits(b, ranks.get(String(b.group)) ?? 0)) want.add(b.role.id);
    for (const p of passes) if (await ownsPass(ctx, link.id, p.gamepass).catch(() => false)) want.add(p.role.id);
  }
  return { want: [...want], managed: [...managed] };
}

/** The nickname of the setting "nickname" for a link; null: leave it. */
export function nicknameFor(ctx, link) {
  const mode = setting(ctx, 'nickname', 'off');
  if (!link || mode === 'off') return null;
  if (mode === 'username') return link.name;
  if (mode === 'display') return link.display;
  return `${link.display} (@${link.name})`.slice(0, 32);
}

/** Gives and takes the roles of one server and sets the nickname; returns the role IDs the member has from the plugin. */
export async function applyGuild(ctx, guild, discordId, link) {
  const member = await ctx.member.get(guild, discordId).catch(() => null);
  if (!member) return null;
  const { want, managed } = await rolesFor(ctx, guild, link);
  const remove = setting(ctx, 'remove_roles', true) !== false;
  for (const role of want) if (!member.roles.includes(role)) await ctx.member.addRole(guild, discordId, role, 'Roblox verification').catch(() => undefined);
  for (const role of managed) {
    if (want.includes(role) || !member.roles.includes(role)) continue;
    if (remove || !link) await ctx.member.removeRole(guild, discordId, role, 'Roblox roles changed').catch(() => undefined);
  }
  const nick = nicknameFor(ctx, link);
  if (nick && member.displayName !== nick) await ctx.member.setNickname(guild, discordId, nick, 'Roblox verification').catch(() => undefined);
  return want;
}

// --- linking ------------------------------------------------------------------

export const linkOf = (ctx, discordId) => readJson(ctx, `u:${discordId}`, null);

/**
 * Step 1 (a username) or step 2 (check the phrase) of the verification.
 * Returns { text, linked, roles }.
 */
export async function verify(ctx, guild, discordId, input) {
  const L = lang(ctx);
  const have = await linkOf(ctx, discordId);
  const name = String(input ?? '').trim();
  if (have && !name) return { text: t(L, 'verify.already', { display: have.display, name: have.name }), linked: true };
  let pending = await readJson(ctx, `p:${discordId}`, null);
  if (pending && Date.now() - pending.at > PENDING_MS) pending = null;
  // A (new) username: step 1.
  if (name && (!pending || pending.name.toLowerCase() !== name.replace(/^@/, '').toLowerCase())) {
    const user = await findUser(ctx, name);
    if (!user) return { text: t(L, 'err.notfound', { name: name.slice(0, 40) }), linked: false };
    const owner = await ctx.storage.get(`r:${user.id}`);
    if (owner && owner !== discordId) return { text: t(L, 'verify.taken'), linked: false };
    pending = { id: user.id, name: user.name, display: user.displayName, code: phrase(), at: Date.now() };
    await writeJson(ctx, `p:${discordId}`, pending);
    return { text: t(L, 'verify.step1', { code: pending.code, display: user.displayName, name: user.name }), linked: false, pending: true };
  }
  if (!pending) return { text: t(L, name ? 'verify.expired' : 'verify.ask'), linked: false };
  // Step 2: is the phrase in the profile?
  const p = await profile(ctx, pending.id);
  if (!p) return { text: t(L, 'err.notfound', { name: pending.name }), linked: false };
  if (p.banned) return { text: t(L, 'err.banned'), linked: false };
  if (!p.description.toLowerCase().replace(/\s+/g, ' ').includes(pending.code)) {
    return { text: t(L, 'verify.notyet', { display: p.displayName, name: p.name }), linked: false, pending: true };
  }
  const owner = await ctx.storage.get(`r:${p.id}`);
  if (owner && owner !== discordId) return { text: t(L, 'verify.taken'), linked: false };
  if (have && have.id !== p.id) await ctx.storage.delete(`r:${have.id}`);
  const link = { id: p.id, name: p.name, display: p.displayName, at: Date.now() };
  await writeJson(ctx, `u:${discordId}`, link);
  await ctx.storage.set(`r:${p.id}`, discordId);
  await ctx.storage.delete(`p:${discordId}`);
  await indexAdd(ctx, discordId);
  const roles = guild ? await applyGuild(ctx, guild, discordId, link) : [];
  for (const g of guildsOf(ctx)) if (g !== guild) await applyGuild(ctx, g, discordId, link);
  const log = setting(ctx, 'log_channel', null)?.id;
  if (log) await ctx.message.send(log, t(L, 'log.verified', { user: discordId, display: p.displayName, name: p.name, url: profileUrl(p.id) })).catch(() => undefined);
  const list = (roles ?? []).map((r) => `<@&${r}>`).join(' ');
  return { text: t(L, 'verify.done', { display: p.displayName, name: p.name, roles: list ? t(L, 'verify.roles', { list }) : '' }), linked: true, link };
}

/** /roblox-unlink: the link goes, the roles of every server too. */
export async function unlink(ctx, discordId) {
  const link = await linkOf(ctx, discordId);
  if (!link) return false;
  await ctx.storage.delete(`u:${discordId}`);
  await ctx.storage.delete(`r:${link.id}`);
  await indexRemove(ctx, discordId);
  for (const g of guildsOf(ctx)) await applyGuild(ctx, g, discordId, null);
  const log = setting(ctx, 'log_channel', null)?.id;
  if (log) await ctx.message.send(log, t(lang(ctx), 'log.unlinked', { user: discordId, name: link.name, url: profileUrl(link.id) })).catch(() => undefined);
  return true;
}

/** Task "tick": updates the roles of a few linked members per run (all of them every few hours). */
export async function tick(ctx) {
  const all = await indexAll(ctx);
  if (!all.length) return 0;
  const hours = Math.max(1, Number(setting(ctx, 'sync_hours', '12')) || 12);
  // Runs every 10 minutes: enough members per run to cover everyone in the interval.
  const per = Math.min(25, Math.max(1, Math.ceil(all.length / ((hours * 60) / 10))));
  const state = await readJson(ctx, 'sync', { at: 0 });
  const start = state.at % all.length;
  const guilds = guildsOf(ctx);
  let done = 0;
  for (let i = 0; i < per; i++) {
    const id = all[(start + i) % all.length];
    const link = await linkOf(ctx, id);
    if (!link) continue;
    try {
      for (const g of guilds) await applyGuild(ctx, g, id, link);
      done++;
    } catch (err) {
      if (err instanceof RobloxError) break;
      throw err;
    }
  }
  await writeJson(ctx, 'sync', { at: (start + per) % all.length });
  return done;
}
