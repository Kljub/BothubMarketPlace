import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runEvent, runTask, runWebhook } from '#sdk-testing';
import plugin from '../index.js';
import manifest from '../bothub.json' with { type: 'json' };
import { patron, PAGE_SIZE } from '../services/patreon.js';
import { ruleFits } from '../services/sync.js';

const G = '200000000000000001';
const ANN = '100000000000000001';
const BEN = '100000000000000002';
const GOLD = '300000000000000001';
const SILVER = '300000000000000002';
const PATRON = '300000000000000003';
const FORMER = '300000000000000004';
const ANNOUNCE = '400000000000000001';
const ref = (id) => ({ id, guild: G });

const tier = (id, title, cents) => ({ type: 'tier', id, attributes: { title, amount_cents: cents } });
/** A Patreon member with its user (Discord connection or not) and tiers. */
function m(pid, { discord = null, status = 'active_patron', tiers = [], cents = 500, name = 'Patron' } = {}) {
  return {
    data: { type: 'member', id: pid, attributes: { patron_status: status, full_name: name, currently_entitled_amount_cents: cents, lifetime_support_cents: cents * 3, pledge_relationship_start: '2026-01-02T00:00:00+00:00' }, relationships: { user: { data: { type: 'user', id: `u${pid}` } }, currently_entitled_tiers: { data: tiers.map((id) => ({ type: 'tier', id })) } } },
    user: { type: 'user', id: `u${pid}`, attributes: { full_name: name, social_connections: discord ? { discord: { user_id: discord } } : { discord: null } } },
  };
}
const TIERS = [tier('t1', 'Gold', 1000), tier('t2', 'Silver', 500)];

function patreon(state) {
  return {
    'www.patreon.com': (req) => {
      if (req.headers.Authorization !== 'Bearer creator-token') return { status: 401, json: { errors: [] } };
      if (req.url.includes('/campaigns/c1/members')) {
        const all = state.members;
        const start = Number(req.query['page[cursor]'] ?? 0);
        const page = all.slice(start, start + 2);
        const next = start + 2 < all.length ? String(start + 2) : null;
        return { json: { data: page.map((x) => x.data), included: [...page.map((x) => x.user), ...TIERS], meta: { pagination: { cursors: { next } } } } };
      }
      if (req.url.includes('/members/')) {
        const pid = req.url.split('/members/')[1].split('?')[0];
        const x = state.members.find((y) => y.data.id === pid) ?? m(pid, { status: null });
        return { json: { data: x.data, included: [x.user, ...TIERS] } };
      }
      if (req.url.endsWith('/campaigns') || req.url.includes('/campaigns?')) return { json: { data: [{ type: 'campaign', id: 'c1' }], included: TIERS } };
      return { status: 404, json: {} };
    },
  };
}

function ctxWith(state, config = {}, secrets = { PATREON_CREATOR_TOKEN: 'creator-token' }) {
  return createTestContext({
    id: 'plugin_patreon', permissions: manifest.sdk.permissions, hosts: manifest.services.hosts,
    manifest: { id: 'plugin_patreon', secrets: manifest.services.secrets }, secrets, web: patreon(state),
    config: {
      language: 'en', tiers: [{ tier: 'gold', role: ref(GOLD) }, { min_amount: 5, role: ref(SILVER) }], patron_role: ref(PATRON), former_role: ref(FORMER),
      remove_roles: true, sync_minutes: '30', announce_channel: { id: ANNOUNCE, guild: G }, ...config,
    },
  });
}

const roles = (ctx, call) => ctx.actions.filter((a) => a.call === call).map((a) => `${a.args[1]}>${a.args[2]}`);
const runAll = async (ctx) => {
  for (let i = 0; i < 5; i++) await runTask(plugin, 'tick', ctx);
};

test('patron parsing and tier rules', () => {
  const x = m('p1', { discord: ANN, tiers: ['t1'] });
  const p = patron(x.data, [x.user, ...TIERS]);
  assert.deepEqual([p.discord, p.status, p.tiers, p.cents], [ANN, 'active_patron', [{ id: 't1', title: 'Gold' }], 500]);
  assert.equal(patron(m('p2').data, [m('p2').user]).discord, null, 'no Discord connected on Patreon');
  assert.ok(ruleFits({ tier: 'GOLD' }, p));
  assert.ok(ruleFits({ tier: 't1' }, p));
  assert.ok(ruleFits({ min_amount: 5 }, p));
  assert.ok(!ruleFits({ min_amount: 5.01 }, p));
  assert.ok(!ruleFits({}, p));
  assert.equal(PAGE_SIZE, 200);
});

test('full sync over pages: roles by tier and amount, no announcement on the first pass, leavers lose roles', async () => {
  const state = { members: [m('p1', { discord: ANN, tiers: ['t1'], cents: 1000 }), m('p2'), m('p3', { discord: BEN, tiers: ['t2'], cents: 300 })] };
  const ctx = ctxWith(state);
  await runAll(ctx);
  assert.deepEqual(roles(ctx, 'member.addRole').sort(), [`${ANN}>${GOLD}`, `${ANN}>${PATRON}`, `${ANN}>${SILVER}`, `${BEN}>${PATRON}`].sort());
  assert.equal(ctx.sent.length, 0, 'existing patrons are not announced');
  const sync = JSON.parse(ctx.store.get('sync'));
  assert.deepEqual([sync.running, sync.patrons, sync.linked], [false, 3, 2]);

  // Next pass: Ben left, Ann dropped to a declined payment, Cleo is new.
  const CLEO = '100000000000000003';
  state.members = [m('p1', { discord: ANN, status: 'declined_patron', tiers: [] }), m('p4', { discord: CLEO, tiers: ['t2'], cents: 500, name: 'Cleo' })];
  ctx.store.set('sync', JSON.stringify({ ...sync, done: 1 }));
  ctx.actions.length = 0;
  await runAll(ctx);
  assert.deepEqual(roles(ctx, 'member.removeRole').sort(), [`${ANN}>${GOLD}`, `${ANN}>${PATRON}`, `${ANN}>${SILVER}`, `${BEN}>${PATRON}`].sort());
  assert.deepEqual(roles(ctx, 'member.addRole').sort(), [`${ANN}>${FORMER}`, `${CLEO}>${PATRON}`, `${CLEO}>${SILVER}`].sort());
  assert.equal(ctx.store.has(`pm:${BEN}`), false, 'Ben forgotten');
  assert.deepEqual(ctx.sent.map((s) => s.message.content), [`🎉 <@${CLEO}> is now a patron (Silver)! Thank you!`]);
});

test('/patreon shows the pledge; webhook updates one patron at once; joining gives roles back', async () => {
  const state = { members: [m('p1', { discord: ANN, tiers: ['t1'], cents: 1000, name: 'Ann' })] };
  const ctx = ctxWith(state, { language: 'de' });
  await runAll(ctx);
  const out = await runBlock(plugin, 'status', ctx, { config: { member: '' }, vars: { 'user.id': ANN, 'server.id': G }, interaction: 'i1' });
  assert.equal(out.port, 'replied');
  assert.deepEqual([out.results['.tiers'], out.results['.amount'], out.results['.active']], ['Gold', '10.00', 'true']);
  const none = await runBlock(plugin, 'status', ctx, { config: { member: '' }, vars: { 'user.id': BEN, 'server.id': G }, interaction: 'i2' });
  assert.equal(none.port, 'not_found');
  assert.match(none.results[''], /Verbinde Discord in Patreon/);

  // The pledge is deleted: the webhook takes the roles at once.
  state.members = [];
  ctx.actions.length = 0;
  await runWebhook(plugin, 'patreon', ctx, { data: { type: 'member', id: 'p1', attributes: {} } });
  assert.deepEqual(roles(ctx, 'member.removeRole').sort(), [`${ANN}>${GOLD}`, `${ANN}>${PATRON}`, `${ANN}>${SILVER}`].sort());
  assert.equal(ctx.store.has(`pm:${ANN}`), false);

  // A new pledge by webhook: roles and the announcement.
  state.members = [m('p9', { discord: BEN, tiers: ['t1'], cents: 1000, name: 'Ben' })];
  await runWebhook(plugin, 'patreon', ctx, { data: { type: 'member', id: 'p9' } });
  assert.ok(roles(ctx, 'member.addRole').includes(`${BEN}>${GOLD}`));
  assert.match(ctx.sent.at(-1).message.content, /ist jetzt Patron \(Gold\)/);

  ctx.actions.length = 0;
  await runEvent(plugin, 'guildMemberAdd', ctx, { 'user.id': BEN, 'server.id': G });
  assert.deepEqual(roles(ctx, 'member.addRole').sort(), [`${BEN}>${GOLD}`, `${BEN}>${PATRON}`, `${BEN}>${SILVER}`].sort());
});

test('missing token: /patreon-sync explains it', async () => {
  const ctx = ctxWith({ members: [] }, {}, {});
  const out = await runBlock(plugin, 'sync_now', ctx, { interaction: 'i' });
  assert.equal(out.port, 'failed');
  assert.match(out.results[''], /PATREON_CREATOR_TOKEN/);
  const ok = ctxWith({ members: [m('p1', { discord: ANN, tiers: ['t1'] })] });
  const done = await runBlock(plugin, 'sync_now', ok, { interaction: 'i' });
  assert.match(done.results[''], /sync done: 1 patrons, 1 with Discord, 3 role changes/);
});
