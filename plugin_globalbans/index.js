// Entry file ("main" in bothub.json): ban events spread bans
// (services/bans.js), /globalban and /globalunban by hand, and the task
// that works through big queues.
import ban from './nodes/ban.js';
import unban from './nodes/unban.js';
import guildBanAdd from './events/guildBanAdd.js';
import guildBanRemove from './events/guildBanRemove.js';
import { work } from './services/bans.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { ban, unban },
  events: { guildBanAdd, guildBanRemove },
  tasks: { work: (ctx) => work(ctx) },
};
