// Entry file ("main" in bothub.json): joins the layers into the plugin object.
import stocks from './nodes/stocks.js';
import buy from './nodes/buy.js';
import sell from './nodes/sell.js';
import portfolio from './nodes/portfolio.js';
import { onConfigChange, tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { stocks, buy, sell, portfolio },
  tasks,
  onConfigChange,
};
