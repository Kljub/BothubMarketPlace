// Service "alerts": the downtime detector's messages. After every round each
// website and service is compared with its last state: after "alert_after"
// bad checks in a row (offline, or also warning with alert_on = warning) a
// "down" message goes to the alert channel; when it is good again, a
// "back up" message with the downtime.
// Storage: "al:<_id>" = { bad, down, since }.
import { STATUS } from './monitor.js';
import { readJson, setting, writeJson } from './util.js';

export const ALERT_TEXT = {
  en: { down: '{emoji} **{name}** is {state}', up: '🟢 **{name}** is back up after {duration}', offline: 'down', warning: 'having problems', page: 'Reports page', reported: '👥 {n} user reports' },
  de: { down: '{emoji} **{name}** ist {state}', up: '🟢 **{name}** läuft wieder nach {duration}', offline: 'ausgefallen', warning: 'gestört', page: 'Meldeseite', reported: '👥 {n} Nutzermeldungen' },
};

/** "1 h 5 min", "12 min", "40 s". */
export function duration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** Sends the down and back-up messages of one round; returns how many were sent. */
export async function alert(ctx, results, lang = 'en', now = Date.now()) {
  const channel = setting(ctx, 'alert_channel', null)?.id;
  if (!channel) return 0;
  const t = ALERT_TEXT[lang] ?? ALERT_TEXT.en;
  const level = setting(ctx, 'alert_on', 'offline');
  const after = Math.max(1, Number(setting(ctx, 'alert_after', '2')) || 2);
  let sent = 0;
  for (const r of results) {
    const key = `al:${r.site._id}`;
    const prev = await readJson(ctx, key, { bad: 0, down: false, since: 0 });
    const bad = r.status === 'red' || (level === 'warning' && r.status === 'yellow');
    const next = { ...prev };
    let message = null;
    if (bad) {
      next.bad = prev.bad + 1;
      if (!prev.bad) next.since = r.at ?? now;
      if (!prev.down && next.bad >= after) {
        next.down = true;
        const state = r.status === 'red' ? t.offline : t.warning;
        const line = t.down.replace('{emoji}', STATUS[r.status].emoji).replace('{name}', r.site.name).replace('{state}', state);
        message = { embeds: [{ color: STATUS[r.status].color, description: [line, r.detail, r.code >= 400 && !r.site.service ? `HTTP ${r.code}` : '', r.reports ? t.reported.replace('{n}', r.reports) : '', r.site.link ? `[${t.page}](${r.site.link})` : ''].filter(Boolean).join('\n').slice(0, 4000), timestamp: true }] };
      }
    } else {
      if (prev.down) {
        const line = t.up.replace('{name}', r.site.name).replace('{duration}', duration(now - (prev.since || now)));
        message = { embeds: [{ color: STATUS.green.color, description: line, timestamp: true }] };
      }
      next.bad = 0;
      next.down = false;
      next.since = 0;
    }
    if (message) {
      await ctx.message.send(channel, message).then(() => sent++, () => undefined);
    }
    if (next.bad !== prev.bad || next.down !== prev.down) await writeJson(ctx, key, next);
  }
  return sent;
}
