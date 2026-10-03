// Node plugin.plugin_anisearch.tracked_list: the followed anime as text.
// Ports: next, empty.
import { list } from '../services/tracking.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function trackedList(ctx) {
  const items = await list(ctx);
  if (!items.length) return { port: 'empty', results: { '.count': '0' } };
  const lines = items.map((t) => `• [${t.title}](${t.url}) · #${t.id}${t.next ? ` · next ep. ${t.next}` : ''}`);
  return { results: { '': lines.join('\n').slice(0, 4000), '.count': String(items.length) } };
}
