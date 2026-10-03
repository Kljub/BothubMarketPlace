// Entry file ("main" in bothub.json): joins the layers into the plugin object.
//   nodes/<name>.js -> blocks (definition: nodes/<name>.json)
//   services/tasks.js -> tasks (schedule: bothub.json "services.tasks")
// commands/ and dashboard/ need no code; the core reads them from bothub.json.
import search from './nodes/search.js';
import track from './nodes/track.js';
import untrack from './nodes/untrack.js';
import trackedList from './nodes/tracked_list.js';
import airingToday from './nodes/airing_today.js';
import { tasks } from './services/tasks.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  blocks: { search, track, untrack, tracked_list: trackedList, airing_today: airingToday },
  tasks,
};
