type Json = string | number | boolean | null | Json[] | {
    [k: string]: Json;
};
type Id = string;
type Async<T> = Promise<T>;
/** A message like the "Send or Edit a Message" block builds it. */
export interface Message {
    mode?: 'normal' | 'v2';
    content?: string;
    embeds?: Array<{
        color?: string;
        title?: string;
        url?: string;
        description?: string;
        fields?: Array<{
            name: string;
            value: string;
            inline?: boolean;
        }>;
        footer?: {
            text?: string;
            icon_url?: string;
        };
        image_url?: string;
        thumbnail_url?: string;
        timestamp?: boolean;
    }>;
    /**
     * Buttons and selects (max. 5 rows). Clicks come back to the plugin's
     * `components[key]` handler with `data` (max. 64 chars). Link buttons open a URL.
     */
    components?: ComponentRow[];
    /** true: user mentions in the text ping; default: no pings. */
    mentionUsers?: boolean;
}
export type ComponentRow = Array<{
    type?: 'button';
    key: string;
    data?: string;
    label?: string;
    emoji?: string;
    style?: 'primary' | 'secondary' | 'success' | 'danger';
    disabled?: boolean;
} | {
    type: 'link';
    url: string;
    label?: string;
    emoji?: string;
    disabled?: boolean;
} | {
    type: 'select';
    key: string;
    data?: string;
    placeholder?: string;
    min?: number;
    max?: number;
    disabled?: boolean;
    options: Array<{
        label: string;
        value: string;
        description?: string;
        emoji?: string;
        default?: boolean;
    }>;
}>;
/** A modal (interaction.showModal); the answer comes to `modals[key]`. */
export interface Modal {
    key: string;
    data?: string;
    title: string;
    fields: Array<{
        key: string;
        label: string;
        style?: 'short' | 'long';
        required?: boolean;
        value?: string;
        placeholder?: string;
        min?: number;
        max?: number;
    }>;
}
/** A click, select or modal answer for the plugin (components / modals handlers). */
export interface InteractionEvent {
    /** Use with ctx.interaction.* (valid 15 minutes). The bot acknowledges silently after 2.5 s. */
    handle: string;
    key: string;
    data: string;
    user: {
        id: Id;
        name: string;
        displayName: string;
    };
    guildId: Id | null;
    channelId: Id | null;
    messageId?: Id;
    /** Select menus: the chosen values. */
    values?: string[];
    /** Modals: field key → text. */
    fields?: Record<string, string>;
}
export interface HttpAnswer {
    status: number;
    headers: Record<string, string>;
    json: Json;
    text: string;
    base64?: string;
}
export interface MemberInfo {
    id: Id;
    name: string;
    displayName: string;
    bot: boolean;
    avatar: string;
    joinedAt: string | null;
    roles: Id[];
}
export interface RoleInfo {
    id: Id;
    name: string;
    color: string;
    position: number;
    managed: boolean;
    mentionable: boolean;
    hoist: boolean;
    members: number;
}
export interface ChannelInfo {
    id: Id;
    name: string;
    type: string;
    parentId: Id | null;
    position?: number;
    guildId?: Id;
    topic?: string | null;
}
export interface MessageInfo {
    id: Id;
    channelId: Id;
    guildId: Id | null;
    content: string;
    authorId: Id;
    authorName: string;
    bot: boolean;
    createdAt: string;
    url: string;
    attachments: Array<{
        name: string;
        url: string;
        size: number;
        contentType: string | null;
    }>;
    embeds: number;
    stickers: number;
}
export interface GuildInfo {
    id: Id;
    name: string;
    memberCount: number;
}
export interface ModuleInfo {
    id: string;
    name: string;
    enabled: boolean;
    config: Record<string, Json>;
}
export interface PluginContext {
    /** Bot the plugin runs for; storage and Discord calls stay inside it. */
    readonly botId: number;
    readonly plugin: {
        getInfo(): {
            id: string;
            name: string;
            version: string;
            permissions: string[];
            botId: number;
        };
        getId(): string;
        getVersion(): string;
        getConfig(): Record<string, Json>;
        isEnabled(): boolean;
        getPath(): string;
        getManifest(): Record<string, Json>;
    };
    readonly logger: Record<'debug' | 'info' | 'warn' | 'error' | 'success', (text: string) => Async<void>>;
    /** Plugin settings saved on the dashboard; set/delete are planned. */
    readonly config: {
        get(key: string): Json | undefined;
        has(key: string): boolean;
        getAll(): Record<string, Json>;
        set(key: string, value: Json): Async<void>;
        delete(key: string): Async<void>;
    };
    readonly utils: {
        uuid(): string;
        random(min?: number, max?: number): number;
        hash(text: string, algorithm?: string): string;
        formatDate(date: string | number | Date, locale?: string): string;
        formatDuration(ms: number): string;
        formatNumber(n: number, locale?: string): string;
        validate(value: Json, schema: Json): Async<boolean>;
    };
    readonly locale: {
        get(): Async<string>;
        translate(key: string, params?: Record<string, Json>): Async<string>;
        has(key: string): Async<boolean>;
        getAvailable(): Async<string[]>;
    };
    readonly rateLimit: {
        check(key: string, max: number, windowMs: number): Async<boolean>;
        consume(key: string, max: number, windowMs: number): Async<boolean>;
        reset(key: string): Async<void>;
    };
    readonly resources: {
        readFile(path: string): Async<string>;
        exists(path: string): Async<boolean>;
        getPath(path: string): Async<string>;
    };
    readonly storage: {
        get(key: string): Async<string | null>;
        set(key: string, value: string): Async<void>;
        has(key: string): Async<boolean>;
        delete(key: string): Async<void>;
        increment(key: string, by?: number): Async<number>;
        decrement(key: string, by?: number): Async<number>;
        clear(): Async<void>;
        transaction<T>(fn: () => Async<T>): Async<T>;
    };
    readonly collection: {
        create(name: string): Async<void>;
        find(name: string, query?: Record<string, Json>): Async<Record<string, Json>[]>;
        findOne(name: string, query?: Record<string, Json>): Async<Record<string, Json> | null>;
        count(name: string, query?: Record<string, Json>): Async<number>;
        insert(name: string, doc: Record<string, Json>): Async<Id>;
        update(name: string, query: Record<string, Json>, changes: Record<string, Json>): Async<number>;
        upsert(name: string, query: Record<string, Json>, doc: Record<string, Json>): Async<Id>;
        delete(name: string, query: Record<string, Json>): Async<number>;
    };
    readonly cache: {
        get(key: string): Async<Json>;
        set(key: string, value: Json, ttlMs?: number): Async<void>;
        has(key: string): Async<boolean>;
        delete(key: string): Async<void>;
        clear(): Async<void>;
        increment(key: string, by?: number): Async<number>;
        decrement(key: string, by?: number): Async<number>;
    };
    readonly scheduler: {
        timeout(name: string, ms: number): Async<Id>;
        interval(name: string, ms: number): Async<Id>;
        cron(name: string, expression: string): Async<Id>;
        every(name: string, duration: string): Async<Id>;
        cancel(id: Id): Async<void>;
        list(): Async<{
            id: Id;
            name: string;
        }[]>;
    };
    readonly events: {
        on(event: string, handler: (payload: Json) => unknown): Async<void>;
        once(event: string, handler: (payload: Json) => unknown): Async<void>;
        off(event: string): Async<void>;
        emit(event: string, payload?: Json): Async<void>;
        list(): Async<string[]>;
    };
    readonly guild: {
        get(guildId: Id): Async<GuildInfo>;
        list(): Async<GuildInfo[]>;
        getChannels(guildId: Id): Async<ChannelInfo[]>;
        getRoles(guildId: Id): Async<RoleInfo[]>;
        getEmojis(guildId: Id): Async<Array<{
            id: Id;
            name: string;
            animated: boolean;
            url: string;
        }>>;
        /** "discord.members.read" */
        getMembers(guildId: Id, options?: {
            limit?: number;
        }): Async<MemberInfo[]>;
    };
    readonly member: {
        get(guildId: Id, userId: Id): Async<MemberInfo>;
        list(guildId: Id, options?: {
            limit?: number;
        }): Async<MemberInfo[]>;
        addRole(guildId: Id, userId: Id, roleId: Id, reason?: string): Async<void>;
        removeRole(guildId: Id, userId: Id, roleId: Id, reason?: string): Async<void>;
        /** ms up to 28 days; null ends the timeout. */
        timeout(guildId: Id, userId: Id, ms: number | null, reason?: string): Async<void>;
        kick(guildId: Id, userId: Id, reason?: string): Async<void>;
        ban(guildId: Id, userId: Id, reason?: string): Async<void>;
        unban(guildId: Id, userId: Id, reason?: string): Async<void>;
        setNickname(guildId: Id, userId: Id, nickname: string | null, reason?: string): Async<void>;
    };
    readonly channel: {
        get(channelId: Id): Async<ChannelInfo>;
        list(guildId: Id): Async<ChannelInfo[]>;
        create(guildId: Id, options: {
            name: string;
            type?: 'text' | 'voice' | 'category' | 'announcement' | 'forum' | 'stage';
            topic?: string;
            parentId?: Id;
            nsfw?: boolean;
            position?: number;
            reason?: string;
        }): Async<{
            id: Id;
            name: string;
        }>;
        edit(channelId: Id, options: {
            name?: string;
            topic?: string;
            parentId?: Id | null;
            position?: number;
            slowmode?: number;
            reason?: string;
        }): Async<void>;
        delete(channelId: Id, reason?: string): Async<void>;
        /** Permission names in snake_case (view_channel, send_messages, …); Administrator is refused. */
        setPermissions(channelId: Id, targetId: Id, options: {
            allow?: string[];
            deny?: string[];
            reason?: string;
        }): Async<void>;
    };
    readonly role: {
        get(guildId: Id, roleId: Id): Async<RoleInfo>;
        list(guildId: Id): Async<RoleInfo[]>;
        create(guildId: Id, options: {
            name?: string;
            color?: string;
            hoist?: boolean;
            mentionable?: boolean;
            permissions?: string[];
            reason?: string;
        }): Async<RoleInfo>;
        edit(guildId: Id, roleId: Id, options: {
            name?: string;
            color?: string;
            hoist?: boolean;
            mentionable?: boolean;
            permissions?: string[];
            reason?: string;
        }): Async<RoleInfo>;
        delete(guildId: Id, roleId: Id, reason?: string): Async<void>;
        addToMember(guildId: Id, userId: Id, roleId: Id, reason?: string): Async<void>;
        removeFromMember(guildId: Id, userId: Id, roleId: Id, reason?: string): Async<void>;
    };
    readonly message: {
        get(channelId: Id, messageId: Id): Async<MessageInfo>;
        /** "discord.messages.send": returns the message ID. No pings, max. 5 per 5 s. */
        send(channelId: Id, message: Message | string): Async<Id>;
        /** "discord.messages.send": direct message to a user; returns the message ID. */
        dm(userId: Id, message: Message | string): Async<Id>;
        /** Only the bot's own messages. */
        edit(channelId: Id, messageId: Id, message: Message | string): Async<void>;
        delete(channelId: Id, messageId: Id): Async<void>;
        pin(channelId: Id, messageId: Id, reason?: string): Async<void>;
        unpin(channelId: Id, messageId: Id, reason?: string): Async<void>;
        react(channelId: Id, messageId: Id, emoji: string): Async<void>;
    };
    /**
     * "discord.interactions": answer a command (BlockInput.interaction) or a
     * click/select/modal (InteractionEvent.handle). The token stays in the bot.
     */
    readonly interaction: {
        reply(handle: string, message: Message | string, options?: {
            ephemeral?: boolean;
        }): Async<void>;
        editReply(handle: string, message: Message | string): Async<void>;
        deferReply(handle: string, options?: {
            ephemeral?: boolean;
        }): Async<void>;
        followUp(handle: string, message: Message | string, options?: {
            ephemeral?: boolean;
        }): Async<void>;
        /** Changes the message whose button/select was used. */
        update(handle: string, message: Message | string): Async<void>;
        /** Only before any other answer to the interaction. */
        showModal(handle: string, modal: Modal): Async<void>;
        respond(handle: string, payload?: Json): Async<void>;
    };
    /** "discord.emojis.manage": image as base64 (PNG/GIF/WEBP/JPEG, max. 256 KB). */
    readonly emoji: {
        create(guildId: Id, name: string, imageBase64: string, reason?: string): Async<{
            id: Id;
            name: string;
            animated: boolean;
        }>;
        delete(guildId: Id, emojiId: Id, reason?: string): Async<void>;
    };
    /** "economy": balances of the bot's Economy module (the same as /balance). */
    readonly economy: {
        get(guildId: Id, userId: Id): Async<number>;
        add(guildId: Id, userId: Id, amount: number): Async<number>;
        /** Fails with sdk.economy.not_enough instead of going below 0. */
        remove(guildId: Id, userId: Id, amount: number): Async<number>;
        transfer(guildId: Id, fromUserId: Id, toUserId: Id, amount: number): Async<void>;
        leaderboard(guildId: Id, limit?: number): Async<Array<{
            userId: Id;
            balance: number;
        }>>;
    };
    readonly commands: {
        register(definition: Record<string, Json>): Async<Id>;
        unregister(name: string): Async<void>;
        get(name: string): Async<Json>;
        list(): Async<Json[]>;
        isEnabled(name: string): Async<boolean>;
        getPermissions(name: string): Async<Json>;
        setPermissions(name: string, permissions: Record<string, Json>): Async<void>;
    };
    readonly permissions: Record<'check' | 'checkUser' | 'checkMember' | 'checkRole' | 'checkChannel' | 'require', (...args: Json[]) => Async<boolean>>;
    /** "modules.read": BotHub modules of this bot (read only). */
    readonly module: {
        get(key: string): Async<ModuleInfo>;
        getId(key: string): Async<string>;
        getName(key: string): Async<string>;
        isEnabled(key: string): Async<boolean>;
        getConfig(key: string): Async<Record<string, Json>>;
        list(): Async<ModuleInfo[]>;
    };
    readonly plugins: {
        get(id: string): Async<Json>;
        list(): Async<Json[]>;
        isInstalled(id: string): Async<boolean>;
        isEnabled(id: string): Async<boolean>;
        getAPI(id: string): Async<Json>;
        emit(id: string, event: string, payload?: Json): Async<void>;
    };
    readonly dashboard: Record<'registerPage' | 'registerSettings' | 'registerComponent' | 'registerMenuItem' | 'getRoute', (definition: Record<string, Json>) => Async<string>>;
    /**
     * "http.endpoints": an API endpoint the admin shared with this plugin and
     * that the manifest lists in "endpoints". The bot adds the auth header; the
     * secret never reaches the plugin. Response max. 1 MB, timeout 10 s.
     * "http.outbound" (high risk): https to the hosts in bothub.json
     * "services.hosts" only; private addresses are refused; max. 1 MB, 10 s.
     */
    readonly http: {
        get(url: string, options?: {
            query?: Record<string, string>;
            headers?: Record<string, string>;
        }): Async<HttpAnswer>;
        delete(url: string, options?: {
            query?: Record<string, string>;
            headers?: Record<string, string>;
        }): Async<HttpAnswer>;
        post(url: string, json?: Json, options?: {
            query?: Record<string, string>;
            headers?: Record<string, string>;
            body?: string;
        }): Async<HttpAnswer>;
        put(url: string, json?: Json, options?: {
            query?: Record<string, string>;
            headers?: Record<string, string>;
            body?: string;
        }): Async<HttpAnswer>;
        patch(url: string, json?: Json, options?: {
            query?: Record<string, string>;
            headers?: Record<string, string>;
            body?: string;
        }): Async<HttpAnswer>;
        endpoint(key: string, request?: {
            method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
            path?: string;
            query?: Record<string, string>;
            json?: Json;
            headers?: Record<string, string>;
        }): Async<{
            status: number;
            headers: Record<string, string>;
            json: Json;
            text: string;
        }>;
    };
    /** "discord.voice": play files of the plugin folder (sounds/<name>.ogg|mp3|wav). */
    readonly voice: {
        join(guildId: Id, channelId: Id): Async<void>;
        leave(guildId: Id): Async<void>;
        play(guildId: Id, file: string, options?: {
            volume?: number;
        }): Async<void>;
        stop(guildId: Id): Async<void>;
        state(guildId: Id): Async<{
            channelId: Id | null;
            playing: boolean;
            file: string | null;
        }>;
    };
    readonly secrets: {
        get(name: string): Async<string | null>;
        has(name: string): Async<boolean>;
    };
}
/** What a builder block of the plugin gets: its config and the run's variables. */
export interface BlockInput {
    /** Block config with placeholders already filled in. */
    config: Record<string, Json>;
    /** Variables of the run ({user.id} → vars['user.id']). */
    vars: Record<string, string>;
    /** Handle of the command or click that runs the graph (ctx.interaction.*), when there is one. */
    interaction?: string;
}
export interface BlockResult {
    /** Output port to continue at; default "next". */
    port?: string;
    /** Results stored under the block's variable: '' → {Var1}, '.count' → {Var1.count}. */
    results?: Record<string, string>;
}
export type BlockHandler = (ctx: PluginContext, input: BlockInput) => Promise<BlockResult | void> | BlockResult | void;
type Hook = (ctx: PluginContext) => Promise<void> | void;
export interface PluginDefinition {
    /** After the plugin file is loaded. */
    onLoad?: Hook;
    /** The plugin starts for a bot. */
    onEnable?: Hook;
    /** The plugin stops for a bot (switched off, bot stopped, update). */
    onDisable?: Hook;
    /** Last call before the process ends. */
    onUnload?: Hook;
    /** Handlers of the blocks in bothub-plugin.json "blocks", by name. */
    blocks?: Record<string, BlockHandler>;
    /** Discord events listed in the manifest "events" (permission "discord.events"); called like a block. */
    events?: Record<string, (ctx: PluginContext, payload: Record<string, Json>) => Promise<void> | void>;
    /** Tasks listed in the manifest "tasks" ({name, every} or {name, cron}, permission "scheduler"). */
    tasks?: Record<string, (ctx: PluginContext) => Promise<void> | void>;
    /** Buttons and selects of the plugin's messages, by key ("discord.interactions"). */
    components?: Record<string, (ctx: PluginContext, event: InteractionEvent) => Promise<void> | void>;
    /**
     * Inbound webhooks of bothub.json "services.webhooks" ("webhooks.inbound"):
     * payload = the JSON the caller sent (or its form field "payload").
     */
    webhooks?: Record<string, (ctx: PluginContext, payload: Record<string, Json>) => Promise<void> | void>;
    /** Modals of the plugin, by key ("discord.interactions"). */
    modals?: Record<string, (ctx: PluginContext, event: InteractionEvent) => Promise<void> | void>;
}
/** Marks the default export of a plugin (keeps types; no runtime logic). */
export declare function definePlugin(plugin: PluginDefinition): PluginDefinition;
/** Errors a plugin can throw on purpose; the key shows up in the bot log. */
export declare class PluginError extends Error {
    readonly key: string;
    constructor(key: string, message?: string);
}
export {};
