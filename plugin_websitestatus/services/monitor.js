// Service "monitor": checks the websites of the settings and keeps one status
// board in the chosen channel. ctx.http.check ("http.check") answers only
// status and latency, never the page. Websites with the same group share one
// embed; the others get their own. The board is one message with up to 10
// embeds (more embeds: more messages), edited on every check, so a check
// round costs one Discord call per 10 embeds.
//
// Storage (per bot): "status:<site _id>" = { status, latencyMs, code, at },
// "board" = { channel, messages: [ids] }, "last_run" = ms.
import { readJson, setting, writeJson } from './util.js';

export const STATUS = {
  green: { emoji: '🟢', key: 'online', color: '#22c55e' },
  yellow: { emoji: '🟡', key: 'warning', color: '#eab308' },
  red: { emoji: '🔴', key: 'offline', color: '#ef4444' },
};
const RANK = { green: 0, yellow: 1, red: 2 };
const INTERVALS = { '1m': 1, '5m': 5, '10m': 10, '15m': 15, '30m': 30, '1h': 60, '24h': 1440 };
const EMBEDS_PER_MESSAGE = 10;
const CHECK_TIMEOUT_MS = 5000;

export const TEXT = {
  en: { status: 'Status', online: 'Online', warning: 'Warning', offline: 'Offline', next: 'Next check', unchecked: 'Not checked yet', checked: 'Websites checked', none: 'No websites are set up.' },
  de: { status: 'Status', online: 'Online', warning: 'Warnung', offline: 'Offline', next: 'Nächster Check', unchecked: 'Noch nicht geprüft', checked: 'Websites geprüft', none: 'Es sind keine Websites eingerichtet.' },
};

/** Minutes between two check rounds (setting "interval"). */
export function intervalMinutes(ctx) {
  return INTERVALS[setting(ctx, 'interval', '5m')] ?? 5;
}

/** The websites of the settings that have a name and an http(s) address. */
export function sites(ctx) {
  return setting(ctx, 'sites', []).filter((s) => s && String(s.name ?? '').trim() && /^https?:\/\//i.test(String(s.url ?? '')));
}

/** Green: answers below 400 within the slow limit; yellow: 4xx or slow; red: 5xx or no answer. */
export function classify(answer, slowMs) {
  if (!answer || answer.status === null || answer.status >= 500) return 'red';
  if (answer.status >= 400 || (answer.latencyMs ?? 0) > slowMs) return 'yellow';
  return 'green';
}

/** Checks every website at once (a task has 10 s) and stores the results. */
export async function checkAll(ctx) {
  const slowMs = Number(setting(ctx, 'slow_ms', '1500')) || 1500;
  const list = sites(ctx);
  const results = await Promise.all(
    list.map(async (site) => {
      const answer = await ctx.http.check(site.url, { timeoutMs: CHECK_TIMEOUT_MS }).catch(() => null);
      const result = { status: classify(answer, slowMs), latencyMs: answer?.latencyMs ?? null, code: answer?.status ?? null, at: Date.now() };
      await writeJson(ctx, `status:${site._id}`, result);
      return { site, ...result };
    }),
  );
  await ctx.storage.set('last_run', String(Date.now()));
  return results;
}

/** One website: "🟢 Status: **Online** - Google - 123 ms" (HTTP code when it failed). */
export function line(t, r, name) {
  if (!r) return `⚪ ${t.status}: ${t.unchecked} - ${name}`;
  const parts = [`${STATUS[r.status].emoji} ${t.status}: **${t[STATUS[r.status].key]}**`, name];
  if (r.latencyMs != null) parts.push(`${r.latencyMs} ms`);
  if (r.code >= 400) parts.push(`HTTP ${r.code}`);
  return parts.join(' - ');
}

/**
 * The board's embeds: groups and single websites in the order of the
 * settings; the first one carries the countdown to the next check.
 */
export function boardEmbeds(ctx, results, nextAt, lang = 'en') {
  const t = TEXT[lang] ?? TEXT.en;
  const descriptions = new Map(setting(ctx, 'groups', []).map((g) => [String(g.name ?? '').trim(), String(g.description ?? '').trim()]));
  const blocks = [];
  const byGroup = new Map();
  for (const r of results) {
    const group = String(r.site.group ?? '').trim();
    if (!group) {
      blocks.push({ title: r.site.name, items: [r] });
      continue;
    }
    if (!byGroup.has(group)) {
      byGroup.set(group, { title: `📡 ${group}`, group, items: [] });
      blocks.push(byGroup.get(group));
    }
    byGroup.get(group).items.push(r);
  }
  const countdown = `⏱️ **${t.next}:** <t:${Math.floor(nextAt / 1000)}:R>`;
  return blocks.slice(0, EMBEDS_PER_MESSAGE * 5).map((b, i) => {
    const worst = b.items.reduce((acc, r) => (RANK[r.status] > RANK[acc] ? r.status : acc), 'green');
    const head = [];
    if (i === 0) head.push(countdown);
    if (b.group && descriptions.get(b.group)) head.push(descriptions.get(b.group));
    const embed = { color: STATUS[worst].color, title: String(b.title).slice(0, 256), timestamp: true };
    embed.description = [...head, ...b.items.slice(0, 40).map((r) => line(t, r, r.site.name))].join('\n').slice(0, 4096);
    return embed;
  });
}

/** Posts the board, or edits the messages of the last round (new ones when the channel changed or a message is gone). */
export async function postBoard(ctx, embeds) {
  const channel = setting(ctx, 'channel', null);
  if (!channel?.id || !embeds.length) return 0;
  const board = await readJson(ctx, 'board', { channel: null, messages: [] });
  const old = board.channel === channel.id ? board.messages : [];
  const messages = [];
  for (let i = 0; i * EMBEDS_PER_MESSAGE < embeds.length; i++) {
    const message = { embeds: embeds.slice(i * EMBEDS_PER_MESSAGE, (i + 1) * EMBEDS_PER_MESSAGE) };
    const id = old[i];
    const edited = id ? await ctx.message.edit(channel.id, id, message).then(() => true, () => false) : false;
    messages.push(edited ? id : await ctx.message.send(channel.id, message));
  }
  // Messages of a bigger board before go away.
  for (const id of old.slice(messages.length)) await ctx.message.delete(channel.id, id).catch(() => undefined);
  await writeJson(ctx, 'board', { channel: channel.id, messages });
  return messages.length;
}

/** One round: check, then update the board. */
export async function runRound(ctx, lang) {
  const results = await checkAll(ctx);
  const nextAt = Date.now() + intervalMinutes(ctx) * 60_000;
  await postBoard(ctx, boardEmbeds(ctx, results, nextAt, lang));
  return results;
}

/** Due: the interval passed, or a website was added and has no result yet. */
export async function due(ctx, now = Date.now()) {
  const last = Number((await ctx.storage.get('last_run')) ?? 0);
  if (now - last >= intervalMinutes(ctx) * 60_000) return true;
  for (const s of sites(ctx)) if (!(await ctx.storage.has(`status:${s._id}`))) return true;
  return false;
}
