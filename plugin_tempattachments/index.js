// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/*.js -> blocks, services/interactions.js -> components + modals,
//   services/tasks.js -> tasks.
import create from './nodes/create.js';
import allowRole from './nodes/allow_role.js';
import removeRole from './nodes/remove_role.js';
import deleteFile from './nodes/delete.js';
import { components, modals } from './services/interactions.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { create, allow_role: allowRole, remove_role: removeRole, delete: deleteFile },
  components,
  modals,
  tasks,
};
