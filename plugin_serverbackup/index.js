// Entry file ("main" in bothub.json): joins the layers into the plugin object.
import create from './nodes/create.js';
import info from './nodes/info.js';
import del from './nodes/delete.js';
import restore from './nodes/restore.js';
import clone from './nodes/clone.js';
import { components } from './services/interactions.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { create, info, delete: del, restore, clone },
  components,
  tasks,
};
