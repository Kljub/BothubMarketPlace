import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runEvent, runTask } from '#sdk-testing';
import plugin from '../index.js';
import manifest from '../bothub.json' with { type: 'json' };
import { bindFits, phrase } from '../services/verify.js';

const G = '200000000000000001';
const ANN = '100000000000000001';
const BEN = '100000000000000002';
const VERIFIED = '300000000000000001';
const UNVERIFIED = '300000000000000002';
const MOD = '300000000000000003';
const VIP = '300000000000000004';
const ref = (id) => ({ id, guild: G });

function roblox(state) {
  return {
    'users.roblox.com': (req) => {
      if (req.url.endsWith('/v1/usernames/users')) {
        const u = state.users.find((x) => x.name.toLowerCase() === String(req.json.usernames[0]).toLowerCase());
        return { json: { data: u ? [{ id: u.id, name: u.name, displayName: u.displayName }] : [] } };
      }
      const id = Number(req.url.split('/v1/users/')[1]);
      const u = state.users.find((x) => x.id === id);
      return u ? { json: { id: u.id, name: u.name, displayName: u.displayName, description: u.description, created: '2015-03-01T00:00:00Z', isBanned: false } } : { status: 404, json: {} };
    },
    'groups.roblox.com': () => ({ json: { data: [{ group: { id: 77, name: 'Cafe' }, role: { name: 'Moderator', rank: state.rank } }] } }),
    'inventory.roblox.com': (req) => ({ json: { data: state.pass && req.url.endsWith('/GamePass/999') ? [{ id: 999 }] : [] } }),
    'thumbnails.roblox.com': () => ({ json: { data: [{ imageUrl: 'https://tr.rbxcdn.com/x.png' }] } }),
    'friends.roblox.com': (req) => ({ json: { count: req.url.includes('followers') ? 1200 : 5 } }),
  };
}

function ctxWith(state, config = {}) {
  const roles = new Map();
  const ctx = createTestContext({
    id: 'plugin_robloxverify', permissions: manifest.sdk.permissions, hosts: manifest.services.hosts, web: roblox(state),
    config: {
      language: 'en', verified_role: ref(VERIFIED), unverified_role: ref(UNVERIFIED), nickname: 'both',
      rankbinds: [{ group: '77', min_rank: 100, max_rank: 255, role: ref(MOD) }], gamepasses: [{ gamepass: '999', role: ref(VIP) }],
      remove_roles: true, ...config,
    },
    discord: {
      'member.get': (g, u) => ({ id: u, displayName: 'x', roles: [...(roles.get(u) ?? [])] }),
      'member.addRole': (g, u, r) => roles.set(u, new Set([...(roles.get(u) ?? []), r])),
      'member.removeRole': (g, u, r) => roles.get(u)?.delete(r),
    },
  });
  ctx.roles = (u) => [...(roles.get(u) ?? [])].sort();
  return ctx;
}

const vars = (u = ANN) => ({ 'server.id': G, 'user.id': u });
const verify = (ctx, username, u = ANN) => runBlock(plugin, 'verify', ctx, { config: { username }, vars: vars(u) });

test('phrase of words, rank ranges', () => {
  assert.match(phrase(), /^bothub( [a-z]+){4}$/);
  assert.ok(bindFits({ min_rank: 100, max_rank: 255 }, 200));
  assert.ok(!bindFits({ min_rank: 100, max_rank: 255 }, 50));
  assert.ok(!bindFits({ min_rank: 1 }, 0), 'not in the group');
  assert.ok(bindFits({ min_rank: 0, max_rank: 0 }, 0), 'min 0: not in the group counts');
});

test('verification: phrase in the profile, roles by rank and game pass, nickname, one account per member', async () => {
  const state = { users: [{ id: 42, name: 'Builder', displayName: 'Bob the Builder', description: 'hi' }], rank: 150, pass: true };
  const ctx = ctxWith(state);
  const one = await verify(ctx, 'builder');
  assert.equal(one.port, 'pending');
  const code = JSON.parse(ctx.store.get(`p:${ANN}`)).code;
  assert.match(one.results[''], new RegExp(code));
  const notyet = await verify(ctx, '');
  assert.match(notyet.results[''], /not in the About/);
  state.users[0].description = `Hello ${code.toUpperCase()} world`;
  const done = await verify(ctx, '');
  assert.equal(done.port, 'next');
  assert.match(done.results[''], /Verified as \*\*Bob the Builder\*\* \(@Builder\)/);
  assert.deepEqual(ctx.roles(ANN), [VERIFIED, MOD, VIP].sort());
  assert.ok(ctx.actions.some((a) => a.call === 'member.setNickname' && a.args[2] === 'Bob the Builder (@Builder)'));

  // Ben cannot take the same account.
  const taken = await verify(ctx, 'Builder', BEN);
  assert.match(taken.results[''], /linked to another member/);

  // The rank drops and the pass is gone: the update takes those roles.
  state.rank = 10;
  state.pass = false;
  await runBlock(plugin, 'update', ctx, { config: { member: '', mode: 'update' }, vars: vars() });
  assert.deepEqual(ctx.roles(ANN), [VERIFIED]);

  // Unlink: the verified role goes, the unverified role comes.
  const out = await runBlock(plugin, 'update', ctx, { config: { mode: 'unlink' }, vars: vars() });
  assert.match(out.results[''], /no longer linked/);
  assert.deepEqual(ctx.roles(ANN), [UNVERIFIED]);
  assert.equal(ctx.store.has('r:42'), false);
});

test('unknown user, button panel with modal and "Done", join and periodic update', async () => {
  const state = { users: [{ id: 7, name: 'Ann', displayName: 'Annie', description: '' }], rank: 200, pass: false };
  const ctx = ctxWith(state, { start: 'button', panel_channel: { id: '400000000000000001', guild: G } });
  assert.match((await verify(ctx, 'nobody_here')).results[''], /no Roblox user "nobody_here"/);

  await plugin.onConfigChange(ctx);
  const panel = ctx.sent.at(-1);
  assert.equal(panel.channelId, '400000000000000001');
  assert.equal(panel.message.components[0][0].data, 'start');

  const h = await runComponent(plugin, 'rv', ctx, { data: 'start', guildId: G });
  assert.equal(ctx.answers.find((a) => a.handle === h).kind, 'showModal');
  const m = await runComponent(plugin, 'rvm', ctx, { fields: { name: 'ann' }, guildId: G, user: { id: ANN, name: 'a', displayName: 'A' } }, 'modal');
  const step1 = ctx.answers.find((a) => a.handle === m);
  assert.equal(step1.message.components[0][0].data, 'done');
  state.users[0].description = JSON.parse(ctx.store.get(`p:${ANN}`)).code;
  const d = await runComponent(plugin, 'rv', ctx, { data: 'done', guildId: G, user: { id: ANN, name: 'a', displayName: 'A' } });
  const verified = ctx.answers.find((a) => a.handle === d);
  assert.equal(verified.kind, 'update');
  assert.match(verified.message.content, /Verified as \*\*Annie\*\*/);
  assert.deepEqual(verified.message.components, []);
  assert.deepEqual(ctx.roles(ANN), [VERIFIED, MOD].sort());

  // Someone new joins: unverified role; the linked member's roles come back after a leave.
  await runEvent(plugin, 'guildMemberAdd', ctx, { 'user.id': BEN, 'server.id': G });
  assert.deepEqual(ctx.roles(BEN), [UNVERIFIED]);

  state.rank = 0;
  await runTask(plugin, 'tick', ctx);
  assert.deepEqual(ctx.roles(ANN), [VERIFIED], 'left the group: the periodic update takes the rank role');
});

test('profile of a linked member or a username', async () => {
  const state = { users: [{ id: 42, name: 'Builder', displayName: 'Bob', description: 'I build.' }], rank: 1, pass: false };
  const ctx = ctxWith(state);
  const none = await runBlock(plugin, 'profile', ctx, { config: {}, vars: vars() });
  assert.equal(none.port, 'not_found');
  const out = await runBlock(plugin, 'profile', ctx, { config: { username: 'Builder' }, vars: vars(), interaction: 'p' });
  assert.equal(out.port, 'replied');
  const embed = ctx.answers.find((a) => a.handle === 'p').message.embeds[0];
  assert.equal(embed.url, 'https://www.roblox.com/users/42/profile');
  assert.equal(embed.thumbnail_url, 'https://tr.rbxcdn.com/x.png');
  assert.deepEqual(embed.fields.map((f) => f.value).slice(1, 3), ['5', '1,200']);
  assert.match(embed.fields[3].value, /Cafe · Moderator/);
});
