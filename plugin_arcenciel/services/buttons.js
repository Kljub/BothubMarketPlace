// The buttons under generated images and the model list of /arc-models
// ("discord.interactions.reply").
import { again } from './generate.js';
import { pageModels, pickModel, resetModel } from './models.js';
import { setting } from './util.js';

const color = (ctx) => String(setting(ctx, 'color', '#e879f9'));

export const components = {
  upscale: (ctx, ev) => again(ctx, ev, 'upscale'),
  regen: (ctx, ev) => again(ctx, ev, 'regen'),
  models_pick: (ctx, ev) => pickModel(ctx, ev, color(ctx)),
  models_page: (ctx, ev) => pageModels(ctx, ev, color(ctx)),
  models_reset: (ctx, ev) => resetModel(ctx, ev, color(ctx)),
};
