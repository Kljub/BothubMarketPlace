// Node plugin.plugin_forge.imagine: text to image. Queues the image and
// returns at once; it is posted in the channel when it is ready.
import { imagine as run } from '../services/flow.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default function imagine(ctx, { config, vars, interaction }) {
  return run(ctx, { prompt: config.prompt, negative: config.negative, steps: config.steps, cfg: config.cfg, width: config.width, height: config.height, seed: config.seed }, vars, interaction);
}
