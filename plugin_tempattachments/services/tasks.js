// Service "tasks": "sweep" (every 5 minutes) switches off the buttons of
// files that ran out, also when nobody clicks. The check on click stays the
// real rule; this keeps the messages honest.
import { byId, refresh, save } from './files.js';
import { readJson } from './util.js';

export const tasks = {
  async sweep(ctx) {
    const now = Date.now();
    for (const id of await readJson(ctx, 'ids', [])) {
      const f = await byId(ctx, id);
      if (!f || f.closed || !f.end || now <= f.end) continue;
      await refresh(ctx, f, true);
      f.closed = true;
      await save(ctx, f);
    }
  },
};
