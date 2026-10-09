// Service "board": the duty status of the staff and the live board.
//
// Status per member: on (green), idle (yellow), off (red), set with
// /duty-on, /duty-idle, /duty-off (an optional note). Teams come from the
// settings (name + role); a member shows in every team whose role they
// have. With "show_off" members of a team role without a status show as
// off. The board is one message in the board channel, edited on every
// change and by the task every 5 minutes (which also turns statuses older
// than "auto_off_hours" off).
//
// Bots with a team role have no duty commands: their Discord status counts
// (online = on, idle = idle, dnd and offline = off), kept up to date by the
// presenceUpdate event. Role changes (guildMemberUpdate) and a settings save
// (onConfigChange) refresh the board at once.
//
// Storage: "s:<guild>:<user>" = { status, since, note }, "u:<guild>" = list
// of user IDs with a status, "p:<guild>:<bot>" = { status, since } (last
// status change of a bot), "board:<guild>" = { channel, message }.
import { readJson, writeJson } from './storage.js';

export const STATUS = {
  on: { emoji: '🟢', color: '#22c55e', rank: 0 },
  idle: { emoji: '🟡', color: '#eab308', rank: 1 },
  off: { emoji: '🔴', color: '#ef4444', rank: 2 },
};

export const TEXT = {
  en: { on: 'On duty', idle: 'Idle', off: 'Off duty', staff: 'Staff', nobody: 'Nobody of this team yet.', since: 'since', summary: '{on} on duty · {idle} idle', footer: 'Updated automatically', set: { on: '🟢 You are on duty now.', idle: '🟡 You are idle now.', off: '🔴 You are off duty now.' }, notStaff: '❌ Only staff (the team roles of Staff Activity) can set a duty status.', noServer: '❌ Only on a server.' },
  de: { on: 'Im Dienst', idle: 'Abwesend', off: 'Außer Dienst', staff: 'Team', nobody: 'Noch niemand aus diesem Team.', since: 'seit', summary: '{on} im Dienst · {idle} abwesend', footer: 'Automatisch aktualisiert', set: { on: '🟢 Du bist jetzt im Dienst.', idle: '🟡 Du bist jetzt abwesend.', off: '🔴 Du bist jetzt außer Dienst.' }, notStaff: '❌ Nur das Team (die Team-Rollen von Staff Activity) kann einen Dienst-Status setzen.', noServer: '❌ Nur auf einem Server.' },
};

export function setting(ctx, key, fallback) {
  const value = ctx.config.get(key);
  return value === undefined || value === null ? fallback : value;
}

export const texts = (ctx) => TEXT[setting(ctx, 'language', 'en')] ?? TEXT.en;

/** Teams of a server (their role is on it). */
export function teamsOf(ctx, guildId) {
  return setting(ctx, 'teams', []).filter((t) => t?.name && t.role?.guild === guildId && t.role.id);
}

/** Duty status of a bot from its Discord status. */
export const fromPresence = (status) => (status === 'online' ? 'on' : status === 'idle' ? 'idle' : 'off');

/** Remembers when a bot's duty status changed (for "since"). */
export async function botStatusChanged(ctx, guild, user, presence, now = Date.now()) {
  const status = fromPresence(presence);
  const prev = await readJson(ctx, `p:${guild}:${user}`, null);
  if (prev?.status === status) return false;
  await writeJson(ctx, `p:${guild}:${user}`, { status, since: now });
  return true;
}

async function statusOf(ctx, guild, user) {
  return readJson(ctx, `s:${guild}:${user}`, null);
}

/** Sets a status; returns the members with a status on the server. */
export async function setStatus(ctx, guild, user, status, note = '', now = Date.now()) {
  const prev = await statusOf(ctx, guild, user);
  // The time counts from the change to this status (a new note keeps it).
  const since = prev?.status === status ? prev.since : now;
  await writeJson(ctx, `s:${guild}:${user}`, { status, since, note: String(note ?? '').trim().slice(0, 100) });
  const users = await readJson(ctx, `u:${guild}`, []);
  if (!users.includes(user)) users.push(user);
  await writeJson(ctx, `u:${guild}`, users.slice(-500));
}

/** Members of the server with their roles (empty when they cannot be read). */
async function members(ctx, guild) {
  return ctx.member.list(guild, { limit: 1000 }).catch(() => []);
}

/** May this member set a duty status (a team role; no teams: everyone). */
export async function isStaff(ctx, guild, user) {
  const teams = teamsOf(ctx, guild);
  if (!teams.length) return true;
  const m = await ctx.member.get(guild, user).catch(() => null);
  return !!m && teams.some((t) => m.roles.includes(t.role.id));
}

function line(t, entry, userId) {
  const s = STATUS[entry?.status ?? 'off'];
  const parts = [`${s.emoji} **<@${userId}>**${entry?.bot ? ' 🤖' : ''} - ${t[entry?.status ?? 'off']}`];
  if (entry && entry.status !== 'off' && entry.since) parts.push(`${t.since} <t:${Math.floor(entry.since / 1000)}:R>`);
  if (entry?.note && entry.status !== 'off') parts.push(entry.note);
  return parts.join(' · ');
}

/** The board embed of a server. */
export async function boardEmbed(ctx, guild) {
  const t = texts(ctx);
  const users = await readJson(ctx, `u:${guild}`, []);
  const entries = new Map();
  for (const u of users) {
    const e = await statusOf(ctx, guild, u);
    if (e) entries.set(u, e);
  }
  const teams = teamsOf(ctx, guild);
  const showOff = setting(ctx, 'show_off', true) !== false;
  const all = teams.length || showOff ? await members(ctx, guild) : [];
  // Bots of a team: their Discord status, not a duty command.
  for (const m of all) {
    if (!m.bot || !teams.some((tm) => m.roles.includes(tm.role.id))) continue;
    const status = fromPresence(m.status);
    const seen = await readJson(ctx, `p:${guild}:${m.id}`, null);
    entries.set(m.id, { status, since: seen?.status === status ? seen.since : null, note: '', bot: true });
  }
  const sections = [];
  const sorted = (ids) => [...new Set(ids)].sort((a, b) => STATUS[entries.get(a)?.status ?? 'off'].rank - STATUS[entries.get(b)?.status ?? 'off'].rank || (entries.get(b)?.since ?? 0) - (entries.get(a)?.since ?? 0));
  if (teams.length) {
    for (const team of teams) {
      const inTeam = all.filter((m) => m.roles.includes(team.role.id)).map((m) => m.id);
      const ids = sorted([...inTeam.filter((id) => showOff || (entries.get(id)?.status ?? 'off') !== 'off'), ...[...entries.keys()].filter((id) => inTeam.includes(id) && entries.get(id).status !== 'off')]);
      const head = `**${team.name}**${team.description ? `\n${team.description}` : ''}`;
      sections.push(`${head}\n${ids.length ? ids.slice(0, 30).map((id) => line(t, entries.get(id), id)).join('\n') : `*${t.nobody}*`}`);
    }
  } else {
    const ids = sorted([...entries.keys()].filter((id) => showOff || entries.get(id).status !== 'off'));
    sections.push(`**${t.staff}**\n${ids.length ? ids.slice(0, 40).map((id) => line(t, entries.get(id), id)).join('\n') : `*${t.nobody}*`}`);
  }
  const on = [...entries.values()].filter((e) => e.status === 'on').length;
  const idle = [...entries.values()].filter((e) => e.status === 'idle').length;
  const color = on ? STATUS.on.color : idle ? STATUS.idle.color : STATUS.off.color;
  return {
    color,
    title: `${setting(ctx, 'title', 'Staff Status')} - ${t.summary.replace('{on}', on).replace('{idle}', idle)}`.slice(0, 256),
    description: sections.join('\n\n').slice(0, 4096),
    footer: { text: t.footer },
    timestamp: true,
  };
}

/** Posts the board of a server, or edits it (a new message when the channel changed or it is gone). */
export async function updateBoard(ctx, guild) {
  const channel = setting(ctx, 'channel', null);
  if (!channel?.id || channel.guild !== guild) return false;
  const message = { embeds: [await boardEmbed(ctx, guild)] };
  const board = await readJson(ctx, `board:${guild}`, null);
  const edited = board?.channel === channel.id && board.message
    ? await ctx.message.edit(channel.id, board.message, message).then(() => true, () => false)
    : false;
  if (!edited) {
    const id = await ctx.message.send(channel.id, message);
    await writeJson(ctx, `board:${guild}`, { channel: channel.id, message: id });
  }
  return true;
}

// One refresh per server at a time; changes during a refresh run it once more.
const refreshing = new Map();

/** Refreshes the board of a server (events, settings save), bursts merged. */
export function refreshBoard(ctx, guild) {
  const state = refreshing.get(guild);
  if (state) {
    state.again = true;
    return state.done;
  }
  const next = { again: false, done: null };
  next.done = (async () => {
    try {
      do {
        next.again = false;
        await updateBoard(ctx, guild);
      } while (next.again);
    } finally {
      refreshing.delete(guild);
    }
  })();
  refreshing.set(guild, next);
  return next.done;
}

/** The server of the board (the board channel's), or null. */
export function boardGuild(ctx) {
  const channel = setting(ctx, 'channel', null);
  return channel?.id && channel.guild ? channel.guild : null;
}

/** Task: statuses older than "auto_off_hours" go off; the board refreshes. */
export async function tick(ctx, now = Date.now()) {
  const channel = setting(ctx, 'channel', null);
  if (!channel?.guild) return 0;
  const guild = channel.guild;
  const hours = Number(setting(ctx, 'auto_off_hours', 12)) || 0;
  let changed = 0;
  if (hours > 0) {
    for (const u of await readJson(ctx, `u:${guild}`, [])) {
      const e = await statusOf(ctx, guild, u);
      if (e && e.status !== 'off' && now - e.since > hours * 3_600_000) {
        await setStatus(ctx, guild, u, 'off', '', now);
        changed++;
      }
    }
  }
  await updateBoard(ctx, guild);
  return changed;
}
