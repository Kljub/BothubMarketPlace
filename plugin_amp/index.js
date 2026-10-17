// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/<name>.js -> blocks; services/interactions.js -> the buttons
//   (key "amp") and the login modal ("ampl"); the task "options" fills the
//   dropdowns of the settings page (game servers, templates).
import login from './nodes/login.js';
import servers from './nodes/servers.js';
import info from './nodes/info.js';
import power from './nodes/power.js';
import backup from './nodes/backup.js';
import create from './nodes/create.js';
import settings from './nodes/settings.js';
import { components, modals, refreshOptions } from './services/interactions.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { login, servers, info, power, backup, create, settings },
  components,
  modals,
  tasks: {
    async options(ctx) {
      await refreshOptions(ctx).catch((err) => ctx.logger.warn(`AMP options: ${err?.message ?? err}`));
    },
  },
  async onEnable(ctx) {
    await refreshOptions(ctx).catch(() => undefined);
  },
};
