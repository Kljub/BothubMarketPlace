// Copied from BotHub sdk/dist/testing.js by scripts/sync-sdk.mjs; do not edit.
// @bothub/sdk/testing: run a plugin's blocks and hooks without a bot.
//
// createTestContext() returns a fake `ctx` that behaves like the real host
// for the calls the bot answers today (shared/sdk-permissions.json,
// "implemented"): storage in memory, messages and log lines recorded, the
// settings read-only. Rejections use the host's keys, in the host's order:
// "sdk.call.unknown" → "sdk.call.not_available" → "sdk.call.denied".
//
//   import { createTestContext, runBlock } from '@bothub/sdk/testing';
//   const ctx = createTestContext({ permissions: ['storage'], config: { greeting: 'Hi {user}' } });
//   const out = await runBlock(plugin, 'greet', ctx, { vars: { 'user.name': 'Ann' } });
/** Error like the host's: .message and .key are the key string. */
export class SdkCallError extends Error {
    key;
    constructor(key) {
        super(key);
        this.key = key;
        this.name = 'SdkCallError';
    }
}
// Calls the fake answers, with the permission each needs (null = core).
const CALLS = {
    'logger.debug': null, 'logger.info': null, 'logger.warn': null, 'logger.error': null, 'logger.success': null,
    'storage.get': 'storage', 'storage.set': 'storage', 'storage.has': 'storage', 'storage.delete': 'storage',
    'storage.increment': 'storage', 'storage.decrement': 'storage', 'storage.clear': 'storage',
    'guild.get': 'discord.guilds.read', 'guild.list': 'discord.guilds.read',
    'module.get': 'modules.read', 'module.getId': 'modules.read', 'module.getName': 'modules.read',
    'module.isEnabled': 'modules.read', 'module.getConfig': 'modules.read', 'module.list': 'modules.read',
    'message.send': 'discord.messages.send',
    'voice.join': 'discord.voice', 'voice.leave': 'discord.voice', 'voice.play': 'discord.voice',
    'voice.stop': 'discord.voice', 'voice.state': 'discord.voice',
    'http.endpoint': 'http.endpoints',
};
// Areas and methods that exist in the SDK but the fake (and the bot) do not
// answer yet: they reject with "sdk.call.not_available".
const PLANNED_AREAS = new Set([
    'collection', 'cache', 'scheduler', 'events', 'member', 'channel', 'role', 'interaction', 'commands',
    'permissions', 'plugins', 'dashboard', 'http', 'secrets', 'locale', 'rateLimit', 'resources',
]);
const PLANNED_CALLS = new Set([
    'storage.transaction', 'config.set', 'config.delete', 'utils.validate',
    'guild.getChannels', 'guild.getRoles', 'guild.getEmojis', 'guild.getMembers',
    'message.get', 'message.edit', 'message.delete', 'message.pin', 'message.unpin', 'message.react',
]);
// Host limits (shared/sdk-permissions.json "limits").
const STORAGE_KEYS = 1000;
const STORAGE_VALUE_BYTES = 16384;
const STORAGE_TOTAL_BYTES = 1048576;
const STORAGE_KEY = /^[\x20-\x7e]{1,128}$/;
const SEND_MAX = 5;
const SEND_WINDOW_MS = 5000;
const SNOWFLAKE = /^\d{17,20}$/;
const SOUND_FILE = /^sounds\/[a-z0-9_-]{1,64}\.(ogg|mp3|wav)$/;
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const BLOCKED_HEADERS = new Set(['authorization', 'cookie', 'host', 'proxy-authorization']);
const HTTP_BODY_BYTES = 64 * 1024;
const HTTP_RESPONSE_BYTES = 1024 * 1024;
const HTTP_TIMEOUT_MS = 10000;
const encoder = new TextEncoder();
const bytes = (text) => encoder.encode(text).length;
export function createTestContext(options = {}) {
    const id = options.id ?? 'test-plugin';
    const version = options.version ?? '1.0.0';
    const botId = options.botId ?? 1;
    const permissions = new Set(options.permissions ?? []);
    const config = structuredClone(options.config ?? {});
    const store = new Map(Object.entries(options.storage ?? {}));
    const sent = [];
    const logs = [];
    const calls = [];
    const sendTimes = [];
    const played = [];
    const requests = [];
    const voice = new Map();
    const manifestEndpoints = Array.isArray(options.manifest?.endpoints) ? options.manifest.endpoints : null;
    let nextId = 100000000000000000n;
    const check = (name) => {
        calls.push(name);
        if (!(name in CALLS)) {
            const area = name.split('.')[0];
            throw new SdkCallError(PLANNED_CALLS.has(name) || PLANNED_AREAS.has(area) ? 'sdk.call.not_available' : 'sdk.call.unknown');
        }
        const perm = CALLS[name];
        if (perm && !permissions.has(perm))
            throw new SdkCallError('sdk.call.denied');
    };
    const key = (k) => {
        if (typeof k !== 'string' || !STORAGE_KEY.test(k))
            throw new SdkCallError('sdk.storage.bad_key');
        return k;
    };
    const put = (k, value) => {
        const name = key(k);
        if (typeof value !== 'string')
            throw new SdkCallError('sdk.storage.bad_value');
        const size = bytes(value);
        if (size > STORAGE_VALUE_BYTES)
            throw new SdkCallError('sdk.storage.value_too_big');
        if (!store.has(name) && store.size >= STORAGE_KEYS)
            throw new SdkCallError('sdk.storage.too_many_keys');
        let total = 0;
        for (const [n, v] of store)
            if (n !== name)
                total += bytes(v); // host counts values only
        if (total + size > STORAGE_TOTAL_BYTES)
            throw new SdkCallError('sdk.storage.full');
        store.set(name, value);
    };
    const add = (k, by) => {
        const step = Number(by);
        if (!Number.isFinite(step))
            throw new SdkCallError('sdk.storage.bad_value');
        const current = Number(store.get(key(k)) ?? '0');
        if (!Number.isFinite(current))
            throw new SdkCallError('sdk.storage.not_a_number');
        const next = current + step;
        put(k, String(next));
        return next;
    };
    const impl = {
        logger: Object.fromEntries(['debug', 'info', 'warn', 'error', 'success'].map((level) => [level, async (text) => { logs.push({ level, text: String(text) }); }])),
        storage: {
            get: async (k) => store.get(key(k)) ?? null,
            set: async (k, v) => { put(k, v); },
            has: async (k) => store.has(key(k)),
            delete: async (k) => { store.delete(key(k)); },
            increment: async (k, by = 1) => add(k, by),
            decrement: async (k, by = 1) => add(k, -Number(by)),
            clear: async () => { store.clear(); },
        },
        guild: {
            get: async (guildId) => {
                const g = (options.guilds ?? []).find((x) => x.id === guildId);
                if (!g)
                    throw new SdkCallError('sdk.discord.bad_guild');
                return { ...g };
            },
            list: async () => (options.guilds ?? []).map((g) => ({ ...g })),
        },
        module: {
            get: async (key) => mod(key),
            getId: async (key) => mod(key).id,
            getName: async (key) => mod(key).name,
            isEnabled: async (key) => mod(key).enabled,
            getConfig: async (key) => structuredClone(mod(key).config),
            list: async () => (options.modules ?? []).map((m) => structuredClone(m)),
        },
        voice: {
            join: async (guildId, channelId) => {
                voiceGuild(guildId);
                if (typeof channelId !== 'string' || !SNOWFLAKE.test(channelId))
                    throw new SdkCallError('sdk.voice.bad_channel');
                voice.set(guildId, { channelId, playing: false, file: null });
            },
            leave: async (guildId) => { voiceGuild(guildId); voice.delete(guildId); },
            play: async (guildId, file, opts = {}) => {
                voiceGuild(guildId);
                if (typeof file !== 'string' || !SOUND_FILE.test(file) || (options.sounds && !options.sounds.includes(file))) {
                    throw new SdkCallError('sdk.voice.bad_file');
                }
                const volume = opts.volume ?? 1;
                if (typeof volume !== 'number' || !(volume >= 0 && volume <= 1))
                    throw new SdkCallError('sdk.voice.bad_volume');
                const state = voice.get(guildId);
                if (!state)
                    throw new SdkCallError('sdk.voice.not_connected');
                if (options.busyGuilds?.includes(guildId))
                    throw new SdkCallError('sdk.voice.busy');
                Object.assign(state, { playing: true, file });
                played.push({ guildId, channelId: state.channelId, file, volume });
            },
            stop: async (guildId) => {
                voiceGuild(guildId);
                const state = voice.get(guildId);
                if (state)
                    Object.assign(state, { playing: false, file: null });
            },
            state: async (guildId) => {
                voiceGuild(guildId);
                // Another player (e.g. the music module) is playing: file is null.
                if (options.busyGuilds?.includes(guildId))
                    return { channelId: voice.get(guildId)?.channelId ?? null, playing: true, file: null };
                const state = voice.get(guildId);
                return state ? { ...state } : { channelId: null, playing: false, file: null };
            },
        },
        http: {
            endpoint: async (key, request = {}) => {
                const server = options.endpoints?.[key];
                if (!server || (manifestEndpoints && !manifestEndpoints.includes(key)))
                    throw new SdkCallError('sdk.http.not_shared');
                const method = (request.method ?? 'GET').toUpperCase();
                if (!HTTP_METHODS.has(method))
                    throw new SdkCallError('sdk.http.bad_method');
                const path = request.path ?? '/';
                if (typeof path !== 'string' || !path.startsWith('/') || path.includes('..') || path.includes('//')) {
                    throw new SdkCallError('sdk.http.bad_path');
                }
                const headers = {};
                for (const [name, value] of Object.entries(request.headers ?? {})) {
                    if (BLOCKED_HEADERS.has(name.toLowerCase()))
                        throw new SdkCallError('sdk.http.bad_header');
                    headers[name] = String(value);
                }
                if (request.json !== undefined && bytes(JSON.stringify(request.json)) > HTTP_BODY_BYTES)
                    throw new SdkCallError('sdk.http.too_big');
                const req = { method, path, query: { ...(request.query ?? {}) }, json: request.json, headers };
                requests.push({ key, ...structuredClone(req) });
                let timer;
                const timeout = new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new SdkCallError('sdk.http.timeout')), HTTP_TIMEOUT_MS);
                });
                const reply = await Promise.race([Promise.resolve().then(() => server(structuredClone(req))), timeout]).finally(() => clearTimeout(timer));
                const text = reply.text ?? (reply.json !== undefined ? JSON.stringify(reply.json) : '');
                if (bytes(text) > HTTP_RESPONSE_BYTES)
                    throw new SdkCallError('sdk.http.too_big');
                let json = null;
                try {
                    json = reply.json !== undefined ? structuredClone(reply.json) : JSON.parse(text);
                }
                catch {
                    json = null;
                }
                const out = {};
                for (const [name, value] of Object.entries(reply.headers ?? {})) {
                    if (name.toLowerCase() !== 'set-cookie')
                        out[name.toLowerCase()] = value;
                }
                return { status: reply.status ?? 200, headers: out, json, text };
            },
        },
        message: {
            send: async (channelId, message) => {
                if (typeof channelId !== 'string' || !SNOWFLAKE.test(channelId))
                    throw new SdkCallError('sdk.discord.bad_channel');
                const now = Date.now();
                while (sendTimes.length && now - sendTimes[0] > SEND_WINDOW_MS)
                    sendTimes.shift();
                if (sendTimes.length >= SEND_MAX)
                    throw new SdkCallError('sdk.discord.rate_limited');
                sendTimes.push(now);
                const msgId = String(nextId++);
                sent.push({ channelId, message: structuredClone(message), id: msgId });
                return msgId;
            },
        },
    };
    function voiceGuild(guildId) {
        if (typeof guildId !== 'string' || !SNOWFLAKE.test(guildId))
            throw new SdkCallError('sdk.voice.bad_guild');
        if (options.guilds && !options.guilds.some((g) => g.id === guildId))
            throw new SdkCallError('sdk.voice.bad_guild');
    }
    function guildOf(guildId) {
        if (typeof guildId !== 'string' || !SNOWFLAKE.test(guildId))
            throw new SdkCallError('sdk.discord.bad_guild');
        if (options.guilds && !options.guilds.some((g) => g.id === guildId))
            throw new SdkCallError('sdk.discord.bad_guild');
    }
    function mod(key) {
        const m = (options.modules ?? []).find((x) => x.id === key);
        if (!m)
            throw new SdkCallError('sdk.module.unknown');
        return m;
    }
    // Local parts (no permission, no RPC), like the host.
    const local = {
        plugin: {
            getInfo: () => ({ id, name: String(options.manifest?.name ?? id), version, permissions: [...permissions], botId }),
            getId: () => id,
            getVersion: () => version,
            getConfig: () => structuredClone(config),
            isEnabled: () => true,
            getPath: () => `/plugins/${id}/${version}`,
            getManifest: () => structuredClone(options.manifest ?? { id, version }),
        },
        config: {
            get: (key) => (key in config ? structuredClone(config[key]) : undefined),
            has: (key) => key in config,
            getAll: () => structuredClone(config),
            set: async () => { throw new SdkCallError('sdk.call.not_available'); },
            delete: async () => { throw new SdkCallError('sdk.call.not_available'); },
        },
        utils: {
            uuid: () => crypto.randomUUID(),
            random: (min = 0, max = 1) => min + Math.random() * (max - min),
            hash: (text) => { let h = 0; for (const c of String(text))
                h = (h * 31 + c.codePointAt(0)) | 0; return (h >>> 0).toString(16); },
            formatDate: (date, locale = 'en') => new Date(date).toLocaleString(locale),
            formatDuration: (ms) => `${Math.round(ms / 1000)}s`,
            formatNumber: (n, locale = 'en') => n.toLocaleString(locale),
        },
    };
    const areas = new Map();
    const area = (name) => {
        if (!areas.has(name)) {
            areas.set(name, new Proxy({}, {
                get: (_t, method) => {
                    if (typeof method !== 'string')
                        return undefined;
                    return async (...args) => {
                        const call = `${name}.${method}`;
                        check(call);
                        return impl[name][method](...args);
                    };
                },
            }));
        }
        return areas.get(name);
    };
    return new Proxy({ botId, sent, logs, store, calls, played, requests }, {
        get: (target, prop) => {
            if (typeof prop !== 'string')
                return undefined;
            if (prop in target)
                return target[prop];
            if (prop in local)
                return local[prop];
            if (prop === 'then')
                return undefined; // not a thenable
            return area(prop);
        },
    });
}
async function withTimeout(run, timeoutMs) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new SdkCallError('sdk.block.timeout')), timeoutMs);
    });
    try {
        return await Promise.race([Promise.resolve().then(run), timeout]);
    }
    finally {
        clearTimeout(timer);
    }
}
/** Calls an event handler (manifest "events") like the bot does. */
export async function runEvent(plugin, event, ctx, payload = {}, timeoutMs = 10000) {
    const handler = plugin.events?.[event];
    if (!handler)
        throw new SdkCallError('sdk.event.unknown');
    await withTimeout(() => handler(ctx, structuredClone(payload)), timeoutMs);
}
/** Runs a task (manifest "tasks") once, like the scheduler of the bot. */
export async function runTask(plugin, name, ctx, timeoutMs = 10000) {
    const handler = plugin.tasks?.[name];
    if (!handler)
        throw new SdkCallError('sdk.task.unknown');
    await withTimeout(() => handler(ctx), timeoutMs);
}
/** Runs one block of a plugin like the bot does, with the block timeout. */
export async function runBlock(plugin, name, ctx, input = {}, timeoutMs = 10000) {
    const handler = plugin.blocks?.[name];
    if (!handler)
        throw new SdkCallError('sdk.block.unknown');
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new SdkCallError('sdk.block.timeout')), timeoutMs);
    });
    try {
        const out = await Promise.race([
            Promise.resolve(handler(ctx, { config: input.config ?? {}, vars: input.vars ?? {} })),
            timeout,
        ]);
        return { port: out?.port ?? 'next', results: out?.results ?? {} };
    }
    finally {
        clearTimeout(timer);
    }
}
