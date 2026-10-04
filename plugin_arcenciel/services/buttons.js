// The buttons under generated images ("discord.interactions.reply").
import { again } from './generate.js';

export const components = {
  upscale: (ctx, ev) => again(ctx, ev, 'upscale'),
  regen: (ctx, ev) => again(ctx, ev, 'regen'),
};
