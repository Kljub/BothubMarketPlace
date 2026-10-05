import type { BlockInput, BlockResult, InteractionEvent, Message, PluginDefinition } from './index.js';
type Json = string | number | boolean | null | Json[] | {
    [k: string]: Json;
};
/** Error like the host's: .message and .key are the key string. */
export declare class SdkCallError extends Error {
    readonly key: string;
    constructor(key: string);
}
export interface TestGuild {
    id: string;
    name: string;
    memberCount: number;
}
export interface TestModule {
    id: string;
    name: string;
    enabled: boolean;
    config: Record<string, Json>;
}
export interface TestContextOptions {
    /** Plugin ID (default "test-plugin"). */
    id?: string;
    version?: string;
    botId?: number;
    /** Permissions declared AND allowed by the SDK policies. */
    permissions?: string[];
    /** Saved settings of the plugin's settings page (read-only for the plugin). */
    config?: Record<string, Json>;
    /** Start values of ctx.storage. */
    storage?: Record<string, string>;
    /**
     * Secrets the admin shared with the plugin: name -> value. Like on the bot,
     * a name must also be in the manifest "secrets" (when a manifest is given);
     * any other name answers null.
     */
    secrets?: Record<string, string>;
    /** Start values of ctx.globalStorage (shared by every bot of the instance). */
    globalStorage?: Record<string, string>;
    guilds?: TestGuild[];
    modules?: TestModule[];
    manifest?: Record<string, Json>;
    /** Files of the plugin folder voice.play may use; default: any valid name. */
    sounds?: string[];
    /** Servers where another player (e.g. the music module) plays: voice.play rejects with sdk.voice.busy. */
    busyGuilds?: string[];
    /**
     * Fake Discord answers by call name ("member.get", "role.list",
     * "message.get", …). Calls without a fake are recorded in `actions` and
     * answer undefined (lists: []).
     */
    discord?: Record<string, (...args: any[]) => unknown>;
    /**
     * http.get/post/…: fake servers by host. The host must also be in
     * `hosts` (bothub.json "services.hosts"), like on the bot.
     */
    web?: Record<string, (request: WebRequest) => EndpointReply | Promise<EndpointReply>>;
    /** bothub.json "services.hosts"; default: the hosts of `web`. */
    hosts?: string[];
    /** Start balances of the Economy module: "<guildId>:<userId>" -> coins. */
    balances?: Record<string, number>;
    /** Start bank amounts of the Economy module: "<guildId>:<userId>" -> coins. */
    banks?: Record<string, number>;
    /**
     * dashboard/settings.json: its "permissions" fields are what
     * config.checkAccess checks; config.set takes only its keys.
     */
    /** Keys of the bot's other variables (dashboard or other plugins): variables.create refuses them. */
    takenVariables?: string[];
    settings?: {
        fields: Array<{
            key: string;
            type: string;
            default?: Json;
            dynamic?: boolean;
            item?: Array<{
                key: string;
                type: string;
                default?: Json;
            }>;
        }>;
    };
    /** Start content of ctx.files: name ("<16 hex>.png") -> base64. */
    files?: Record<string, string>;
    /** files.fromDiscord: attachment URL -> base64 content. Other URLs fail like a dead link. */
    attachments?: Record<string, string>;
    /**
     * Members for config.checkAccess: user ID -> role IDs and Discord
     * permission names ("manage_messages", …). Users not listed are not on the server.
     */
    members?: Record<string, {
        roles?: string[];
        permissions?: string[];
    }>;
}
export interface WebRequest {
    method: string;
    url: string;
    query: Record<string, string>;
    json: Json | undefined;
    headers: Record<string, string>;
    /** http.secret with `file`: the multipart image (base64) and its text fields. */
    file?: {
        field: string;
        name: string;
        mime: string;
        data: string;
    };
    fields?: Record<string, string>;
}
/** An answer of the plugin to a command or click (ctx.interaction.*). */
export interface InteractionAnswer {
    handle: string;
    kind: 'reply' | 'editReply' | 'deferReply' | 'followUp' | 'update' | 'showModal';
    message?: Message | string;
    ephemeral?: boolean;
    modal?: Json; /** A plugin file sent with it (options.file). */
    file?: string;
}
/** ctx.http.secret request (see the SDK). */
export interface SecretRequestKit {
    url: string;
    path?: string;
    method?: string;
    query?: Record<string, string>;
    json?: Json;
    headers?: Record<string, string>;
    auth?: {
        secret: string;
        header?: string;
        format?: 'bearer' | 'plain' | 'query' | 'basic';
        param?: string;
    };
    file?: {
        name: string;
        field?: string;
    };
    fields?: Record<string, string>;
    saveAs?: 'file';
    jsonFile?: {
        name: string;
        path: string;
    };
    fileFrom?: string;
    timeoutMs?: number;
}
export interface EndpointRequest {
    method: string;
    path: string;
    query: Record<string, string>;
    json: Json | undefined;
    headers: Record<string, string>;
}
/** base64: a binary answer (e.g. an image for saveAs 'file'). */
export interface EndpointReply {
    status?: number;
    json?: Json;
    text?: string;
    base64?: string;
    headers?: Record<string, string>; /** http.check: the latency it reports (default 1). */
    latencyMs?: number;
}
export interface PlayedSound {
    guildId: string;
    channelId: string;
    file: string;
    volume: number;
}
/** A sent message; file: the image of message.sendFile. */
export interface SentMessage {
    channelId: string;
    message: Message | string;
    id: string;
    file?: string;
}
export interface LogLine {
    level: string;
    text: string;
}
/** The fake ctx plus what the plugin did, for assertions. */
export interface TestContext {
    readonly botId: number;
    readonly sent: SentMessage[];
    readonly logs: LogLine[];
    /** Current storage content. */
    readonly store: Map<string, string>;
    /** Current global storage content. */
    readonly globalStore: Map<string, string>;
    /** Every call in order, e.g. "storage.increment". */
    readonly calls: string[];
    /** Every voice.play call. */
    readonly played: PlayedSound[];
    /** Every http.secret call, as the fake server got it (secret values included, for checks). */
    readonly requests: WebRequest[];
    /** Every http.get/post/… call. */
    readonly web: WebRequest[];
    /** Discord calls without a fake: name and arguments (e.g. role.addToMember). */
    readonly actions: Array<{
        call: string;
        args: unknown[];
    }>;
    /** Answers to commands and clicks (ctx.interaction.*), in order. */
    readonly answers: InteractionAnswer[];
    /** Songs of ctx.music.enqueue (guildId plus the item as given). */
    readonly queued: Json[];
    /** Members whose voice channel music.enqueue joined (options.joinUser). */
    readonly joined: string[];
    /** Economy balances: "<guildId>:<userId>" -> coins. */
    readonly balances: Map<string, number>;
    /** Economy bank amounts: "<guildId>:<userId>" -> coins. */
    readonly banks: Map<string, number>;
    /** Current plugin files: name -> base64. */
    readonly fileStore: Map<string, string>;
    /** Current settings (config.set changes them). */
    readonly settingsNow: Record<string, Json>;
    /** Variables created with variables.create, and their values ("key|server|owner"). */
    readonly variableDefs: Map<string, Record<string, Json>>;
    readonly variableValues: Map<string, string>;
    /** Options set with config.setOptions, per field. */
    readonly fieldOptions: Record<string, {
        value: string;
        label: string;
    }[]>;
    [area: string]: unknown;
}
export declare function createTestContext(options?: TestContextOptions): TestContext;
/** Calls an event handler (manifest "events") like the bot does. */
export declare function runEvent(plugin: PluginDefinition, event: string, ctx: TestContext, payload?: Record<string, Json>, timeoutMs?: number): Promise<void>;
/** Runs a task (manifest "tasks") once, like the scheduler of the bot. */
export declare function runTask(plugin: PluginDefinition, name: string, ctx: TestContext, timeoutMs?: number): Promise<void>;
/** Runs one block of a plugin like the bot does, with the block timeout. */
export declare function runBlock(plugin: PluginDefinition, name: string, ctx: TestContext, input?: Partial<BlockInput>, timeoutMs?: number): Promise<BlockResult>;
/**
 * A click/select (components[key]) or modal (modals[key]) like the bot sends
 * it. Returns the handle; ctx.answers holds what the plugin answered.
 */
export declare function runComponent(plugin: PluginDefinition, key: string, ctx: TestContext, event?: Partial<InteractionEvent>, kind?: 'component' | 'modal', timeoutMs?: number): Promise<string>;
/** A modal answer (modals[key]) with its fields. */
export declare function runModal(plugin: PluginDefinition, key: string, ctx: TestContext, fields: Record<string, string>, event?: Partial<InteractionEvent>): Promise<string>;
/** Calls an inbound webhook handler (bothub.json services.webhooks) like the bot does. */
export declare function runWebhook(plugin: PluginDefinition, name: string, ctx: TestContext, payload?: Record<string, Json>, timeoutMs?: number): Promise<void>;
export {};
