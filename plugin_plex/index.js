// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/<name>.js -> blocks, services/tasks.js -> tasks,
//   services/webhooks.js -> webhooks, the "Again" button -> components.
import status from './nodes/status.js';
import nowPlaying from './nodes/now_playing.js';
import search from './nodes/search.js';
import random from './nodes/random.js';
import recommend from './nodes/recommend.js';
import request from './nodes/request.js';
import link from './nodes/link.js';
import unlinkAccount from './nodes/unlink_account.js';
import libraries from './nodes/libraries.js';
import watchlist from './nodes/watchlist.js';
import watchlistAdd from './nodes/watchlist_add.js';
import watchlistRemove from './nodes/watchlist_remove.js';
import { reroll } from './services/blocks.js';
import { tasks } from './services/tasks.js';
import { refreshLibraryOptions } from './services/plex.js';
import { webhooks } from './services/webhooks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { status, now_playing: nowPlaying, search, random, recommend, request, link, unlink_account: unlinkAccount, libraries,
    watchlist, watchlist_add: watchlistAdd, watchlist_remove: watchlistRemove },
  components: { reroll },
  tasks,
  webhooks,
  // The library dropdown of the settings is filled when the bot starts.
  async onEnable(ctx) {
    await refreshLibraryOptions(ctx).catch((err) => ctx.logger.warn(`library list: ${err?.message ?? err}`));
  },
};
