import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runTask } from '#sdk-testing';
import plugin from '../index.js';
import manifest from '../bothub.json' with { type: 'json' };
import { duration } from '../services/alerts.js';
import { jsonOf, psnRegion, readAws, readAzure, readGcp, readPsn, readStatuspage, readXbox } from '../services/providers.js';

const BOARD = '900000000000000002';
const ALERTS = '900000000000000003';
const NOW = Date.UTC(2026, 9, 16, 12);
const sec = (ms) => String(Math.floor(ms / 1000));

/** UTF-16LE JSON as the bot hands it over: decoded as UTF-8, so with zero bytes between the letters. */
const utf16 = (value) => Buffer.from(`﻿${JSON.stringify(value)}`, 'utf16le').toString('utf8');

test('readers: Statuspage, AWS (region, recent only), Google Cloud, Azure, PlayStation, Xbox', () => {
  assert.deepEqual(readStatuspage({ status: { indicator: 'none', description: 'All Systems Operational' }, incidents: [] }), { status: 'green', detail: '' });
  assert.deepEqual(readStatuspage({ status: { indicator: 'minor' }, incidents: [{ name: 'API latency', status: 'investigating' }] }), { status: 'yellow', detail: 'API latency' });
  assert.equal(readStatuspage({ status: { indicator: 'critical' }, incidents: [] }).status, 'red');
  assert.equal(readStatuspage({ status: { indicator: 'major' }, incidents: [] }).status, 'yellow', 'major: a few locations');

  const events = [
    { date: sec(NOW - 3_600_000), arn: 'arn:aws:health:eu-central-1::event/EC2/x', service: 'ec2-eu-central-1', service_name: 'Amazon EC2', region_name: 'Frankfurt', summary: 'Increased error rates', status: '2', event_log: [] },
    { date: sec(NOW - 200 * 86_400_000), arn: 'arn:aws:health:me-central-1::event/x', service: 'multipleservices-me-central-1', service_name: 'Multiple services', region_name: 'UAE', summary: 'Region Availability', status: '3', event_log: [{ timestamp: Number(sec(NOW - 100 * 86_400_000)) }] },
  ];
  assert.deepEqual(readAws(events, '', NOW), { status: 'yellow', detail: 'Amazon EC2 · Frankfurt: Increased error rates' }, 'old events do not count');
  assert.equal(readAws(events, 'us-east-1', NOW).status, 'green');
  assert.equal(readAws(events, 'eu-central-1', NOW).status, 'yellow');
  assert.deepEqual(jsonOf({ status: 200, json: null, text: utf16(events) }), events, 'UTF-16 answers are read');

  assert.equal(readGcp([{ end: '2026-10-01', severity: 'high' }], '').status, 'green');
  assert.deepEqual(readGcp([{ severity: 'high', external_desc: 'BigQuery errors', affected_products: [{ title: 'BigQuery' }] }], 'bigquery'), { status: 'red', detail: 'BigQuery errors' });
  assert.equal(readGcp([{ severity: 'low', affected_products: [{ title: 'BigQuery' }] }], 'compute').status, 'green');

  assert.equal(readAzure('<rss><channel><title>Azure Status</title></channel></rss>').status, 'green');
  assert.deepEqual(readAzure('<rss><channel><item><title>Storage &amp; VMs in West Europe</title></item></channel></rss>'), { status: 'yellow', detail: 'Storage & VMs in West Europe' });

  assert.equal(readPsn({ status: [] }).status, 'green');
  assert.deepEqual(readPsn({ status: [{ statusType: 'Outage', message: { messages: { 'en-US': 'PlayStation Store is down.' } } }], countries: [] }), { status: 'red', detail: 'PlayStation Store is down.' });
  // An outage in one country: a warning for the region, nothing for other countries, red there.
  const ru = { statusType: 'Outage', message: { messageKey: 'tbone.playStationStore.outage', messages: { 'ru-RU': 'Возможно…' } } };
  const psn = { status: [ru], countries: [{ countryCode: 'RU', status: [ru] }, { countryCode: 'DE', status: [] }] };
  assert.deepEqual(readPsn(psn, ''), { status: 'yellow', detail: 'PlayStation Store: Outage (RU)' });
  assert.equal(readPsn(psn, 'DE').status, 'green');
  assert.deepEqual(readPsn(psn, 'RU'), { status: 'red', detail: 'PlayStation Store: Outage' });
  assert.equal(psnRegion('US'), 'SCEA');
  assert.equal(psnRegion('de'), 'SCEE');
  assert.equal(psnRegion('SCEJ'), 'SCEJ');

  assert.equal(readXbox('<ServiceStatus><Status><Overall><State>None</State></Overall></Status></ServiceStatus>').status, 'green');
  const xbox = '<ServiceStatus><Status><Overall><State>Limited</State></Overall></Status><CoreServices><Category><Id>1</Id><Name>Multiplayer</Name><Status><Name>Limited</Name><Id>2</Id></Status></Category><Category><Id>2</Id><Name>Store</Name><Status><Name>None</Name><Id>1</Id></Status></Category></CoreServices></ServiceStatus>';
  assert.deepEqual(readXbox(xbox), { status: 'yellow', detail: 'Multiplayer' });
});

/** Fake status pages and game server APIs. */
function web(state) {
  return {
    'discordstatus.com': () => ({ json: state.discord }),
    'health.aws.amazon.com': () => ({ text: utf16(state.aws), headers: { 'content-type': 'application/json;charset=utf-16' } }),
    'api.mcsrvstat.us': (req) => ({ json: req.url.endsWith('/mc.example.com') ? state.mc : { online: false } }),
    'api.steampowered.com': (req) => (req.query.key !== 'steam-key' ? { status: 403, json: {} } : { json: { response: { servers: req.query.filter === '\\addr\\1.2.3.4:27015' && state.steamUp ? [{ name: 'My Rust', players: 7, max_players: 50, map: 'Procedural Map' }] : [] } } }),
  };
}

const SERVICES = [
  { _id: 's1', service: 'discord', target: '', name: '', group: '' },
  { _id: 's2', service: 'aws', target: 'eu-central-1', name: '', group: '' },
  { _id: 's3', service: 'minecraft', target: 'mc.example.com', name: 'Our Minecraft', group: 'Game servers' },
  { _id: 's4', service: 'steam', target: '1.2.3.4:27015', name: 'Rust', group: 'Game servers', link: 'https://xn--allestrungen-9ib.de/stoerung/steam/' },
];

function ctxWith(state, config = {}, secrets = { STEAM_API_KEY: 'steam-key' }) {
  return createTestContext({
    id: 'plugin_websitestatus', permissions: manifest.sdk.permissions, hosts: manifest.services.hosts,
    manifest: { id: 'plugin_websitestatus', secrets: manifest.services.secrets }, secrets, web: web(state),
    config: { channel: { id: BOARD, guild: '1' }, interval: '1m', language: 'en', sites: [], services: SERVICES, alert_channel: { id: ALERTS, guild: '1' }, alert_after: '2', ...config },
  });
}

const fresh = () => ({
  discord: { status: { indicator: 'none' }, incidents: [] },
  aws: [],
  mc: { online: true, players: { online: 12, max: 100 }, version: '1.21.4' },
  steamUp: true,
});

test('board: services share an embed, game servers their group, with players', async () => {
  const ctx = ctxWith(fresh());
  await runTask(plugin, 'tick', ctx);
  const embeds = ctx.sent.find((s) => s.channelId === BOARD).message.embeds;
  assert.deepEqual(embeds.map((e) => e.title), ['🛰️ Services', '📡 Game servers']);
  assert.match(embeds[0].description, /🟢 Status: \*\*Online\*\* - Discord\n🟢 Status: \*\*Online\*\* - AWS \(eu-central-1\)$/);
  assert.deepEqual(embeds[1].description.split('\n'), [
    '🟢 Status: **Online** - Our Minecraft - 12/100 players · 1.21.4',
    '🟢 Status: **Online** - Rust - 7/50 players · Procedural Map · My Rust - [Reports page](https://xn--allestrungen-9ib.de/stoerung/steam/)',
  ]);
  assert.equal(ctx.sent.filter((s) => s.channelId === ALERTS).length, 0, 'all fine: no alerts');
});

test('alerts: down after two bad checks, back up with the downtime; warnings only when asked', async () => {
  const state = fresh();
  const ctx = ctxWith(state);
  const round = async () => {
    await ctx.storage.set('last_run', '0');
    await runTask(plugin, 'tick', ctx);
  };
  await round();
  state.steamUp = false;
  state.discord = { status: { indicator: 'minor' }, incidents: [{ name: 'Voice issues', status: 'investigating' }] };
  await round();
  assert.equal(ctx.sent.filter((s) => s.channelId === ALERTS).length, 0, 'one bad check is not enough');
  await round();
  const alerts = () => ctx.sent.filter((s) => s.channelId === ALERTS).map((s) => s.message.embeds[0].description);
  assert.deepEqual(alerts(), ['🔴 **Rust** is down\n[Reports page](https://xn--allestrungen-9ib.de/stoerung/steam/)'], 'Discord is only a warning');
  await round();
  assert.equal(alerts().length, 1, 'no second alert while down');
  state.steamUp = true;
  await round();
  assert.match(alerts().at(-1), /^🟢 \*\*Rust\*\* is back up after \d+ s$/);

  const warn = ctxWith({ ...fresh(), discord: { status: { indicator: 'minor' }, incidents: [{ name: 'Voice issues', status: 'identified' }] } }, { alert_on: 'warning', alert_after: '1', language: 'de' });
  await runTask(plugin, 'tick', warn);
  assert.deepEqual(warn.sent.filter((s) => s.channelId === ALERTS).map((s) => s.message.embeds[0].description), ['🟡 **Discord** ist gestört\nVoice issues']);
});

test('missing Steam key and broken status pages are warnings, not outages', async () => {
  const state = { ...fresh(), discord: null };
  const ctx = ctxWith(state, {}, {});
  await runTask(plugin, 'tick', ctx);
  const text = ctx.sent.find((s) => s.channelId === BOARD).message.embeds.map((e) => e.description).join('\n');
  assert.match(text, /🟡 Status: \*\*Warning\*\* - Rust - needs the secret STEAM_API_KEY/);
  assert.match(text, /🟡 Status: \*\*Warning\*\* - Discord - unreadable status page/);
});

test('status block finds services by name; /sitecheck counts services', async () => {
  const ctx = ctxWith(fresh());
  const out = await runBlock(plugin, 'check_now', ctx, { interaction: 'c' });
  assert.equal(out.results['.online'], '4');
  const st = await runBlock(plugin, 'site_status', ctx, { config: { site: 'our minecraft' } });
  assert.deepEqual([st.results[''], st.results['.detail']], ['online', '12/100 players · 1.21.4']);
});

test('durations', () => {
  assert.equal(duration(40_000), '40 s');
  assert.equal(duration(12 * 60_000), '12 min');
  assert.equal(duration(65 * 60_000), '1 h 5 min');
  assert.equal(duration(50 * 3_600_000), '2 d 2 h');
});

test('user reports: threshold makes a warning, one per member, /sitestatus shows it', async () => {
  const ctx = ctxWith(fresh(), { alert_on: 'warning', alert_after: '1', report_threshold: '2' });
  await runTask(plugin, 'tick', ctx);
  const report = (user, site = 'disc') => runBlock(plugin, 'report', ctx, { config: { site }, vars: { 'user.id': user }, interaction: `i-${user}` });
  assert.equal((await report('u1')).port, 'replied');
  assert.deepEqual((await report('u1')).results['.count'], '1', 'same member counts once');
  assert.equal((await report('u9', 'nothing')).port, 'not_found');
  assert.equal(ctx.sent.filter((s) => s.channelId === ALERTS).length, 0);
  await report('u2');
  // The second member reaches the threshold: a check round runs at once.
  const alerts = ctx.sent.filter((s) => s.channelId === ALERTS).map((s) => s.message.embeds[0].description);
  assert.deepEqual(alerts, ['🟡 **Discord** is having problems\n👥 2 user reports']);
  const st = await runBlock(plugin, 'site_status', ctx, { config: { site: 'Discord' } });
  assert.deepEqual([st.results[''], st.results['.reports']], ['warning', '2']);

  const one = await runBlock(plugin, 'show_status', ctx, { config: { site: 'rust' } });
  assert.equal(one.port, 'next');
  assert.match(one.results[''], /🟢 \*\*Online\*\*/);
  const all = await runBlock(plugin, 'show_status', ctx, { config: { site: '' } });
  assert.match(all.results[''], /🟡 Status: \*\*Warning\*\* - Discord - 👥 2 reports/);

  const off = ctxWith(fresh(), { reports: false });
  assert.equal((await runBlock(plugin, 'report', off, { config: { site: 'Discord' }, vars: { 'user.id': 'u1' } })).port, 'off');
});
