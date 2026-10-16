// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/status.js, nodes/sync_now.js -> blocks; services/sync.js -> the
//   task "tick" and the webhook "patreon"; events/guildMemberAdd.js.
import status from './nodes/status.js';
import syncNow from './nodes/sync_now.js';
import guildMemberAdd from './events/guildMemberAdd.js';
import { onWebhook, tick } from './services/sync.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { status, sync_now: syncNow },
  tasks: {
    async tick(ctx) {
      await tick(ctx).catch((err) => {
        if (err?.key?.startsWith?.('err.')) return ctx.logger.warn(`patreon sync: ${err.key}`);
        throw err;
      });
    },
  },
  webhooks: { patreon: (ctx, payload) => onWebhook(ctx, payload) },
  events: { guildMemberAdd },
};
