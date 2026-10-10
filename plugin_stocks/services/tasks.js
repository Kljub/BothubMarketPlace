// Task board_update (every 5 minutes, bothub.json "services.tasks"): keeps
// the price board of the setting board_channel current.
import { syncBoard } from './blocks.js';

export const tasks = {
  async board_update(ctx) {
    await syncBoard(ctx);
  },
};

/** Settings saved: the board goes to the chosen channel at once. */
export async function onConfigChange(ctx) {
  await syncBoard(ctx, { force: true });
}
