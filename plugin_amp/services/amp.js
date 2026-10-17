// Service "amp": the AMP panel (CubeCoders) through the admin's secret
// AMP_URL (Admin -> API / Secrets, shared with this plugin), sent with
// ctx.http.secret. Every call is POST <AMP_URL>/API/<Module>/<Method> with a
// JSON body; an instance behind the controller (ADS) is reached at
// /API/ADSModule/Servers/<InstanceID>/API/<Module>/<Method>.
//
// Login: a member presses "Log in" and types the AMP user and password (and
// a 2FA code) into a modal. The plugin calls Core/Login with rememberMe and
// keeps only the remember-me token and the session (storage key "login");
// the password is never stored. An expired session is renewed with the
// token. The session goes as "Authorization: Bearer <session>" (AMP 2.6+)
// and as SESSIONID in the body (older AMP).
import { readJson, writeJson } from './storage.js';

export const URL_SECRET = 'AMP_URL';
const LOGIN_KEY = 'login';
const HEADERS = { Accept: 'application/json' };

/** Application states of AMP (ApplicationState). */
export const STATES = {
  '-1': 'undefined', 0: 'stopped', 5: 'prestart', 7: 'configuring', 10: 'starting', 20: 'ready', 30: 'restarting', 40: 'stopping',
  45: 'sleep_prep', 50: 'sleeping', 60: 'waiting', 70: 'installing', 75: 'updating', 80: 'awaiting_input', 100: 'failed', 200: 'suspended', 250: 'maintenance', 999: 'indeterminate',
};

/** Problems the members see as text (services/i18n.js "err.<key>"). */
export class AmpError extends Error {
  constructor(key, params = {}) {
    super(key);
    this.key = key;
    this.params = params;
  }
}

/** Sessions of instances behind the controller, by instance ID (this process only). */
const instanceSessions = new Map();

/** Older AMP versions wrap answers in { result }. */
function unwrap(json) {
  if (json && typeof json === 'object' && !Array.isArray(json) && Object.keys(json).length === 1 && 'result' in json) return json.result;
  return json;
}

/** AMP answers "not logged in" with 401/403 or an error object titled Unauthorized. */
function unauthorized(res) {
  const j = res?.json;
  return res?.status === 401 || res?.status === 403 || (j && typeof j === 'object' && /unauthori[sz]ed/i.test(String(j.Title ?? j.title ?? '')));
}

async function post(ctx, base, api, params, session) {
  let res;
  try {
    res = await ctx.http.secret({
      url: URL_SECRET,
      method: 'POST',
      path: `${base}/API/${api}`,
      json: session ? { ...params, SESSIONID: session } : params,
      headers: session ? { ...HEADERS, Authorization: `Bearer ${session}` } : HEADERS,
      timeoutMs: 30_000,
    });
  } catch (err) {
    const key = String(err?.key ?? err?.message ?? '');
    if (/not_shared|not_a_url|not_found/.test(key)) throw new AmpError('not_set_up');
    if (/timeout/.test(key)) throw new AmpError('timeout');
    throw new AmpError('offline');
  }
  if (res.status >= 500) throw new AmpError('http', { status: res.status });
  return res;
}

/** An error object of AMP ({ Title, Message }) as AmpError. */
function failed(json) {
  if (json && typeof json === 'object' && !Array.isArray(json) && (json.Title || json.Message) && json.StackTrace !== undefined) {
    throw new AmpError('amp', { reason: String(json.Message || json.Title).slice(0, 300) });
  }
}

/** Core/Login; answers the LoginResponse or throws AmpError("login", reason). */
async function coreLogin(ctx, base, username, password, token) {
  const res = await post(ctx, base, 'Core/Login', { username, password, token: token ?? '', rememberMe: true }, null);
  const j = unwrap(res.json) ?? {};
  if (!j.success || !j.sessionID) throw new AmpError('login', { reason: String(j.resultReason || j.Message || 'login refused').slice(0, 200) });
  return j;
}

/** The stored login of this bot, or null. */
export async function loginOf(ctx) {
  return readJson(ctx, LOGIN_KEY, null);
}

/**
 * Logs in with user, password and an optional 2FA code. Stores user,
 * remember-me token, session, AMP permissions and the panel mode (a
 * controller with instances or a single instance).
 */
export async function login(ctx, username, password, code, by) {
  const j = await coreLogin(ctx, '', username, password, code);
  const info = unwrap((await post(ctx, '', 'Core/GetModuleInfo', {}, j.sessionID)).json) ?? {};
  const stored = {
    username,
    token: String(j.rememberMeToken ?? ''),
    session: String(j.sessionID),
    permissions: Array.isArray(j.permissions) ? j.permissions.slice(0, 500) : [],
    controller: String(info.ModuleName ?? '') === 'ADS',
    version: String(info.AMPVersion ?? ''),
    name: String(info.FriendlyName ?? info.InstanceName ?? 'AMP'),
    by: by ?? null,
    at: Date.now(),
  };
  await writeJson(ctx, LOGIN_KEY, stored);
  instanceSessions.clear();
  return stored;
}

export async function logout(ctx) {
  const stored = await loginOf(ctx);
  if (stored?.session) await post(ctx, '', 'Core/Logout', {}, stored.session).catch(() => undefined);
  await ctx.storage.delete(LOGIN_KEY);
  instanceSessions.clear();
}

/** A new session from the remember-me token (session expired). */
async function renew(ctx, stored) {
  if (!stored.token) throw new AmpError('expired');
  try {
    const j = await coreLogin(ctx, '', stored.username, '', stored.token);
    stored.session = String(j.sessionID);
    if (j.rememberMeToken) stored.token = String(j.rememberMeToken);
    await writeJson(ctx, LOGIN_KEY, stored);
    return stored;
  } catch (err) {
    if (err instanceof AmpError && err.key === 'login') throw new AmpError('expired');
    throw err;
  }
}

/** A call to the panel itself (the controller or the single instance). */
export async function call(ctx, api, params = {}) {
  let stored = await loginOf(ctx);
  if (!stored) throw new AmpError('not_logged_in');
  let res = await post(ctx, '', api, params, stored.session);
  if (unauthorized(res)) {
    stored = await renew(ctx, stored);
    res = await post(ctx, '', api, params, stored.session);
    if (unauthorized(res)) throw new AmpError('denied');
  }
  failed(res.json);
  return unwrap(res.json);
}

/**
 * A call to an instance behind the controller. The session of the
 * controller is tried first; else the instance gets its own login with the
 * remember-me token, else with a login token of ADSModule/ManageInstance.
 */
export async function callInstance(ctx, instanceId, api, params = {}) {
  const stored = await loginOf(ctx);
  if (!stored) throw new AmpError('not_logged_in');
  if (!stored.controller) return call(ctx, api, params);
  const base = `/API/ADSModule/Servers/${instanceId}`;
  const known = instanceSessions.get(instanceId);
  let res = await post(ctx, base, api, params, known ?? stored.session);
  if (!unauthorized(res)) {
    failed(res.json);
    return unwrap(res.json);
  }
  let session = null;
  if (stored.token) session = await coreLogin(ctx, base, stored.username, '', stored.token).then((j) => j.sessionID, () => null);
  if (!session) {
    const manage = await call(ctx, 'ADSModule/ManageInstance', { InstanceId: instanceId }).catch(() => null);
    const token = typeof manage === 'string' ? manage : manage?.Result;
    if (token) session = await coreLogin(ctx, base, stored.username, '', String(token)).then((j) => j.sessionID, () => null);
  }
  if (!session) throw new AmpError('instance_denied');
  instanceSessions.set(instanceId, String(session));
  res = await post(ctx, base, api, params, String(session));
  if (unauthorized(res)) throw new AmpError('instance_denied');
  failed(res.json);
  return unwrap(res.json);
}

/** ActionResult { Status, Reason } of AMP: throws when Status is false. */
export function checkAction(result) {
  if (result && typeof result === 'object' && result.Status === false) throw new AmpError('amp', { reason: String(result.Reason || 'refused').slice(0, 300) });
  return result;
}

/**
 * The game server instances: on a controller every instance of every
 * target (without the controllers themselves), else the panel itself.
 */
export async function instances(ctx) {
  const stored = await loginOf(ctx);
  if (!stored) throw new AmpError('not_logged_in');
  if (!stored.controller) {
    const status = (await call(ctx, 'Core/GetStatus')) ?? {};
    return [{ id: 'self', name: stored.name, friendly: stored.name, module: '', running: true, state: Number(status.State ?? -1), metrics: status.Metrics ?? {}, endpoints: [], suspended: false, target: '' }];
  }
  const targets = (await call(ctx, 'ADSModule/GetInstances', { ForceIncludeSelf: true })) ?? [];
  const out = [];
  for (const t of Array.isArray(targets) ? targets : []) {
    for (const i of Array.isArray(t.AvailableInstances) ? t.AvailableInstances : []) {
      if (i.Module === 'ADS') continue;
      out.push({
        id: String(i.InstanceID),
        name: String(i.InstanceName ?? ''),
        friendly: String(i.FriendlyName || i.InstanceName || i.InstanceID),
        module: String(i.ModuleDisplayName || i.Module || ''),
        running: !!i.Running,
        state: Number(i.AppState ?? -1),
        metrics: i.Metrics ?? {},
        endpoints: (Array.isArray(i.ApplicationEndpoints) ? i.ApplicationEndpoints : []).map((e) => ({ name: String(e.DisplayName ?? ''), address: String(e.Endpoint ?? '') })),
        suspended: !!i.Suspended,
        target: String(t.FriendlyName ?? ''),
      });
    }
  }
  return out;
}

/** Deployment templates of the controller: [{ id, name, description, module }]. */
export async function templates(ctx) {
  const list = (await call(ctx, 'ADSModule/GetDeploymentTemplates')) ?? [];
  return (Array.isArray(list) ? list : []).map((t) => ({ id: Number(t.Id), name: String(t.Name ?? `#${t.Id}`), description: String(t.Description ?? ''), module: String(t.Module ?? '') }));
}
