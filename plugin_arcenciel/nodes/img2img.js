// Node plugin.plugin_arcenciel.img2img: a new image from an uploaded one
// (Discord attachment) and a prompt. strength: how much it may change
// (0.05–1, default 0.6). Ports like imagine.
import { generate } from '../services/generate.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default function img2img(ctx, { config, vars, interaction }) {
  return generate(ctx, {
    prompt: config.prompt, negative: config.negative, steps: config.steps, strength: config.strength, image: config.image ?? '',
  }, vars, interaction);
}
