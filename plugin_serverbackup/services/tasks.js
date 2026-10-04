// Service "tasks": "schedule" (every minute) makes a backup of every server
// the bot is on at the set day and time (time zone of the settings), once
// per run ("ran:<date> <time>").
import { create, zoned } from './backups.js';
import { setting } from './util.js';

export const tasks = {
  async schedule(ctx) {
    if (!setting(ctx, 'schedule', false)) return;
    const now = zoned(setting(ctx, 'timezone', 'Europe/Berlin') || 'UTC');
    if (!now) return;
    const day = setting(ctx, 'schedule_day', 'daily');
    if (day !== 'daily' && Number(day.slice(1)) !== now.weekday) return;
    if (now.time !== (setting(ctx, 'schedule_time', '03:00') || '03:00')) return;
    const key = `ran:${now.date} ${now.time}`;
    if (await ctx.storage.has(key)) return;
    await ctx.storage.set(key, '1');
    for (const g of await ctx.guild.list()) {
      await create(ctx, g.id, '', 'schedule').catch((err) => ctx.logger.warn(`scheduled backup of ${g.id}: ${err?.message ?? err}`));
    }
  },
};
