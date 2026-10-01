import type { BlockInput, BlockResult, Message, PluginDefinition } from './index.js';
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
    guilds?: TestGuild[];
    modules?: TestModule[];
    manifest?: Record<string, Json>;
    /**
     * API endpoints the admin shared with the plugin: key -> fake server. The
     * key must also be in the manifest "endpoints" (when a manifest is given).
     */
    endpoints?: Record<string, (request: EndpointRequest) => EndpointReply | Promise<EndpointReply>>;
    /** Files of the plugin folder voice.play may use; default: any valid name. */
    sounds?: string[];
    /** Servers where another player (e.g. the music module) plays: voice.play rejects with sdk.voice.busy. */
    busyGuilds?: string[];
}
export interface EndpointRequest {
    method: string;
    path: string;
    query: Record<string, string>;
    json: Json | undefined;
    headers: Record<string, string>;
}
export interface EndpointReply {
    status?: number;
    json?: Json;
    text?: string;
    headers?: Record<string, string>;
}
export interface PlayedSound {
    guildId: string;
    channelId: string;
    file: string;
    volume: number;
}
export interface SentMessage {
    channelId: string;
    message: Message | string;
    id: string;
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
    /** Every call in order, e.g. "storage.increment". */
    readonly calls: string[];
    /** Every voice.play call. */
    readonly played: PlayedSound[];
    /** Every http.endpoint call, as the fake server got it. */
    readonly requests: Array<EndpointRequest & {
        key: string;
    }>;
    [area: string]: unknown;
}
export declare function createTestContext(options?: TestContextOptions): TestContext;
/** Calls an event handler (manifest "events") like the bot does. */
export declare function runEvent(plugin: PluginDefinition, event: string, ctx: TestContext, payload?: Record<string, Json>, timeoutMs?: number): Promise<void>;
/** Runs a task (manifest "tasks") once, like the scheduler of the bot. */
export declare function runTask(plugin: PluginDefinition, name: string, ctx: TestContext, timeoutMs?: number): Promise<void>;
/** Runs one block of a plugin like the bot does, with the block timeout. */
export declare function runBlock(plugin: PluginDefinition, name: string, ctx: TestContext, input?: Partial<BlockInput>, timeoutMs?: number): Promise<BlockResult>;
export {};
