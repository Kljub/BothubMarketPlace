// Service "owm": current weather from OpenWeatherMap (free API, "Current
// weather data"). The API key is the admin's secret WEATHER_API_KEY
// (Admin > API / Secrets, shared with this plugin); it is never stored in
// the plugin's settings.
import { setting } from './util.js';

export const API = 'https://api.openweathermap.org/data/2.5/weather';

const EMOJIS = {
  Thunderstorm: '⛈️', Drizzle: '🌦️', Rain: '🌧️', Snow: '❄️', Mist: '🌫️', Smoke: '🌫️', Haze: '🌫️', Dust: '🌪️',
  Fog: '🌫️', Sand: '🌪️', Ash: '🌋', Squall: '💨', Tornado: '🌪️', Clear: '☀️', Clouds: '☁️',
};

export const emojiFor = (main) => EMOJIS[main] ?? '🌡️';

const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const windDirection = (deg) => DIRECTIONS[Math.round((Number(deg) || 0) / 45) % 8];

/** A missing key or a key OpenWeatherMap refuses: the text tells the admin what to do. */
export class WeatherError extends Error {}

/**
 * Current weather of a place (city, "city,country" or zip code). null when
 * OpenWeatherMap does not know the place.
 */
export async function currentWeather(ctx, place) {
  const key = await ctx.secrets.get('WEATHER_API_KEY');
  if (!key) throw new WeatherError('The weather API key is not set up. An admin adds the secret WEATHER_API_KEY under Admin → API / Secrets and shares it with the Weather plugin in the App Store.');
  const units = setting(ctx, 'units', 'metric') === 'imperial' ? 'imperial' : 'metric';
  const lang = String(setting(ctx, 'language', 'en'));
  const res = await ctx.http.get(API, { query: { q: place, appid: key, units, lang } });
  if (res.status === 404) return null;
  if (res.status === 401) throw new WeatherError('OpenWeatherMap refused the API key (new keys need up to 2 hours to work).');
  if (res.status === 429) throw new WeatherError('Too many weather requests right now. Try again in a minute.');
  if (res.status !== 200 || !res.json) throw new WeatherError(`OpenWeatherMap answered with HTTP ${res.status}.`);
  return { data: res.json, units };
}

/** The values of a weather answer as block results. */
export function weatherResults(data, units) {
  const deg = units === 'imperial' ? '°F' : '°C';
  const speed = units === 'imperial' ? 'mph' : 'm/s';
  const w = data.weather?.[0] ?? {};
  const description = String(w.description ?? '–');
  const round = (n) => (typeof n === 'number' ? n.toFixed(1) : '–');
  return {
    '': description.charAt(0).toUpperCase() + description.slice(1),
    '.place': [data.name, data.sys?.country].filter(Boolean).join(', '),
    '.emoji': emojiFor(w.main),
    '.temp': `${round(data.main?.temp)}${deg}`,
    '.feels_like': `${round(data.main?.feels_like)}${deg}`,
    '.humidity': `${data.main?.humidity ?? '–'}%`,
    '.wind': `${data.wind?.speed ?? '–'} ${speed} ${windDirection(data.wind?.deg)}`,
    // Discord timestamps: every reader sees their own local time.
    '.sunrise': data.sys?.sunrise ? `<t:${data.sys.sunrise}:t>` : '–',
    '.sunset': data.sys?.sunset ? `<t:${data.sys.sunset}:t>` : '–',
    '.icon': w.icon ? `https://openweathermap.org/img/wn/${w.icon}@2x.png` : '',
  };
}
