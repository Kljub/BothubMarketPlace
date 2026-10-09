// Service "bans": spreads a ban (or unban) to every server of the bot.
//
// A ban on a source server (settings "sources", empty: every server) puts a
// job into the queue: ban the user on all other servers except "exclude".
// Bans the plugin makes itself carry the reason prefix "[Global Ban]" and
// are not spread again; unbans it makes are remembered for 2 minutes for
// the same reason. Jobs work through the servers a few at a time (events
// and tasks have 10 seconds); the task "work" goes on every minute.
//
// Storage: "q" = queue [{ op, user, reason, from, guilds: [ids left], ok, failed }],
// "b:<user>" = the global ban { from, reason, at }, "u:<user>" = time of an own unban.
import { readJson, writeJson } from './storage.js';

export const PREFIX = '[Global Ban]';
const PER_RUN_MS = 7000;
const UNBAN_ECHO_MS = 2 * 60_000;

export function setting(ctx, key, fallback) {
  const value = ctx.config.get(key);
  return value === undefined || value === null ? fallback : value;
}

/** Server or user IDs of a words field (anything else is dropped). */
export function ids(list) {
  return (Array.isArray(list) ? list : []).map((x) => String(x).replace(/\D/g, '')).filter((x) => /^\d{17,20}$/.test(x));
}

/** Does a ban on this server spread? */
export function isSource(ctx, guildId) {
  const sources = ids(setting(ctx, 'sources', []));
  return sources.length === 0 || sources.includes(guildId);
}

export function isTrusted(ctx, userId) {
  return ids(setting(ctx, 'trusted', [])).includes(userId);
}

/** Puts a ban or unban of a user on every other server into the queue; returns the number of servers. */
export async function enqueue(ctx, op, user, from, reason) {
  const exclude = ids(setting(ctx, 'exclude', []));
  const guilds = (await ctx.guild.list()).map((g) => g.id).filter((id) => id !== from && !exclude.includes(id));
  if (op === 'ban') await writeJson(ctx, `b:${user}`, { from, reason, at: Date.now() });
  else {
    await ctx.storage.delete(`b:${user}`);
    await ctx.storage.set(`u:${user}`, String(Date.now()));
  }
  const queue = await readJson(ctx, 'q', []);
  // A newer job for the same user replaces an unfinished older one (ban after unban or back).
  const rest = queue.filter((j) => j.user !== user);
  rest.push({ op, user, reason: String(reason ?? '').slice(0, 300), from, guilds, ok: 0, failed: [] });
  await writeJson(ctx, 'q', rest.slice(-50));
  return guilds.length;
}

/** An own unban seen again on another server (not spread a second time). */
export async function ownUnban(ctx, user) {
  const at = Number(await ctx.storage.get(`u:${user}`));
  return Number.isFinite(at) && Date.now() - at < UNBAN_ECHO_MS;
}

/** Works through the queue for up to 7 seconds; reports finished jobs to the log channel. */
export async function work(ctx, now = () => Date.now()) {
  const start = now();
  const queue = await readJson(ctx, 'q', []);
  const done = [];
  for (const job of queue) {
    while (job.guilds.length && now() - start < PER_RUN_MS) {
      const g = job.guilds.shift();
      try {
        if (job.op === 'ban') await ctx.member.ban(g, job.user, `${PREFIX} ${job.reason || 'banned on another server'}`.slice(0, 500));
        else await ctx.member.unban(g, job.user, `${PREFIX} unbanned`);
        job.ok += 1;
      } catch (err) {
        // Not banned there (unban), missing permission, the member is above the bot …
        if (job.failed.length < 25) job.failed.push(g);
      }
    }
    if (!job.guilds.length) done.push(job);
    if (now() - start >= PER_RUN_MS) break;
  }
  await writeJson(ctx, 'q', queue.filter((j) => j.guilds.length));
  for (const job of done) await report(ctx, job);
  return done.length;
}

async function report(ctx, job) {
  const log = setting(ctx, 'log_channel', null);
  if (!log?.id) return;
  const ban = job.op === 'ban';
  const lines = [
    `${ban ? '🔨' : '🕊️'} <@${job.user}> (\`${job.user}\`) was ${ban ? 'banned' : 'unbanned'} on **${job.ok}** server${job.ok === 1 ? '' : 's'}.`,
    job.from ? `Started on server \`${job.from}\`.` : '',
    job.reason ? `Reason: ${job.reason}` : '',
    job.failed.length ? `Not possible on ${job.failed.length} server(s) (permission, role order or ${ban ? 'already banned' : 'not banned'}): ${job.failed.map((g) => `\`${g}\``).join(', ')}` : '',
  ].filter(Boolean);
  await ctx.message.send(log.id, { embeds: [{ color: ban ? '#ef4444' : '#22c55e', title: ban ? '🌐 Global ban' : '🌐 Global unban', description: lines.join('\n').slice(0, 4000) }] }).catch(() => undefined);
}
