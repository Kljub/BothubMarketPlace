// Copied from BotHub sdk/dist/testing.js by sdk/market (npm run sync-sdk); do not edit.
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
    'globalStorage.get': 'storage.global', 'globalStorage.set': 'storage.global', 'globalStorage.has': 'storage.global',
    'globalStorage.delete': 'storage.global', 'globalStorage.increment': 'storage.global', 'globalStorage.decrement': 'storage.global',
    'globalStorage.clear': 'storage.global',
    'emoji.list': 'discord.emojis.read', 'emoji.get': 'discord.emojis.read',
    'audit.list': 'discord.audit.read',
    'member.voiceMute': 'discord.voice.mute', 'member.voiceDeafen': 'discord.voice.mute',
    'member.voiceDisconnect': 'discord.voice.move', 'member.voiceMove': 'discord.voice.move',
    'moderation.warn': 'modules.moderation.cases', 'moderation.record': 'modules.moderation.cases', 'moderation.history': 'modules.moderation.cases',
    'moderation.getCase': 'modules.moderation.cases', 'moderation.note': 'modules.moderation.cases', 'moderation.notes': 'modules.moderation.cases',
    'guild.get': 'discord.guilds.read', 'guild.list': 'discord.guilds.read',
    'secrets.get': 'secrets.read', 'secrets.has': 'secrets.read',
    'module.get': 'modules.read', 'module.getId': 'modules.read', 'module.getName': 'modules.read',
    'module.isEnabled': 'modules.read', 'module.getConfig': 'modules.read', 'module.list': 'modules.read',
    'message.send': 'discord.messages.send',
    'voice.join': 'discord.voice.connect', 'voice.leave': 'discord.voice.connect', 'voice.play': 'discord.voice.speak',
    'voice.stop': 'discord.voice.speak', 'voice.state': 'discord.voice.connect',
    'http.secret': 'secrets.use',
    'http.get': 'http.outbound', 'http.post': 'http.outbound', 'http.put': 'http.outbound', 'http.patch': 'http.outbound', 'http.delete': 'http.outbound',
    'message.dm': 'discord.messages.send',
    'guild.getChannels': 'discord.guilds.read', 'guild.getRoles': 'discord.guilds.read', 'guild.getEmojis': 'discord.guilds.read',
    'guild.getMembers': 'discord.members.read', 'member.get': 'discord.members.read', 'member.list': 'discord.members.read',
    'channel.get': 'discord.channels.read', 'channel.list': 'discord.channels.read',
    'role.get': 'discord.roles.read', 'role.list': 'discord.roles.read',
    'message.get': 'discord.messages.read',
    'message.edit': 'discord.messages.edit', 'message.delete': 'discord.messages.edit', 'message.pin': 'discord.messages.pin',
    'message.unpin': 'discord.messages.pin', 'message.react': 'discord.messages.react',
    'member.addRole': 'discord.roles.assign', 'member.removeRole': 'discord.roles.assign', 'member.timeout': 'discord.members.timeout',
    'member.kick': 'discord.members.kick', 'member.ban': 'discord.members.ban', 'member.unban': 'discord.members.ban', 'member.setNickname': 'discord.members.nicknames',
    'channel.create': 'discord.channels.write', 'channel.edit': 'discord.channels.write', 'channel.delete': 'discord.channels.write', 'channel.setPermissions': 'discord.channels.permissions',
    'role.create': 'discord.roles.write', 'role.edit': 'discord.roles.write', 'role.delete': 'discord.roles.write',
    'role.addToMember': 'discord.roles.assign', 'role.removeFromMember': 'discord.roles.assign',
    'emoji.create': 'discord.emojis.manage', 'emoji.delete': 'discord.emojis.manage',
    'interaction.reply': 'discord.interactions.reply', 'interaction.editReply': 'discord.interactions.reply', 'interaction.deferReply': 'discord.interactions.reply',
    'interaction.followUp': 'discord.interactions.reply', 'interaction.update': 'discord.interactions.reply', 'interaction.showModal': 'discord.modals',
    'economy.get': 'modules.economy.balance.read', 'economy.add': 'modules.economy.balance.write', 'economy.remove': 'modules.economy.balance.write', 'economy.transfer': 'modules.economy.balance.write', 'economy.leaderboard': 'modules.economy.balance.read',
};
// Old coarse permission keys and their finer replacements (shared/sdk-permissions.json "replaced"):
// options.permissions may still name an old key, like a manifest.
const REPLACED = { "discord.members.manage": ["discord.members.nicknames", "discord.roles.assign", "discord.members.timeout", "discord.members.kick", "discord.members.ban"], "discord.messages.manage": ["discord.messages.edit", "discord.messages.pin", "discord.messages.react"], "discord.channels.manage": ["discord.channels.write", "discord.channels.permissions"], "discord.roles.manage": ["discord.roles.write", "discord.roles.assign"], "discord.voice": ["discord.voice.connect", "discord.voice.speak"], "discord.voice.moderate": ["discord.voice.mute", "discord.voice.move"], "economy": ["modules.economy.balance.read", "modules.economy.balance.write"], "discord.interactions": ["discord.interactions.reply", "discord.modals"], "dashboard.ui": ["dashboard.read", "dashboard.settings", "dashboard.pages"], "discord.events": ["discord.events.messages", "discord.events.members", "discord.events.server", "discord.events.voice", "discord.events.interactions"], "economy.read": ["modules.economy.balance.read"], "economy.write": ["modules.economy.balance.write"], "economy.transactions": ["modules.economy.transactions"], "economy.settings": ["modules.economy.settings"], "moderation.cases": ["modules.moderation.cases"] };
// Areas and methods that exist in the SDK but the fake (and the bot) do not
// answer yet: they reject with "sdk.call.not_available".
const PLANNED_AREAS = new Set([
    'collection', 'cache', 'scheduler', 'events', 'commands',
    'permissions', 'plugins', 'dashboard', 'locale', 'rateLimit', 'resources',
]);
const PLANNED_CALLS = new Set([
    'storage.transaction', 'config.set', 'config.delete', 'utils.validate', 'interaction.respond',
]);
/** Discord calls the fake answers through options.discord (default: recorded, empty answer). */
const DISCORD_AREAS = new Set(['guild', 'member', 'channel', 'role', 'emoji', 'audit', 'moderation']);
// Host limits (shared/sdk-permissions.json "limits").
const STORAGE_KEYS = 1000;
const STORAGE_VALUE_BYTES = 16384;
const STORAGE_TOTAL_BYTES = 1048576;
const GLOBAL_STORAGE_KEYS = 10000;
const GLOBAL_STORAGE_TOTAL_BYTES = 10485760;
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
    const permissions = new Set((options.permissions ?? []).flatMap((p) => REPLACED[p] ?? [p]));
    const config = structuredClone(options.config ?? {});
    const store = new Map(Object.entries(options.storage ?? {}));
    const globalStore = new Map(Object.entries(options.globalStorage ?? {}));
    const sent = [];
    const logs = [];
    const calls = [];
    const sendTimes = [];
    const played = [];
    const requests = [];
    const voice = new Map();
    const webRequests = [];
    const actions = [];
    const answers = [];
    const balances = new Map(Object.entries(options.balances ?? {}));
    const hosts = options.hosts ?? Object.keys(options.web ?? {});
    const manifestSecrets = Array.isArray(options.manifest?.secrets) ? options.manifest.secrets : null;
    const secretOf = (name) => {
        if (typeof name !== 'string' || (manifestSecrets && !manifestSecrets.includes(name)))
            return null;
        return Object.hasOwn(options.secrets ?? {}, name) ? options.secrets[name] : null;
    };
    let nextId = 100000000000000000n;
    const check = (name) => {
        calls.push(name);
        if (!(name in CALLS) || PLANNED_CALLS.has(name)) {
            const area = name.split('.')[0];
            throw new SdkCallError(PLANNED_CALLS.has(name) || PLANNED_AREAS.has(area) ? 'sdk.call.not_available' : 'sdk.call.unknown');
        }
        const perm = CALLS[name];
        // module.*: modules.read (every module) or modules.<key>.read (one module, checked in the call).
        const oneModule = perm === 'modules.read' && [...permissions].some((p) => /^modules\.[a-z0-9-]+\.read$/.test(p));
        if (perm && !permissions.has(perm) && !oneModule)
            throw new SdkCallError('sdk.call.denied');
    };
    const key = (k) => {
        if (typeof k !== 'string' || !STORAGE_KEY.test(k))
            throw new SdkCallError('sdk.storage.bad_key');
        return k;
    };
    // One key-value space with its quotas, like the host: ctx.storage (per bot) and ctx.globalStorage.
    const space = (map, maxKeys, maxBytes) => {
        const put = (k, value) => {
            const name = key(k);
            if (typeof value !== 'string')
                throw new SdkCallError('sdk.storage.bad_value');
            const size = bytes(value);
            if (size > STORAGE_VALUE_BYTES)
                throw new SdkCallError('sdk.storage.value_too_big');
            if (!map.has(name) && map.size >= maxKeys)
                throw new SdkCallError('sdk.storage.too_many_keys');
            let total = 0;
            for (const [n, v] of map)
                if (n !== name)
                    total += bytes(v); // host counts values only
            if (total + size > maxBytes)
                throw new SdkCallError('sdk.storage.full');
            map.set(name, value);
        };
        const add = (k, by) => {
            const step = Number(by);
            if (!Number.isFinite(step))
                throw new SdkCallError('sdk.storage.bad_value');
            const current = Number(map.get(key(k)) ?? '0');
            if (!Number.isFinite(current))
                throw new SdkCallError('sdk.storage.not_a_number');
            const next = current + step;
            put(k, String(next));
            return next;
        };
        return {
            get: async (k) => map.get(key(k)) ?? null,
            set: async (k, v) => { put(k, v); },
            has: async (k) => map.has(key(k)),
            delete: async (k) => { map.delete(key(k)); },
            increment: async (k, by = 1) => add(k, by),
            decrement: async (k, by = 1) => add(k, -Number(by)),
            clear: async () => { map.clear(); },
        };
    };
    const mayRead = (key) => permissions.has('modules.read') || permissions.has(`modules.${key}.read`);
    const readable = (key) => {
        if (!mayRead(key))
            throw new SdkCallError('sdk.call.denied');
        return key;
    };
    const impl = {
        logger: Object.fromEntries(['debug', 'info', 'warn', 'error', 'success'].map((level) => [level, async (text) => { logs.push({ level, text: String(text) }); }])),
        storage: space(store, STORAGE_KEYS, STORAGE_TOTAL_BYTES),
        globalStorage: space(globalStore, GLOBAL_STORAGE_KEYS, GLOBAL_STORAGE_TOTAL_BYTES),
        guild: {
            get: async (guildId) => {
                const g = (options.guilds ?? []).find((x) => x.id === guildId);
                if (!g)
                    throw new SdkCallError('sdk.discord.bad_guild');
                return { ...g };
            },
            list: async () => (options.guilds ?? []).map((g) => ({ ...g })),
        },
        secrets: {
            get: async (name) => secretOf(name),
            has: async (name) => secretOf(name) !== null,
        },
        module: {
            get: async (key) => mod(readable(key)),
            getId: async (key) => mod(readable(key)).id,
            getName: async (key) => mod(readable(key)).name,
            isEnabled: async (key) => mod(readable(key)).enabled,
            getConfig: async (key) => structuredClone(mod(readable(key)).config),
            list: async () => (options.modules ?? []).filter((m) => mayRead(m.id)).map((m) => structuredClone(m)),
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
            // Like the bot: url = name of an address secret (+ path) or an https URL of
            // a host of "hosts"; auth puts a secret into a header or URL parameter.
            // The fake server is options.web[<host of the address>].
            secret: async (request = {}) => {
                const method = (request.method ?? 'GET').toUpperCase();
                if (!HTTP_METHODS.has(method))
                    throw new SdkCallError('sdk.http.bad_method');
                let u;
                const name = String(request.url ?? '');
                if (/^[A-Z][A-Z0-9_]{1,39}$/.test(name)) {
                    const address = secretOf(name);
                    if (!address)
                        throw new SdkCallError('sdk.secret.not_shared');
                    const path = request.path ?? '';
                    if (typeof path !== 'string' || (path && !path.startsWith('/')) || path.includes('..') || path.includes('//'))
                        throw new SdkCallError('sdk.http.bad_path');
                    try {
                        u = new URL(address.replace(/\/+$/, '') + path);
                    }
                    catch {
                        throw new SdkCallError('sdk.secret.not_a_url');
                    }
                }
                else {
                    try {
                        u = new URL(name);
                    }
                    catch {
                        throw new SdkCallError('sdk.http.bad_url');
                    }
                    if (u.protocol !== 'https:')
                        throw new SdkCallError('sdk.http.bad_url');
                    if (!hosts.includes(u.hostname))
                        throw new SdkCallError('sdk.http.host_not_allowed');
                }
                for (const [k, v] of Object.entries(request.query ?? {}))
                    u.searchParams.set(k, String(v));
                const headers = {};
                for (const [h, value] of Object.entries(request.headers ?? {})) {
                    if (BLOCKED_HEADERS.has(h.toLowerCase()))
                        throw new SdkCallError('sdk.http.bad_header');
                    headers[h] = String(value);
                }
                if (request.auth) {
                    const key = secretOf(request.auth.secret);
                    if (!key)
                        throw new SdkCallError('sdk.secret.not_shared');
                    const format = request.auth.format ?? 'bearer';
                    if (format === 'query')
                        u.searchParams.set(request.auth.param ?? 'key', key);
                    else
                        headers[request.auth.header ?? 'Authorization'] = format === 'bearer' ? `Bearer ${key}` : key;
                }
                if (request.json !== undefined && bytes(JSON.stringify(request.json)) > HTTP_BODY_BYTES)
                    throw new SdkCallError('sdk.http.too_big');
                const server = options.web?.[u.hostname];
                if (!server)
                    throw new SdkCallError('sdk.http.failed');
                const req = { method, url: u.toString(), query: Object.fromEntries(u.searchParams), json: request.json, headers };
                requests.push(structuredClone(req));
                let timer;
                const timeout = new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new SdkCallError('sdk.http.timeout')), HTTP_TIMEOUT_MS);
                });
                const reply = await Promise.race([Promise.resolve().then(() => server(structuredClone(req))), timeout]).finally(() => clearTimeout(timer));
                const hide = [request.auth ? secretOf(request.auth.secret) : null, /^[A-Z][A-Z0-9_]{1,39}$/.test(name) ? secretOf(name) : null].filter((v) => !!v);
                const masked = (t) => hide.reduce((acc, v) => (v.length >= 4 ? acc.split(v).join('••••') : acc), t);
                const text = masked(reply.text ?? (reply.json !== undefined ? JSON.stringify(reply.json) : ''));
                if (bytes(text) > HTTP_RESPONSE_BYTES)
                    throw new SdkCallError('sdk.http.too_big');
                let json = null;
                try {
                    json = JSON.parse(text);
                }
                catch {
                    json = null;
                }
                const out = {};
                for (const [h, value] of Object.entries(reply.headers ?? {})) {
                    if (h.toLowerCase() !== 'set-cookie')
                        out[h.toLowerCase()] = masked(value);
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
            dm: async (userId, message) => {
                if (typeof userId !== 'string' || !SNOWFLAKE.test(userId))
                    throw new SdkCallError('sdk.discord.bad_user');
                const msgId = String(nextId++);
                sent.push({ channelId: `dm:${userId}`, message: structuredClone(message), id: msgId });
                return msgId;
            },
        },
        interaction: Object.fromEntries(['reply', 'editReply', 'deferReply', 'followUp', 'update', 'showModal'].map((kind) => [kind, async (handle, a, b) => {
                if (typeof handle !== 'string' || !handle)
                    throw new SdkCallError('sdk.interaction.unknown');
                const done = answers.filter((x) => x.handle === handle);
                if (kind === 'showModal' && done.length)
                    throw new SdkCallError('sdk.interaction.too_late');
                if ((kind === 'editReply' || kind === 'followUp') && !done.some((x) => x.kind !== 'showModal'))
                    throw new SdkCallError('sdk.interaction.not_replied');
                const opts = (kind === 'deferReply' ? a : b);
                answers.push({
                    handle, kind,
                    ...(kind === 'showModal' ? { modal: structuredClone(a) } : kind === 'deferReply' ? {} : { message: structuredClone(a) }),
                    ...(opts?.ephemeral ? { ephemeral: true } : {}),
                });
            }])),
        economy: {
            get: async (g, u) => balances.get(`${g}:${u}`) ?? 0,
            add: async (g, u, n) => coins(g, u, n),
            remove: async (g, u, n) => {
                if ((balances.get(`${g}:${u}`) ?? 0) < n)
                    throw new SdkCallError('sdk.economy.not_enough');
                return coins(g, u, -n);
            },
            transfer: async (g, from, to, n) => {
                if ((balances.get(`${g}:${from}`) ?? 0) < n)
                    throw new SdkCallError('sdk.economy.not_enough');
                coins(g, from, -n);
                coins(g, to, n);
            },
            leaderboard: async (g, limit = 10) => [...balances].filter(([k]) => k.startsWith(`${g}:`)).map(([k, v]) => ({ userId: k.split(':')[1], balance: v })).sort((x, y) => y.balance - x.balance).slice(0, limit),
        },
    };
    function coins(g, u, n) {
        if (typeof n !== 'number' || !Number.isInteger(n))
            throw new SdkCallError('sdk.economy.bad_amount');
        const next = (balances.get(`${g}:${u}`) ?? 0) + n;
        balances.set(`${g}:${u}`, next);
        return next;
    }
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        impl.http[method] = async (url, a, b) => {
            const opts = ((method === 'get' || method === 'delete' ? a : b) ?? {});
            let u;
            try {
                u = new URL(String(url));
            }
            catch {
                throw new SdkCallError('sdk.http.bad_url');
            }
            if (u.protocol !== 'https:')
                throw new SdkCallError('sdk.http.bad_url');
            const server = options.web?.[u.hostname];
            if (!hosts.includes(u.hostname) || !server)
                throw new SdkCallError('sdk.http.host_not_allowed');
            for (const [k, v] of Object.entries(opts.query ?? {}))
                u.searchParams.set(k, String(v));
            const headers = { ...(opts.headers ?? {}) };
            for (const name of Object.keys(headers))
                if (BLOCKED_HEADERS.has(name.toLowerCase()))
                    throw new SdkCallError('sdk.http.bad_header');
            const req = { method: method.toUpperCase(), url: u.toString(), query: Object.fromEntries(u.searchParams), json: method === 'get' || method === 'delete' ? undefined : a, headers };
            webRequests.push(structuredClone(req));
            const reply = await server(structuredClone(req));
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
            return { status: reply.status ?? 200, headers: { ...(reply.headers ?? {}) }, json, text };
        };
    }
    /** Discord calls without an own fake: options.discord, else recorded with an empty answer. */
    const generic = (call, args) => {
        const fake = options.discord?.[call];
        if (fake)
            return fake(...args);
        actions.push({ call, args: structuredClone(args) });
        return /\.(list|get(Channels|Roles|Emojis|Members))$/.test(call) ? [] : undefined;
    };
    function voiceGuild(guildId) {
        if (typeof guildId !== 'string' || !SNOWFLAKE.test(guildId))
            throw new SdkCallError('sdk.voice.bad_guild');
        if (options.guilds && !options.guilds.some((g) => g.id === guildId))
            throw new SdkCallError('sdk.voice.bad_guild');
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
            // Like the bot: the "permissions" field, checked like a command's permissions block.
            checkAccess: async (key, who) => {
                const field = options.settings?.fields.find((f) => f.key === key && f.type === 'permissions');
                if (!field)
                    throw new SdkCallError('sdk.config.not_permissions');
                const userId = typeof who?.userId === 'string' ? who.userId : who?.user?.id;
                const guildId = who?.guildId ?? null;
                const channelId = who?.channelId ?? null;
                if (guildId === null)
                    return { allowed: true, reason: null };
                if (typeof userId !== 'string' || !SNOWFLAKE.test(userId) || typeof guildId !== 'string' || !SNOWFLAKE.test(guildId))
                    throw new SdkCallError('sdk.config.bad_member');
                const m = options.members?.[userId];
                if (!m)
                    return { allowed: false, reason: 'member' };
                const b = ((key in config ? config[key] : field.default) ?? { allowed_roles: [{ id: 'everyone' }] });
                const inGuild = (r) => !r.guild || r.guild === guildId;
                const has = (r) => r.id === 'everyone' || (m.roles ?? []).includes(r.id);
                const deny = (reason) => ({ allowed: false, reason });
                if ((b.banned_channels ?? []).some((c) => inGuild(c) && c.id === channelId))
                    return deny('channel');
                if ((b.banned_roles ?? []).some((r) => inGuild(r) && r.id !== 'everyone' && has(r)))
                    return deny('banned_role');
                const allowed = (b.allowed_roles ?? []).filter(inGuild);
                if (allowed.length && !allowed.some(has))
                    return deny('role');
                if ((b.required_permissions ?? []).some((p) => !(m.permissions ?? []).includes(p)))
                    return deny('permission');
                return { allowed: true, reason: null };
            },
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
                        const own = impl[name]?.[method];
                        if (own && !options.discord?.[call])
                            return own(...args);
                        if (DISCORD_AREAS.has(name) || name === 'message')
                            return generic(call, args);
                        return own(...args);
                    };
                },
            }));
        }
        return areas.get(name);
    };
    return new Proxy({ botId, sent, logs, store, globalStore, calls, played, requests, web: webRequests, actions, answers, balances }, {
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
            Promise.resolve(handler(ctx, { config: input.config ?? {}, vars: input.vars ?? {}, ...(input.interaction ? { interaction: input.interaction } : {}) })),
            timeout,
        ]);
        return { port: out?.port ?? 'next', results: out?.results ?? {} };
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * A click/select (components[key]) or modal (modals[key]) like the bot sends
 * it. Returns the handle; ctx.answers holds what the plugin answered.
 */
export async function runComponent(plugin, key, ctx, event = {}, kind = 'component', timeoutMs = 10000) {
    const handler = (kind === 'modal' ? plugin.modals : plugin.components)?.[key];
    if (!handler)
        throw new SdkCallError('sdk.component.unknown');
    const handle = event.handle ?? `test-${Math.random().toString(16).slice(2)}`;
    const full = {
        handle, key, data: '', user: { id: '100000000000000001', name: 'tester', displayName: 'Tester' },
        guildId: '200000000000000001', channelId: '300000000000000001', ...event,
    };
    await withTimeout(() => handler(ctx, structuredClone(full)), timeoutMs);
    return handle;
}
/** A modal answer (modals[key]) with its fields. */
export function runModal(plugin, key, ctx, fields, event = {}) {
    return runComponent(plugin, key, ctx, { ...event, fields }, 'modal');
}
/** Calls an inbound webhook handler (bothub.json services.webhooks) like the bot does. */
export async function runWebhook(plugin, name, ctx, payload = {}, timeoutMs = 10000) {
    const handler = plugin.webhooks?.[name];
    if (!handler)
        throw new SdkCallError('sdk.webhook.unknown');
    await withTimeout(() => handler(ctx, structuredClone(payload)), timeoutMs);
}
