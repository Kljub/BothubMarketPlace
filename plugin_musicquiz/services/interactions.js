// Service "interactions": the buttons of the round messages (key "mq",
// data "a:<game>:<round>:<answer>", "s:<game>:<round>" reveal,
// "x:<game>" stop).
import { click } from './game.js';

export const components = {
  mq: (ctx, ev) => click(ctx, ev),
};
