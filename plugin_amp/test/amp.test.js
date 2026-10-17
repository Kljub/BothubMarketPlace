import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runModal, runTask } from '#sdk-testing';
import plugin from '../index.js';
import manifest from '../bothub.json' with { type: 'json' };
import settings from '../dashboard/settings.json' with { type: 'json' };

const ADMIN = '100000000000000001';
const MEMBER = '100000000000000002';
const GUILD = '200000000000000001';
const CHANNEL = '300000000000000001';
const MC = '11111111-1111-1111-1111-111111111111';
const VAL = '22222222-2222-2222-2222-222222222222';
const vars = (user = ADMIN) => ({ 'user.id': user, 'user.name': 'kljub', 'server.id': GUILD, 'channel.id': CHANNEL });

/** A fake AMP controller (ADS) with two instances; the Valheim instance is off. */
function amp({ legacy = false } = {}) {
  const calls = [];
  let session = 0;
  const sessions = new Set();
  const instanceSessions = new Set();
  const state = { mcState: 20, valRunning: false, config: { 'MinecraftModule.Game.Difficulty': 'normal', 'MinecraftModule.Game.PVP': 'true' } };
  const ok = (json) => ({ json: legacy ? { result: json } : json });
  const server = (req) => {
    const path = new URL(req.url).pathname;
    const body = req.json ?? {};
    const auth = String(req.headers.Authorization ?? '').replace(/^Bearer /, '') || body.SESSIONID;
    calls.push({ path, body, auth });
    const inst = /^\/API\/ADSModule\/Servers\/([0-9a-f-]{36})(\/API\/.*)$/.exec(path);
    const api = inst ? inst[2] : path;
    if (api === '/API/Core/Login') {
      const good = (body.username === 'admin' && body.password === 'pw' && (body.token === '' || body.token === '123456')) || (body.username === 'admin' && body.password === '' && body.token === 'remember-1');
      if (!good) return ok({ success: false, resultReason: 'Invalid username or password', result: 0 });
      const id = `s${++session}`;
      (inst ? instanceSessions : sessions).add(id);
      return ok({ success: true, sessionID: id, rememberMeToken: 'remember-1', permissions: ['ADS.InstanceManagement'], userInfo: { Username: 'admin' } });
    }
    if (inst ? !instanceSessions.has(auth) : !sessions.has(auth)) return { status: 401, json: { Title: 'Unauthorized Access', Message: 'Your session has expired', StackTrace: '' } };
    switch (api) {
      case '/API/Core/GetModuleInfo':
        return ok({ ModuleName: 'ADS', AMPVersion: '2.6.2.0', FriendlyName: 'Home ADS' });
      case '/API/ADSModule/GetInstances':
        return ok([{ FriendlyName: 'Local', AvailableInstances: [
          { InstanceID: '00000000-0000-0000-0000-000000000000', InstanceName: 'ADS01', FriendlyName: 'ADS', Module: 'ADS', Running: true, AppState: 20 },
          { InstanceID: MC, InstanceName: 'Minecraft01', FriendlyName: 'Survival', Module: 'MinecraftModule', ModuleDisplayName: 'Minecraft', Running: true, AppState: state.mcState,
            Metrics: { 'CPU Usage': { RawValue: 12, MaxValue: 100, Units: '%' }, 'Memory Usage': { RawValue: 2048, MaxValue: 8192, Units: 'MB' }, 'Active Users': { RawValue: 2, MaxValue: 20, Units: '' } },
            ApplicationEndpoints: [{ DisplayName: 'Minecraft Server Address', Endpoint: 'mc.example.com:25565' }] },
          { InstanceID: VAL, InstanceName: 'Valheim01', FriendlyName: 'Viking', Module: 'GenericModule', ModuleDisplayName: 'Valheim', Running: state.valRunning, AppState: 0, Metrics: {} },
        ] }]);
      case '/API/ADSModule/GetDeploymentTemplates':
        return ok([{ Id: 3, Name: 'Minecraft Paper', Module: 'MinecraftModule' }, { Id: 4, Name: 'Valheim', Module: 'GenericModule' }]);
      case '/API/ADSModule/DeployTemplate':
        return ok({ Id: 'task', Description: 'Deploying' });
      case '/API/ADSModule/StartInstance':
        state.valRunning = true;
        return ok({ Status: true });
      case '/API/Core/GetStatus':
        return ok({ State: state.mcState, Uptime: '01:02:03.4567', Metrics: { 'Active Users': { RawValue: 2, MaxValue: 20, Units: '' } } });
      case '/API/Core/GetUserList':
        return ok({ a: 'Steve', b: 'Alex' });
      case '/API/Core/Stop':
        state.mcState = 0;
        return ok(null);
      case '/API/Core/Start':
      case '/API/Core/Restart':
        state.mcState = 20;
        return ok({ Status: true });
      case '/API/LocalFileBackupPlugin/TakeBackup':
        return ok({ Status: true });
      case '/API/Core/GetSettingsSpec':
        return ok({ 'Minecraft:Game': [
          { Name: 'Difficulty', Node: 'MinecraftModule.Game.Difficulty', CurrentValue: state.config['MinecraftModule.Game.Difficulty'], EnumValues: { peaceful: 'Peaceful', easy: 'Easy', normal: 'Normal', hard: 'Hard' }, ValType: 'System.String' },
          { Name: 'PVP', Node: 'MinecraftModule.Game.PVP', CurrentValue: state.config['MinecraftModule.Game.PVP'], ValType: 'System.Boolean', RequiresRestart: true },
          { Name: 'RCON Password', Node: 'MinecraftModule.Game.RconPassword', CurrentValue: 'hunter2', InputType: 'password', ValType: 'System.String' },
        ] });
      case '/API/Core/SetConfig':
        state.config[body.node] = body.value;
        return ok({ Status: true });
      default:
        return { status: 404, json: { Title: 'Not found', Message: api, StackTrace: '' } };
    }
  };
  return { calls, server, state, expire: () => { sessions.clear(); instanceSessions.clear(); } };
}

function ctxWith({ api = amp(), config = {} } = {}) {
  return createTestContext({
    id: 'plugin_amp', permissions: manifest.sdk.permissions, settings, config, secrets: { AMP_URL: 'http://192.168.1.30:8080' },
    manifest: { id: 'plugin_amp', secrets: manifest.services.secrets },
    web: { '192.168.1.30': api.server },
    members: { [ADMIN]: { roles: [], permissions: ['manage_guild'] }, [MEMBER]: { roles: [], permissions: [] } },
  });
}

async function loggedIn(api = amp(), config = {}) {
  const ctx = ctxWith({ api, config });
  await runModal(plugin, 'ampl', ctx, { user: 'admin', password: 'pw', code: '' }, { user: { id: ADMIN, name: 'kljub', displayName: 'kljub' }, guildId: GUILD, channelId: CHANNEL });
  return ctx;
}

const lastAnswer = (ctx) => ctx.answers.at(-1);
const text = (a) => (typeof a.message === 'string' ? a.message : JSON.stringify(a.message));

test('login by modal: remember-me token kept, password not stored, dropdowns filled', async () => {
  const api = amp();
  const ctx = await loggedIn(api);
  const answer = lastAnswer(ctx);
  assert.match(text(answer), /Logged in to \*\*Home ADS\*\* as \*\*admin\*\*/);
  assert.equal(answer.ephemeral, true);
  const stored = JSON.parse(ctx.store.get('login'));
  assert.equal(stored.token, 'remember-1');
  assert.equal(stored.controller, true);
  assert.ok(!JSON.stringify(stored).includes('pw'), 'password not stored');
  assert.deepEqual(ctx.fieldOptions.instances.map((o) => o.value), [MC, VAL]);
  assert.deepEqual(ctx.fieldOptions.templates.map((o) => o.label), ['Minecraft Paper', 'Valheim']);
  // The session goes as Bearer header and SESSIONID.
  const info = api.calls.find((c) => c.path === '/API/Core/GetModuleInfo');
  assert.equal(info.auth, 's1');
});

test('login refused and members without the permission', async () => {
  const ctx = ctxWith();
  await runModal(plugin, 'ampl', ctx, { user: 'admin', password: 'wrong' }, { user: { id: ADMIN, name: 'k', displayName: 'k' }, guildId: GUILD, channelId: CHANNEL });
  assert.match(text(lastAnswer(ctx)), /refused the login: Invalid username or password/);
  await runComponent(plugin, 'amp', ctx, { data: 'login', user: { id: MEMBER, name: 'm', displayName: 'm' }, guildId: GUILD, channelId: CHANNEL });
  assert.match(text(lastAnswer(ctx)), /may not control/);
  await runComponent(plugin, 'amp', ctx, { data: 'login', user: { id: ADMIN, name: 'k', displayName: 'k' }, guildId: GUILD, channelId: CHANNEL });
  assert.equal(lastAnswer(ctx).kind, 'showModal');
});

test('servers and info: states, players, address, buttons only for managers', async () => {
  const ctx = await loggedIn();
  const list = await runBlock(plugin, 'servers', ctx, { vars: vars(MEMBER), config: { variable: 'amp' } });
  assert.equal(list.port, 'next');
  assert.equal(list.results['.count'], '2');
  assert.match(list.results[''], /Survival\*\* · Running · 👥 2\/20 · Minecraft/);
  assert.match(list.results[''], /Viking\*\* · Instance off/);
  const info = await runBlock(plugin, 'info', ctx, { vars: vars(MEMBER), interaction: 'cmd', config: { server: 'survival', variable: 'amp' } });
  assert.equal(info.port, 'replied');
  assert.equal(info.results['.state'], 'ready');
  const msg = lastAnswer(ctx).message;
  assert.equal(msg.components.length, 0, 'no buttons for members');
  assert.match(JSON.stringify(msg.embeds[0].fields), /Steve, Alex.*mc\.example\.com:25565/);
  assert.match(JSON.stringify(msg.embeds[0].fields), /2\.0 \/ 8\.0 GB/);
  await runBlock(plugin, 'info', ctx, { vars: vars(ADMIN), interaction: 'cmd2', config: { server: MC } });
  assert.equal(lastAnswer(ctx).message.components[0].length, 5);
});

test('power, backup, start of a stopped instance and access', async () => {
  const api = amp();
  const ctx = await loggedIn(api);
  const denied = await runBlock(plugin, 'power', ctx, { vars: vars(MEMBER), config: { server: 'Survival', action: 'stop' } });
  assert.equal(denied.port, 'failed');
  const stop = await runBlock(plugin, 'power', ctx, { vars: vars(ADMIN), config: { server: 'Survival', action: 'stop' } });
  assert.equal(stop.port, 'next');
  assert.equal(api.state.mcState, 0);
  assert.ok(api.calls.some((c) => c.path === `/API/ADSModule/Servers/${MC}/API/Core/Stop`));
  const back = await runBlock(plugin, 'backup', ctx, { vars: vars(ADMIN), config: { server: 'Survival', title: 'before update' } });
  assert.match(back.results[''], /Backup of \*\*Survival\*\* started: \*\*before update\*\*/);
  const backupCall = api.calls.find((c) => c.path.endsWith('/LocalFileBackupPlugin/TakeBackup'));
  assert.equal(backupCall.body.Title, 'before update');
  // A button under /amp-info.
  await runComponent(plugin, 'amp', ctx, { data: `restart:${MC}`, user: { id: ADMIN, name: 'k', displayName: 'k' }, guildId: GUILD, channelId: CHANNEL });
  assert.match(text(lastAnswer(ctx)), /Restart of \*\*Survival\*\* sent/);
  assert.equal(api.state.mcState, 20);
});

test('instance login with the remember-me token after the controller session is refused there', async () => {
  const api = amp();
  const ctx = await loggedIn(api);
  await runBlock(plugin, 'info', ctx, { vars: vars(), config: { server: 'Survival' } });
  const login = api.calls.find((c) => c.path === `/API/ADSModule/Servers/${MC}/API/Core/Login`);
  assert.deepEqual([login.body.username, login.body.password, login.body.token], ['admin', '', 'remember-1']);
});

test('expired session renewed with the token; older AMP answers wrapped in result', async () => {
  const api = amp({ legacy: true });
  const ctx = await loggedIn(api);
  api.expire();
  const list = await runBlock(plugin, 'servers', ctx, { vars: vars(), config: {} });
  assert.equal(list.results['.count'], '2');
});

test('settings: search, enum by label, hidden password, restart hint', async () => {
  const api = amp();
  const ctx = await loggedIn(api);
  const all = await runBlock(plugin, 'settings', ctx, { vars: vars(), config: { server: 'Survival', search: 'game' } });
  assert.match(all.results[''], /\*\*RCON Password\*\* \(`MinecraftModule\.Game\.RconPassword`\): `\(hidden\)`/);
  assert.ok(!all.results[''].includes('hunter2'));
  const set = await runBlock(plugin, 'settings', ctx, { vars: vars(), config: { server: 'Survival', search: 'difficulty', value: 'Hard' } });
  assert.equal(api.state.config['MinecraftModule.Game.Difficulty'], 'hard');
  assert.match(set.results[''], /Difficulty\*\* of \*\*Survival\*\* is now `hard`/);
  const pvp = await runBlock(plugin, 'settings', ctx, { vars: vars(), config: { server: 'Survival', search: 'pvp', value: 'off' } });
  assert.match(pvp.results[''], /`false`\. Restart the server/);
  const bad = await runBlock(plugin, 'settings', ctx, { vars: vars(), config: { server: 'Survival', search: 'difficulty', value: 'insane' } });
  assert.equal(bad.port, 'failed');
  assert.match(bad.results[''], /Allowed: Peaceful, Easy, Normal, Hard/);
});

test('create from a shared template; off without templates; shared servers only', async () => {
  const api = amp();
  const off = await loggedIn(api);
  assert.match((await runBlock(plugin, 'create', off, { vars: vars(), config: { template: 'Valheim', name: 'x' } })).results[''], /Creating servers is off/);
  const ctx = await loggedIn(api, { templates: ['4'], instances: [MC] });
  const made = await runBlock(plugin, 'create', ctx, { vars: vars(), config: { template: '4', name: 'Vikings 2' } });
  assert.equal(made.port, 'next');
  const deploy = api.calls.find((c) => c.path === '/API/ADSModule/DeployTemplate');
  assert.deepEqual([deploy.body.TemplateID, deploy.body.FriendlyName, deploy.body.PostCreate], [4, 'Vikings 2', 3]);
  const hidden = await runBlock(plugin, 'info', ctx, { vars: vars(), config: { server: 'Viking' } });
  assert.match(hidden.results[''], /no game server "Viking"/);
});

test('not set up and not logged in', async () => {
  const bare = createTestContext({ id: 'plugin_amp', permissions: manifest.sdk.permissions, settings, manifest: { id: 'plugin_amp', secrets: manifest.services.secrets }, members: { [ADMIN]: { permissions: ['manage_guild'] } } });
  await runModal(plugin, 'ampl', bare, { user: 'admin', password: 'pw' }, { user: { id: ADMIN, name: 'k', displayName: 'k' }, guildId: GUILD, channelId: CHANNEL });
  assert.match(text(bare.answers.at(-1)), /AMP is not set up/);
  const ctx = ctxWith();
  const res = await runBlock(plugin, 'servers', ctx, { vars: vars(), config: {} });
  assert.match(res.results[''], /not logged in/);
  await runTask(plugin, 'options', ctx);
});
