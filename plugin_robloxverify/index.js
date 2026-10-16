// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/verify.js, profile.js, update.js -> blocks; services/interactions.js
//   -> the "Done" and panel buttons (key "rv") and the modal "rvm";
//   events/guildMemberAdd.js; services/verify.js -> the task "tick".
import verify from './nodes/verify.js';
import profile from './nodes/profile.js';
import update from './nodes/update.js';
import guildMemberAdd from './events/guildMemberAdd.js';
import { components, modals, syncPanel } from './services/interactions.js';
import { tick } from './services/verify.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  onEnable: (ctx) => syncPanel(ctx).catch(() => undefined),
  onConfigChange: (ctx) => syncPanel(ctx).catch(() => undefined),
  blocks: { verify, profile, update },
  components,
  modals,
  events: { guildMemberAdd },
  tasks: { tick: (ctx) => tick(ctx).then(() => undefined) },
};
