// Node plugin.plugin_websitestatus.site_status: the last result of one
// website or service of the settings (by name), e.g. for a /status command.
// Port "not_found" when nothing has that name; "unchecked" before its first
// check. Services: .url is their status page, .detail what it says.
import { findEntry, STATUS } from '../services/monitor.js';
import { readJson } from '../services/util.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function siteStatus(ctx, { config }) {
  const site = findEntry(ctx, config.site);
  if (!site) return { port: 'not_found' };
  const r = await readJson(ctx, `status:${site._id}`, null);
  if (!r) return { port: 'unchecked', results: { '.name': site.name, '.url': site.url } };
  return {
    port: 'next',
    results: {
      '': STATUS[r.status].key,
      '.emoji': STATUS[r.status].emoji,
      '.name': site.name,
      '.url': site.url,
      '.latency': r.latencyMs != null ? `${r.latencyMs} ms` : '—',
      '.code': r.code != null ? String(r.code) : '—',
      '.checked': `<t:${Math.floor(r.at / 1000)}:R>`,
      '.color': STATUS[r.status].color,
      '.detail': r.detail || '—',
      '.reports': String(r.reports ?? 0),
    },
  };
}
