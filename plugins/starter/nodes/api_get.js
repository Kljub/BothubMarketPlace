// Node plugin.starter.api_get: GET <endpoint><path>?<query>, optionally one
// field of the JSON answer. Port "failed" on HTTP errors (status >= 400).
import { get, parseQuery, pick } from '../services/api.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function apiGet(ctx, { config }) {
  const res = await get(ctx, String(config.path || '/'), parseQuery(config.query));
  const status = String(res.status);
  if (res.status >= 400) return { port: 'failed', results: { '.status': status } };
  const value = res.json === null ? res.text : pick(res.json, config.field);
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return { results: { '': text.slice(0, 4000), '.status': status } };
}
