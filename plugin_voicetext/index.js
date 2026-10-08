// Entry file ("main" in bothub.json): the voice event does all the work
// (services/link.js); the settings page needs no code.
import voiceStateUpdate from './events/voiceStateUpdate.js';

/** @type {import('@bothub/sdk').PluginDefinition} */
export default {
  events: { voiceStateUpdate },
};
