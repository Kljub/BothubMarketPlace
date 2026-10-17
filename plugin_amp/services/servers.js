// Service "servers": the game servers (AMP instances) Discord may see,
// their status as embed, and the actions start / stop / restart / kill /
// update, backup, create from a template and settings.
import { AmpError, STATES, call, callInstance, checkAction, instances, loginOf, templates } from './amp.js';
import { t } from './i18n.js';
import { setting } from './util.js';

const COLOR = { ready: '#43b581', stopped: '#747f8d', failed: '#f04747', offline: '#747f8d' };
const ICON = { ready: '🟢', starting: '🟡', restarting: '🟡', stopping: '🟠', stopped: '🔴', failed: '❌', offline: '⚫', sleeping: '💤', updating: '⬇️', installing: '⬇️' };

/** "ready", "stopped" … of an instance; "offline" when the instance itself is off. */
export function stateOf(inst) {
  if (!inst.running) return 'offline';
  return STATES[inst.state] ?? 'undefined';
}

/** Instance IDs checked in the settings ("instances"); empty = all. */
function shared(ctx) {
  const list = setting(ctx, 'instances', []);
  return Array.isArray(list) ? list.map(String) : [];
}

/** The game servers Discord may see. */
export async function visible(ctx) {
  const all = await instances(ctx);
  const allow = shared(ctx);
  return allow.length ? all.filter((i) => allow.includes(i.id)) : all;
}

/** A game server by ID, instance name or display name; the only one when empty. */
export async function findServer(ctx, text) {
  const list = await visible(ctx);
  const want = String(text ?? '').trim().toLowerCase();
  if (!want) {
    if (list.length === 1) return list[0];
    throw new AmpError('missing');
  }
  const hit = list.find((i) => i.id.toLowerCase() === want) ?? list.find((i) => i.name.toLowerCase() === want) ?? list.find((i) => i.friendly.toLowerCase() === want)
    ?? (list.filter((i) => i.friendly.toLowerCase().includes(want)).length === 1 ? list.find((i) => i.friendly.toLowerCase().includes(want)) : undefined);
  if (!hit) throw new AmpError('unknown_server', { name: String(text).slice(0, 60) });
  return hit;
}

/** "45 %" / "2.1 / 8 GB" of an AMP metric (MetricInfo). */
function metric(m) {
  if (!m || typeof m !== 'object') return null;
  const raw = Number(m.RawValue ?? 0);
  const max = Number(m.MaxValue ?? 0);
  const unit = String(m.Units ?? '');
  if (unit === '%') return `${raw} %`;
  if (unit === 'MB') return max > 0 ? `${(raw / 1024).toFixed(1)} / ${(max / 1024).toFixed(1)} GB` : `${(raw / 1024).toFixed(1)} GB`;
  return max > 0 ? `${raw} / ${max}${unit ? ` ${unit}` : ''}` : `${raw}${unit ? ` ${unit}` : ''}`;
}

const pick = (metrics, name) => metrics?.[name] ?? Object.entries(metrics ?? {}).find(([k]) => k.toLowerCase().includes(name.split(' ')[0].toLowerCase()))?.[1];

/** "3/20 players" of the metric Active Users. */
function playersOf(metrics) {
  const m = pick(metrics, 'Active Users');
  return m ? `${Number(m.RawValue ?? 0)}/${Number(m.MaxValue ?? 0)}` : null;
}

/** One line of /amp-servers. */
export function line(L, inst) {
  const state = stateOf(inst);
  const players = playersOf(inst.metrics);
  return t(L, 'list.line', {
    icon: ICON[state] ?? '⚪',
    name: inst.friendly,
    state: t(L, `state.${state}`),
    players: players && state === 'ready' ? ` · 👥 ${players}` : '',
    module: inst.module ? ` · ${inst.module}` : '',
  });
}

/** Live status of a running instance: { state, uptime, metrics, users }. */
async function live(ctx, inst) {
  if (!inst.running) return null;
  const id = inst.id === 'self' ? null : inst.id;
  const run = (api) => (id ? callInstance(ctx, id, api) : call(ctx, api));
  const status = (await run('Core/GetStatus').catch(() => null)) ?? {};
  const users = await run('Core/GetUserList').catch(() => null);
  return {
    state: Number(status.State ?? inst.state),
    uptime: String(status.Uptime ?? ''),
    metrics: { ...inst.metrics, ...(status.Metrics ?? {}) },
    users: users && typeof users === 'object' ? Object.values(users).map(String) : [],
  };
}

/** The info embed of a game server with its buttons (for managers). */
export async function infoMessage(ctx, L, inst, withButtons) {
  const now = await live(ctx, inst);
  const state = now ? (STATES[now.state] ?? 'undefined') : 'offline';
  const metrics = now?.metrics ?? inst.metrics;
  const fields = [{ name: t(L, 'info.state'), value: `${ICON[state] ?? '⚪'} ${t(L, `state.${state}`)}`, inline: true }];
  if (inst.module) fields.push({ name: t(L, 'info.game'), value: inst.module, inline: true });
  if (now?.uptime && state === 'ready') fields.push({ name: t(L, 'info.uptime'), value: now.uptime.replace(/\.\d+$/, ''), inline: true });
  const cpu = metric(pick(metrics, 'CPU Usage'));
  const ram = metric(pick(metrics, 'Memory Usage'));
  if (cpu) fields.push({ name: t(L, 'info.cpu'), value: cpu, inline: true });
  if (ram) fields.push({ name: t(L, 'info.ram'), value: ram, inline: true });
  const players = playersOf(metrics);
  if (players) fields.push({ name: `${t(L, 'info.players')} (${players})`, value: (now?.users?.length ? now.users.slice(0, 30).join(', ') : t(L, 'info.nobody')).slice(0, 1024) });
  const address = inst.endpoints.filter((e) => e.address).map((e) => `${e.name ? `${e.name}: ` : ''}\`${e.address}\``).join('\n');
  if (address) fields.push({ name: t(L, 'info.address'), value: address.slice(0, 1024) });
  const message = {
    embeds: [{ color: COLOR[state] ?? '#faa61a', title: `🎮 ${inst.friendly}`, description: inst.target ? `${inst.name} · ${inst.target}` : inst.name, fields, footer: { text: 'AMP' }, timestamp: true }],
    components: [],
  };
  if (withButtons) {
    const b = (act, style, emoji) => ({ key: 'amp', data: `${act}:${inst.id}`, label: t(L, `btn.${act}`), style, emoji });
    message.components = [[b('start', 'success', '▶️'), b('stop', 'danger', '⏹️'), b('restart', 'primary', '🔄'), b('backup', 'secondary', '💾'), b('refresh', 'secondary', '🔃')]];
  }
  return { message, state };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** start / stop / restart / kill / update of a game server. */
export async function power(ctx, inst, action) {
  const stored = await loginOf(ctx);
  const run = (api, params) => (inst.id === 'self' ? call(ctx, api, params) : callInstance(ctx, inst.id, api, params));
  if (action === 'start' && stored?.controller && !inst.running) {
    // The instance itself is off: start it, then the game server in it.
    checkAction(await call(ctx, 'ADSModule/StartInstance', { InstanceName: inst.name }));
    await wait(8000);
    await run('Core/Start').catch(() => undefined);
    return;
  }
  if (action === 'stop' && !inst.running) return;
  const api = { start: 'Core/Start', stop: 'Core/Stop', restart: 'Core/Restart', kill: 'Core/Kill', update: 'Core/UpdateApplication' }[action];
  if (!api) throw new AmpError('amp', { reason: action });
  checkAction(await run(api));
}

/** A backup with a title (LocalFileBackupPlugin). */
export async function backup(ctx, inst, title, who) {
  const run = (api, params) => (inst.id === 'self' ? call(ctx, api, params) : callInstance(ctx, inst.id, api, params));
  checkAction(await run('LocalFileBackupPlugin/TakeBackup', { Title: title, Description: `Discord: ${who}`.slice(0, 200), Sticky: false }));
}

/** Templates checked in the settings ("templates"). */
export async function sharedTemplates(ctx) {
  const allow = setting(ctx, 'templates', []);
  const ids = Array.isArray(allow) ? allow.map(String) : [];
  if (!ids.length) return [];
  return (await templates(ctx)).filter((x) => ids.includes(String(x.id)));
}

/** A new game server from a deployment template. */
export async function create(ctx, templateText, name) {
  const stored = await loginOf(ctx);
  if (!stored) throw new AmpError('not_logged_in');
  if (!stored.controller) throw new AmpError('single');
  const list = await sharedTemplates(ctx);
  if (!list.length) throw new AmpError('no_templates');
  const want = String(templateText ?? '').trim().toLowerCase();
  const tpl = want ? list.find((x) => String(x.id) === want || x.name.toLowerCase() === want) : list.length === 1 ? list[0] : null;
  if (!tpl) throw new AmpError('unknown_template', { name: String(templateText ?? '').slice(0, 60) });
  const friendly = String(name ?? '').trim().slice(0, 60) || tpl.name;
  const res = await call(ctx, 'ADSModule/DeployTemplate', { TemplateID: tpl.id, FriendlyName: friendly, PostCreate: 3 });
  checkAction(res);
  return { template: tpl.name, name: friendly };
}

/** The settings of a game server, flat: [{ name, node, value, spec }]. */
async function settingsOf(ctx, inst) {
  const run = (api, params) => (inst.id === 'self' ? call(ctx, api, params) : callInstance(ctx, inst.id, api, params));
  const spec = (await run('Core/GetSettingsSpec')) ?? {};
  const out = [];
  for (const list of Object.values(spec && typeof spec === 'object' ? spec : {})) {
    for (const s of Array.isArray(list) ? list : []) if (s?.Node) out.push(s);
  }
  return { list: out, run };
}

const shown = (L, s) => (/password|secret/i.test(String(s.InputType ?? '')) ? t(L, 'settings.hidden') : String(s.CurrentValue ?? ''));

/**
 * Lists settings matching a search, or sets one when a value is given and
 * exactly one setting matches (or one has exactly that name).
 */
export async function settings(ctx, L, inst, search, value) {
  const { list, run } = await settingsOf(ctx, inst);
  const want = String(search ?? '').trim().toLowerCase();
  const exact = list.filter((s) => String(s.Name).toLowerCase() === want || String(s.Node).toLowerCase() === want);
  const found = exact.length ? exact : list.filter((s) => [s.Name, s.Node, s.Description, s.Keywords, s.Category].some((x) => String(x ?? '').toLowerCase().includes(want)));
  if (!found.length) return { text: t(L, 'settings.none', { search: String(search).slice(0, 60) }) };
  const text = String(value ?? '');
  if (text === '' || found.length > 1) {
    const lines = found.slice(0, 15).map((s) => `**${s.Name}** (\`${s.Node}\`): \`${shown(L, s).slice(0, 80) || '—'}\``);
    const head = text !== '' ? `${t(L, 'settings.many')}\n` : '';
    return { text: `${head}${lines.join('\n')}${found.length > 15 ? `\n… +${found.length - 15}` : ''}`.slice(0, 4000), title: t(L, 'settings.title', { name: inst.friendly }) };
  }
  const s = found[0];
  if (s.ReadOnly) throw new AmpError('read_only', { setting: s.Name });
  let next = text;
  const enums = s.EnumValues && typeof s.EnumValues === 'object' ? s.EnumValues : null;
  if (enums && Object.keys(enums).length) {
    const key = Object.keys(enums).find((k) => k.toLowerCase() === text.toLowerCase() || String(enums[k]).toLowerCase() === text.toLowerCase());
    if (key === undefined) throw new AmpError('bad_value', { value: text.slice(0, 60), setting: s.Name, allowed: Object.values(enums).slice(0, 15).join(', ') });
    next = key;
  } else if (/bool|checkbox/i.test(String(s.ValType ?? s.InputType ?? ''))) {
    if (!/^(true|false|on|off|yes|no|1|0)$/i.test(text)) throw new AmpError('bad_value', { value: text.slice(0, 60), setting: s.Name, allowed: 'true, false' });
    next = /^(true|on|yes|1)$/i.test(text) ? 'true' : 'false';
  } else if (/int|float|double|decimal|number/i.test(String(s.ValType ?? s.InputType ?? ''))) {
    if (!Number.isFinite(Number(text))) throw new AmpError('bad_value', { value: text.slice(0, 60), setting: s.Name, allowed: '0-9' });
  }
  checkAction(await run('Core/SetConfig', { node: s.Node, value: next }));
  return { text: t(L, 'settings.done', { setting: s.Name, name: inst.friendly, value: /password|secret/i.test(String(s.InputType ?? '')) ? '••••' : next.slice(0, 100), restart: s.RequiresRestart ? t(L, 'settings.restart') : '' }) };
}

/** Members who may control the game servers (setting "managers"). */
export async function mayManage(ctx, who) {
  const res = await ctx.config.checkAccess('managers', who);
  return res === true || res?.allowed === true;
}
