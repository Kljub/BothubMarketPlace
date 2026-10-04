// Node plugin.plugin_arcenciel.imagine: text to image. Queues the job and
// returns at once; the image is posted in the channel when it is ready.
// Ports: replied (a command was answered), queued (no command), limited,
// not_set_up, failed.
import { generate } from '../services/generate.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default function imagine(ctx, { config, vars, interaction }) {
  return generate(ctx, {
    prompt: config.prompt, negative: config.negative, steps: config.steps, cfg: config.cfg, width: config.width, height: config.height,
  }, vars, interaction);
}
