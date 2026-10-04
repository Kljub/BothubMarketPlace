import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock } from '#sdk-testing';
import plugin from '../index.js';
import manifest from '../bothub.json' with { type: 'json' };

const permissions = ['secrets.use'];
const BERLIN = {
  name: 'Berlin', sys: { country: 'DE', sunrise: 1791003600, sunset: 1791045000 }, timezone: 7200,
  weather: [{ main: 'Rain', description: 'light rain', icon: '10d' }],
  main: { temp: 12.34, feels_like: 11.2, humidity: 81 }, wind: { speed: 4.1, deg: 225 },
};
const owm = (seen = []) => ({
  'api.openweathermap.org': (req) => {
    seen.push(req);
    if (req.query.appid !== 'owm-key-123') return { status: 401, json: { cod: 401 } };
    return req.query.q.toLowerCase() === 'berlin' ? { json: BERLIN } : { status: 404, json: { cod: '404', message: 'city not found' } };
  },
});
const ctxWith = (opts = {}) => createTestContext({
  id: 'plugin_weather', permissions, manifest: { id: 'plugin_weather', secrets: manifest.services.secrets }, hosts: ['api.openweathermap.org'],
  secrets: { WEATHER_API_KEY: 'owm-key-123' }, web: owm(opts.seen), ...opts,
});

test('current weather: results for the embed, key from the admin secret', async () => {
  const seen = [];
  const ctx = ctxWith({ seen, config: { units: 'metric', language: 'de', color: '#123456' } });
  const out = await runBlock(plugin, 'current', ctx, { config: { location: 'Berlin' } });
  assert.equal(out.port, 'next');
  assert.equal(out.results[''], 'Light rain');
  assert.equal(out.results['.place'], 'Berlin, DE');
  assert.equal(out.results['.emoji'], '🌧️');
  assert.equal(out.results['.temp'], '12.3°C');
  assert.equal(out.results['.wind'], '4.1 m/s SW');
  assert.equal(out.results['.sunrise'], '<t:1791003600:t>');
  assert.equal(out.results['.icon'], 'https://openweathermap.org/img/wn/10d@2x.png');
  assert.equal(out.results['.color'], '#123456');
  assert.deepEqual({ units: seen[0].query.units, lang: seen[0].query.lang }, { units: 'metric', lang: 'de' });
});

test('default place, unknown place, imperial units', async () => {
  const ctx = ctxWith({ config: { default_location: 'Berlin', units: 'imperial' } });
  const out = await runBlock(plugin, 'current', ctx, { config: { location: '' } });
  assert.equal(out.results['.temp'], '12.3°F');
  assert.match(out.results['.wind'], /mph/);
  const missing = await runBlock(plugin, 'current', ctx, { config: { location: 'Atlantis' } });
  assert.equal(missing.port, 'not_found');
  assert.equal(missing.results['.place'], 'Atlantis');
});

test('no place, no shared key, refused key: readable errors', async () => {
  await assert.rejects(runBlock(plugin, 'current', ctxWith(), { config: { location: '' } }), /Name a place/);
  await assert.rejects(runBlock(plugin, 'current', ctxWith({ secrets: {} }), { config: { location: 'Berlin' } }), /not set up yet.*WEATHER_API_KEY/);
  await assert.rejects(runBlock(plugin, 'current', ctxWith({ secrets: { WEATHER_API_KEY: 'wrong' } }), { config: { location: 'Berlin' } }), /refused the API key/);
});
