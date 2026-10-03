// Node plugin.plugin_weather.current: the current weather of a place (the
// node's location, else the default place of the settings). Port
// "not_found" when OpenWeatherMap does not know the place.
import { currentWeather, weatherResults } from '../services/owm.js';
import { setting } from '../services/util.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function current(ctx, { config }) {
  const place = String(config.location ?? '').trim() || String(setting(ctx, 'default_location', '')).trim();
  if (!place) throw new Error('Name a place, e.g. /weather Berlin (or set a default place in the plugin settings).');
  const answer = await currentWeather(ctx, place.slice(0, 100));
  if (!answer) return { port: 'not_found', results: { '.place': place } };
  return { port: 'next', results: { ...weatherResults(answer.data, answer.units), '.color': String(setting(ctx, 'color', '#5865f2')) } };
}
