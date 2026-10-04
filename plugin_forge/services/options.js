// Service "options": fills the dropdowns of the settings page (checkpoint,
// sampler, scheduler, upscaler) with what the Forge server offers
// (ctx.config.setOptions). Runs when the plugin starts and every 30 minutes
// (task "options").
import { lists } from './forge.js';

export async function refreshOptions(ctx) {
  try {
    const l = await lists(ctx);
    await ctx.config.setOptions('checkpoint', l.models.slice(0, 200));
    await ctx.config.setOptions('sampler', l.samplers.slice(0, 200));
    await ctx.config.setOptions('scheduler', l.schedulers.slice(0, 200));
    await ctx.config.setOptions('upscaler', l.upscalers.slice(0, 200));
    return true;
  } catch (err) {
    await ctx.logger.warn(`forge: lists not loaded (${String(err?.message ?? err).slice(0, 200)})`);
    return false;
  }
}

export const tasks = {
  options: (ctx) => refreshOptions(ctx),
};
