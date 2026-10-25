// Service "tasks": "deliver" (every minute) sends the DMs a draw could not
// send in time; "cleanup" (every 6 hours) removes rounds older than 90 days.
import { deliver, getEvent, KEEP_MS, locked, removeEvent } from './wichteln.js';
import { readJson } from './util.js';

export const tasks = {
  async deliver(ctx) {
    for (const id of await readJson(ctx, 'events', [])) {
      await locked(id, async () => {
        const e = await getEvent(ctx, id);
        if (e?.drawn && e.pending?.length) await deliver(ctx, e, 3000);
      });
    }
  },

  async cleanup(ctx) {
    const now = Date.now();
    for (const id of await readJson(ctx, 'events', [])) {
      const e = await getEvent(ctx, id);
      if (!e || now - e.at > KEEP_MS) await removeEvent(ctx, id);
    }
  },
};
