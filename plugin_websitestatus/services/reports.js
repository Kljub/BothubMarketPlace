// Service "reports": user reports like Downdetector, inside the server.
// Members report a website or service with /sitereport; when at least
// "report_threshold" members did so within "report_window" minutes, the
// next check shows it as a warning (even when its check is green), with
// the number of reports. One report per member and entry per window.
// Storage: "rp:<_id>" = [{ u: userId, at: ms }].
import { readJson, setting, writeJson } from './util.js';

const WINDOWS = { '15m': 15, '30m': 30, '1h': 60, '3h': 180 };

/** On (setting "reports", default on), threshold and window in ms. */
export function reportRules(ctx) {
  return {
    on: setting(ctx, 'reports', true) !== false,
    threshold: Math.max(1, Number(setting(ctx, 'report_threshold', '3')) || 3),
    windowMs: (WINDOWS[setting(ctx, 'report_window', '30m')] ?? 30) * 60_000,
  };
}

/** The reports of one entry within the window. */
export async function recentReports(ctx, id, now = Date.now()) {
  const { windowMs } = reportRules(ctx);
  const list = await readJson(ctx, `rp:${id}`, []);
  return Array.isArray(list) ? list.filter((r) => r && now - r.at < windowMs) : [];
}

/** Adds a member's report; false when the member reported it within the window already. */
export async function addReport(ctx, id, user, now = Date.now()) {
  const list = await recentReports(ctx, id, now);
  if (list.some((r) => r.u === user)) return { added: false, count: list.length };
  list.push({ u: user, at: now });
  await writeJson(ctx, `rp:${id}`, list.slice(-200));
  return { added: true, count: list.length };
}

/** Number of recent reports per entry id. */
export async function reportCounts(ctx, ids, now = Date.now()) {
  if (!reportRules(ctx).on) return new Map();
  return new Map(await Promise.all(ids.map(async (id) => [id, (await recentReports(ctx, id, now)).length])));
}
