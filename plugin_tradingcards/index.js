// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/<name>.js -> blocks (code in services/blocks.js)
//   trade offer buttons -> components.trade_yes / trade_no
import open from './nodes/open.js';
import collection from './nodes/collection.js';
import show from './nodes/show.js';
import trade from './nodes/trade.js';
import gift from './nodes/gift.js';
import { tradeNo, tradeYes } from './services/blocks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { open, collection, show, trade, gift },
  components: { trade_yes: tradeYes, trade_no: tradeNo },
};
