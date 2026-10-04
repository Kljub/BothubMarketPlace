// Node plugin.plugin_forge.img2img: a new image from an attached image and a prompt.
import { imagine as run } from '../services/flow.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default function img2img(ctx, { config, vars, interaction }) {
  return run(ctx, { image: config.image ?? '', prompt: config.prompt, negative: config.negative, steps: config.steps, strength: config.strength, seed: config.seed }, vars, interaction);
}
