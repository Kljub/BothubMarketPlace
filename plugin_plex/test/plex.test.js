import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runTask, runWebhook } from '#sdk-testing';
import plugin from '../index.js';

const USER = '100000000000000001';
const GUILD = '200000000000000001';
const ROLE = '700000000000000007';
const NEWS = '900000000000000002';
const LIVE = '900000000000000003';
const POSTER = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const permissions = ['storage', 'storage.global', 'storage.files', 'discord.messages.send', 'scheduler', 'secrets.use', 'http.outbound', 'discord.interactions.reply', 'discord.roles.assign', 'webhooks.inbound'];
const vars = { 'user.id': USER, 'server.id': GUILD };

const MOVIES = [
  { ratingKey: '11', thumb: '/library/metadata/11/thumb/1700', title: 'Arrival', year: 2016, summary: 'Linguist meets aliens.', librarySectionID: 1, Genre: [{ tag: 'Sci-Fi' }], audienceRating: 8.1, duration: 6960000 },
  { ratingKey: '12', title: 'Heat', year: 1995, summary: 'Cops and robbers.', librarySectionID: 1, Genre: [{ tag: 'Crime' }] },
];

/** Fake Plex server and Overseerr, by handler for { method, path, query, json }. */
function servers(log = []) {
  return {
    PLEX_API: ({ path, query }) => {
      log.push(path);
      if (path === '/photo/:/transcode') return query.url === '/library/metadata/11/thumb/1700' ? { base64: POSTER, headers: { 'content-type': 'image/png' } } : { status: 404 };
      if (path === '/identity') return { json: { MediaContainer: { version: '1.40.0' } } };
      if (path === '/') return { json: { MediaContainer: { friendlyName: 'Home', machineIdentifier: 'm1', version: '1.40.0' } } };
      if (path === '/status/sessions') return { json: { MediaContainer: { Metadata: [{ title: 'Arrival', year: 2016, librarySectionID: 1, User: { title: 'ann' }, Player: { state: 'playing' } }, { title: 'Hidden', librarySectionID: 9 }] } } };
      if (path === '/library/sections') return { json: { MediaContainer: { Directory: [{ key: '1', title: 'Movies', type: 'movie' }, { key: '9', title: 'Private', type: 'movie' }] } } };
      if (path === '/library/sections/1/all' && query.title) return { json: { MediaContainer: { Metadata: MOVIES.filter((m) => m.title.toLowerCase().includes(query.title.toLowerCase())) } } };
      if (path === '/library/sections/1/all') return { json: { MediaContainer: { Metadata: query.genre ? MOVIES.filter((m) => m.Genre.some((g) => g.tag === query.genre)) : MOVIES } } };
      if (path === '/status/sessions/history/all') return { json: { MediaContainer: { Metadata: [{ User: { title: 'ann' }, Genre: [{ tag: 'Crime' }] }, { User: { title: 'ann' }, Genre: [{ tag: 'Crime' }] }] } } };
      return { status: 404 };
    },
    OVERSEERR_API: ({ method, path, json }) => {
      log.push(`${method} ${path}`);
      if (path === '/search') return { json: { results: [{ id: 603, mediaType: 'movie', title: 'The Matrix' }] } };
      if (path === '/user') return { json: { results: [{ id: 5, plexUsername: 'ann' }] } };
      if (path === '/request') return { json: { id: 77, body: json } };
      return { status: 404 };
    },
  };
}

// Addresses and keys are admin secrets; the fake servers sit at the hosts of the addresses.
const PLEX = 'http://plex.local:32400';
const PLEX2 = 'http://plex2.local:32400';
const OVERSEERR = 'http://overseerr.local:5055/api/v1';
const MANIFEST = { id: 'plugin_plex', secrets: ['PLEX_URL', 'PLEX_TOKEN', 'PLEX_URL_2', 'PLEX_TOKEN_2', 'PLEX_URL_3', 'PLEX_TOKEN_3', 'OVERSEERR_URL', 'OVERSEERR_KEY'] };
const SECRETS = { PLEX_URL: PLEX, PLEX_TOKEN: 'plex-token-1', OVERSEERR_URL: OVERSEERR, OVERSEERR_KEY: 'overseerr-key-1' };

/** A fake server written for { method, path, query, json } behind an address. */
const at = (base, fn) => (req) => {
  const u = new URL(req.url);
  const prefix = new URL(base).pathname.replace(/\/$/, '');
  return fn({ method: req.method, path: u.pathname.slice(prefix.length) || '/', query: req.query, json: req.json, headers: req.headers });
};
function serverWeb(log = [], second) {
  const s = servers(log);
  return { 'plex.local': at(PLEX, s.PLEX_API), 'overseerr.local': at(OVERSEERR, s.OVERSEERR_API), ...(second ? { 'plex2.local': at(PLEX2, second) } : {}) };
}

/** plex.tv: a PIN that is confirmed after the first poll. */
function plexTv(state = { confirmed: false }) {
  return {
    'plex.tv': ({ method, url, headers }) => {
      if (method === 'POST' && url.endsWith('/pins')) return { json: { id: 4242, code: 'ABCD' } };
      if (url.includes('/pins/4242')) return { json: { id: 4242, authToken: state.confirmed ? 'secret-user-token' : null } };
      if (url.endsWith('/user')) return headers['X-Plex-Token'] === 'secret-user-token' ? { json: { username: 'ann', uuid: 'u-1', email: 'ann@example.com' } } : { status: 401 };
      return { status: 404 };
    },
  };
}

function setup(config = {}, extra = {}) {
  const log = [];
  const ctx = createTestContext({
    id: 'plugin_plex', permissions, secrets: SECRETS, web: { ...plexTv(extra.pin), ...serverWeb(log) }, manifest: MANIFEST,
    config: { libraries: '1', linked_role: { id: ROLE, guild: GUILD }, new_content_channel: { id: NEWS, guild: GUILD }, live_channel: { id: LIVE, guild: GUILD }, announce_plays: true, overseerr: true, ...config },
  });
  return { ctx, log };
}

async function linked(ctx, pin) {
  await runBlock(plugin, 'link', ctx, { vars });
  pin.confirmed = true;
  await runTask(plugin, 'link_poll', ctx);
}

test('status and now playing only show shared libraries', async () => {
  const { ctx } = setup();
  const st = await runBlock(plugin, 'status', ctx, { vars });
  assert.equal(st.port, 'online');
  assert.deepEqual([st.results['.version'], st.results['.playing'], st.results['.linked']], ['1.40.0', '1', 'Not linked (/plex-link)']);
  const np = await runBlock(plugin, 'now_playing', ctx);
  assert.equal(np.results['.count'], '1');
  assert.doesNotMatch(np.results[''], /Hidden/);
});

test('search as a command: the answer carries the poster, loaded through the bot', async () => {
  const { ctx } = setup();
  const hit = await runBlock(plugin, 'search', ctx, { vars, interaction: 'cmd', config: { title: 'arrival' } });
  assert.equal(hit.port, 'replied');
  const answer = ctx.answers.at(-1);
  assert.equal(answer.message.embeds[0].title, '🔍 Arrival');
  assert.equal(answer.message.embeds[0].thumbnail_url, 'attachment');
  assert.ok(answer.file, 'the poster goes with the answer');
  const heat = await runBlock(plugin, 'search', ctx, { vars, interaction: 'cmd2', config: { title: 'heat' } });
  assert.equal(heat.port, 'replied');
  assert.equal(ctx.answers.at(-1).message.embeds[0].thumbnail_url, undefined, 'no poster: no image');
});

test('search finds in shared libraries, the token never leaves the bot', async () => {
  const { ctx } = setup();
  const hit = await runBlock(plugin, 'search', ctx, { config: { title: 'arrival' } });
  assert.equal(hit.port, 'found');
  assert.deepEqual([hit.results[''], hit.results['.duration'], hit.results['.genres']], ['Arrival', '116 min', 'Sci-Fi']);
  assert.equal((await runBlock(plugin, 'search', ctx, { config: { title: 'zzz' } })).port, 'not_found');
  // The bot adds the token to the request; nothing the plugin returns contains it.
  assert.equal(ctx.requests[0].headers['X-Plex-Token'], 'plex-token-1');
  assert.ok(!JSON.stringify(hit.results).includes('plex-token-1'));
});

test('random: answers itself with an "Again" button; the button picks another title', async () => {
  const { ctx } = setup();
  const out = await runBlock(plugin, 'random', ctx, { interaction: 'cmd-1' });
  assert.equal(out.port, 'replied');
  const first = ctx.answers[0];
  assert.equal(first.kind, 'reply');
  const button = first.message.components[0][0];
  assert.equal(button.key, 'reroll');

  await runComponent(plugin, 'reroll', ctx, { data: button.data, handle: 'click-1' });
  const update = ctx.answers.at(-1);
  assert.equal(update.kind, 'update');
  assert.notEqual(update.message.embeds[0].title, first.message.embeds[0].title, 'another title than before');

  await runComponent(plugin, 'reroll', ctx, { data: 'gone', handle: 'click-2' });
  assert.equal(ctx.answers.at(-1).ephemeral, true);

  const noLibs = setup({ libraries: '' }).ctx;
  assert.equal((await runBlock(plugin, 'random', noLibs, {})).port, 'failed');
});

test('link: plex.tv login, role and DM after the poll; unlink takes the role', async () => {
  const pin = { confirmed: false };
  const { ctx } = setup({}, { pin });
  const started = await runBlock(plugin, 'link', ctx, { vars });
  assert.deepEqual([started.results[''], started.results['.code']], ['https://plex.tv/link', 'ABCD']);

  await runTask(plugin, 'link_poll', ctx);
  assert.equal(ctx.actions.length, 0, 'not confirmed yet');

  pin.confirmed = true;
  await runTask(plugin, 'link_poll', ctx);
  assert.deepEqual(ctx.actions.map((a) => [a.call, a.args.slice(0, 3)]), [['role.addToMember', [GUILD, USER, ROLE]]]);
  assert.equal(ctx.sent.at(-1).channelId, `dm:${USER}`);
  assert.ok(![...ctx.store.values()].some((v) => v.includes('secret-user-token')), 'the member token is not stored');
  assert.equal((await runBlock(plugin, 'link', ctx, { vars })).port, 'already');

  const gone = await runBlock(plugin, 'unlink_account', ctx, { vars });
  assert.equal(gone.results[''], 'ann');
  assert.equal(ctx.actions.at(-1).call, 'role.removeFromMember');
  assert.equal((await runBlock(plugin, 'unlink_account', ctx, { vars })).port, 'not_linked');
});

test('recommend and request need a link; request DMs through the Overseerr webhook', async () => {
  const pin = { confirmed: false };
  const { ctx, log } = setup({}, { pin });
  assert.equal((await runBlock(plugin, 'recommend', ctx, { vars })).port, 'not_linked');
  assert.equal((await runBlock(plugin, 'request', ctx, { vars, config: { title: 'matrix' } })).port, 'not_linked');
  await linked(ctx, pin);

  const rec = await runBlock(plugin, 'recommend', ctx, { vars });
  assert.deepEqual([rec.results[''], rec.results['.genre']], ['Heat', 'Crime']);

  const req = await runBlock(plugin, 'request', ctx, { vars, config: { title: 'matrix' } });
  assert.deepEqual([req.port, req.results['']], ['next', 'The Matrix']);
  assert.ok(log.includes('POST /request'));
  assert.deepEqual(ctx.requests.at(-1).json, { mediaType: 'movie', mediaId: 603, userId: 5 });

  const before = ctx.sent.length;
  await runWebhook(plugin, 'overseerr', ctx, { notification_type: 'MEDIA_AVAILABLE', subject: 'The Matrix', request: { request_id: 77 } });
  assert.equal(ctx.sent.length, before + 1);
  assert.deepEqual([ctx.sent.at(-1).channelId, ctx.sent.at(-1).message], [`dm:${USER}`, '🎬 Your Plex request **The Matrix** is available now!']);

  const off = setup({ overseerr: false }).ctx;
  assert.equal((await runBlock(plugin, 'request', off, { vars, config: { title: 'matrix' } })).port, 'not_configured');
});

test('Plex webhook: new titles and playbacks of linked members, shared libraries only', async () => {
  const pin = { confirmed: false };
  const { ctx } = setup({}, { pin });
  await linked(ctx, pin);
  const sent = ctx.sent.length;
  await runWebhook(plugin, 'media', ctx, { event: 'library.new', Metadata: { title: 'Dune', year: 2021, librarySectionID: 1, librarySectionTitle: 'Movies' } });
  await runWebhook(plugin, 'media', ctx, { event: 'library.new', Metadata: { title: 'Secret', librarySectionID: 9 } });
  await runWebhook(plugin, 'media', ctx, { event: 'media.play', Account: { title: 'ann' }, Metadata: { title: 'Dune', librarySectionID: 1 } });
  await runWebhook(plugin, 'media', ctx, { event: 'media.play', Account: { title: 'bob' }, Metadata: { title: 'Dune', librarySectionID: 1 } });
  const posts = ctx.sent.slice(sent);
  assert.deepEqual(posts.map((p) => p.channelId), [NEWS, LIVE]);
  assert.equal(posts[0].message.embeds[0].title, '🆕 Dune (2021)');
  assert.match(posts[1].message.embeds[0].description, new RegExp(`<@${USER}> is watching \\*\\*Dune\\*\\*`));
});

// A second server (secrets PLEX_URL_2 + PLEX_TOKEN_2): its libraries are "2:<id>".
test('several Plex servers: search, libraries and webhooks per server', async () => {
  const log = [];
  const second = ({ path, query }) => {
    log.push(`2 ${path}`);
    if (path === '/') return { json: { MediaContainer: { friendlyName: 'Family', machineIdentifier: 'm2', version: '1.41.0' } } };
    if (path === '/library/sections') return { json: { MediaContainer: { Directory: [{ key: '3', title: 'Anime', type: 'show' }] } } };
    if (path === '/library/sections/3/all') return { json: { MediaContainer: { Metadata: [{ ratingKey: '5', title: 'Frieren', year: 2023, librarySectionID: 3 }] } } };
    if (path === '/status/sessions') return { json: { MediaContainer: { Metadata: [{ title: 'Frieren', librarySectionID: 3, User: { title: 'bob' }, Player: { state: 'playing' } }] } } };
    return { status: 404 };
  };
  const ctx = createTestContext({
    id: 'plugin_plex', permissions, secrets: { ...SECRETS, PLEX_URL_2: PLEX2, PLEX_TOKEN_2: 'plex-token-2' }, web: { ...plexTv(), ...serverWeb(log, second) },
    manifest: MANIFEST,
    config: { libraries: ['1:1', '2:3'], new_content_channel: { id: NEWS, guild: GUILD } },
    settings: { fields: [{ key: 'libraries', type: 'choices', dynamic: true }] },
  });
  // The settings dropdown: every library as "Server:Library".
  await plugin.onEnable(ctx);
  // Every library is offered, also ones not picked yet (Private).
  assert.deepEqual(ctx.fieldOptions.libraries.map((o) => o.label), ['Home:Movies', 'Home:Private', 'Family:Anime']);
  assert.equal(ctx.fieldOptions.libraries.find((o) => o.label === 'Family:Anime').value, '2:3');
  const found = await runBlock(plugin, 'search', ctx, { config: { title: 'frieren' } });
  assert.equal(found.port, 'found');
  assert.equal(found.results['.key'], '2:5');

  const libs = await runBlock(plugin, 'libraries', ctx);
  assert.match(libs.results[''], /Anime\*\* \(show\) · Family · ID `2:3`/);
  assert.match(libs.results[''], /Movies\*\* \(movie\) · Home · ID `1`/);

  const st = await runBlock(plugin, 'status', ctx, { vars });
  assert.equal(st.port, 'online');
  assert.equal(st.results['.playing'], '2', 'sessions of both servers');
  assert.match(st.results['.servers'], /Home[\s\S]*Family/);

  // Library 3 exists on both servers: only the second one is shared.
  await runWebhook(plugin, 'media', ctx, { event: 'library.new', Server: { uuid: 'm1' }, Metadata: { title: 'Wrong', librarySectionID: 3 } });
  await runWebhook(plugin, 'media', ctx, { event: 'library.new', Server: { uuid: 'm2' }, Metadata: { title: 'Frieren 2', librarySectionID: 3 } });
  assert.deepEqual(ctx.sent.map((m) => m.message.embeds[0].title), ['🆕 Frieren 2']);
});

test('watchlist: list, add and remove with the member token from /plex-link', async () => {
  const pin = { confirmed: false };
  const listed = [{ ratingKey: 'w1', title: 'Heat', year: 1995, type: 'movie' }];
  const calls = [];
  const web = {
    ...plexTv(pin),
    'discover.provider.plex.tv': ({ method, url, headers }) => {
      calls.push(`${method} ${url.replace('https://discover.provider.plex.tv', '')}`);
      if (headers['X-Plex-Token'] !== 'secret-user-token') return { status: 401 };
      if (url.includes('/library/sections/watchlist/all')) return { json: { MediaContainer: { Metadata: listed } } };
      if (url.includes('/library/search')) return { json: { MediaContainer: { SearchResults: [{ SearchResult: [{ Metadata: { ratingKey: 'm9', title: 'The Matrix', year: 1999, type: 'movie' } }] }] } } };
      if (url.includes('/actions/addToWatchlist?ratingKey=m9')) { listed.push({ ratingKey: 'm9', title: 'The Matrix', year: 1999, type: 'movie' }); return { json: {} }; }
      if (url.includes('/actions/removeFromWatchlist?ratingKey=w1')) { listed.splice(0, 1); return { json: {} }; }
      return { status: 404 };
    },
  };
  const ctx = createTestContext({ id: 'plugin_plex', permissions, secrets: SECRETS, web: { ...web, ...serverWeb() }, manifest: MANIFEST, config: { libraries: '1' } });
  assert.equal((await runBlock(plugin, 'watchlist', ctx, { vars })).port, 'not_linked');
  await linked(ctx, pin);
  assert.equal(ctx.globalStore.get(`tok:${USER}`), 'secret-user-token', 'token kept in the global storage');

  const list = await runBlock(plugin, 'watchlist', ctx, { vars });
  assert.equal(list.results['.count'], '1');
  assert.match(list.results[''], /Heat\*\* \(1995\)/);
  const added = await runBlock(plugin, 'watchlist_add', ctx, { vars, config: { title: 'the matrix' } });
  assert.deepEqual([added.port, added.results['']], ['added', 'The Matrix']);
  const removed = await runBlock(plugin, 'watchlist_remove', ctx, { vars, config: { title: 'heat' } });
  assert.deepEqual([removed.port, removed.results['']], ['removed', 'Heat']);
  assert.equal((await runBlock(plugin, 'watchlist_remove', ctx, { vars, config: { title: 'nope' } })).port, 'not_listed');
  assert.ok(calls.some((c) => c.startsWith('PUT /actions/addToWatchlist')));

  await runBlock(plugin, 'unlink_account', ctx, { vars });
  assert.equal(ctx.globalStore.get(`tok:${USER}`), undefined, '/plex-unlink deletes the token');
});

test('links made before 1.2.0 (per bot) move to the global storage', async () => {
  const ctx = createTestContext({ id: 'plugin_plex', permissions, secrets: SECRETS, web: { ...plexTv(), ...serverWeb() }, manifest: MANIFEST, config: { libraries: '1' },
    storage: { [`acc:${USER}`]: JSON.stringify({ username: 'ann', uuid: 'u-1' }), 'plexname:ann': USER } });
  const st = await runBlock(plugin, 'status', ctx, { vars });
  assert.equal(st.results['.linked'], 'Linked as ann');
  assert.ok(ctx.globalStore.has(`acc:${USER}`) && !ctx.store.has(`acc:${USER}`));
  assert.equal((await runBlock(plugin, 'watchlist', ctx, { vars })).port, 'not_linked', 'no token yet: link again');
});

test('plex-play: songs, albums and playlists go into the music queue with the token as a secret', async () => {
  const MUSIC = { ratingKey: '50', title: 'Get Lucky', grandparentTitle: 'Daft Punk', parentTitle: 'Random Access Memories', librarySectionID: 3, duration: 369000, Media: [{ Part: [{ key: '/library/parts/501/1700000000/file.flac' }] }] };
  const ALBUM = { ratingKey: '60', title: 'Random Access Memories', parentTitle: 'Daft Punk', librarySectionID: 3 };
  const HIDDEN = { ...MUSIC, ratingKey: '51', title: 'Private Song', librarySectionID: 9 };
  const music = ({ path, query }) => {
    if (path === '/hubs/search') {
      // Like Plex: only titles that match the term (the album test searches the album).
      const q = query.query === 'album test' ? 'random access' : query.query.toLowerCase();
      const match = (list) => list.filter((m) => m.title.toLowerCase().includes(q));
      return { json: { MediaContainer: { Hub: [
        { type: 'track', Metadata: match([MUSIC, HIDDEN]) },
        { type: 'album', Metadata: match([ALBUM]) },
        { type: 'movie', Metadata: match(MOVIES) },
        { type: 'playlist', Metadata: match([{ ratingKey: '70', title: 'Road Trip', playlistType: 'audio' }, { ratingKey: '71', title: 'Movie night', playlistType: 'video' }]) },
      ] } } };
    }
    if (path === '/library/metadata/60/children') return { json: { MediaContainer: { Metadata: [MUSIC, { ...MUSIC, ratingKey: '52', title: 'Instant Crush', Media: [{ Part: [{ key: '/library/parts/502/1/file.flac' }] }] }] } } };
    if (path === '/playlists/70/items') return { json: { MediaContainer: { Metadata: [MUSIC] } } };
    return servers().PLEX_API({ path, query });
  };
  const ctx = createTestContext({ id: 'plugin_plex', permissions: [...permissions, 'modules.music.queue'], secrets: SECRETS, web: { 'plex.local': at(PLEX, music) }, manifest: MANIFEST, config: { libraries: ['1:1', '1:3'] } });
  // A song: the stream path and the token secret, never the token itself.
  let out = await runBlock(plugin, 'play', ctx, { config: { query: 'get lucky', kind: 'any' }, vars: { ...vars, 'channel.id': '300000000000000001' }, interaction: 'cmd-1' });
  assert.equal(out.port, 'replied');
  assert.deepEqual(ctx.queued[0], {
    guildId: GUILD, title: 'Daft Punk - Get Lucky', author: 'Daft Punk', duration: 369,
    source: { url: 'PLEX_URL', path: '/library/parts/501/1700000000/file.flac', auth: { secret: 'PLEX_TOKEN', header: 'X-Plex-Token', format: 'plain' } },
  });
  assert.ok(!JSON.stringify(ctx.queued).includes('plex-token-1'), 'the plugin never handles the token');
  assert.deepEqual(ctx.joined, [USER], "joins the member's voice channel");
  assert.match(ctx.answers.at(-1).message, /🎵 Song: \*\*Get Lucky\*\* · Daft Punk/);
  // An album: all its songs.
  out = await runBlock(plugin, 'play', ctx, { config: { query: 'album test', kind: 'album' }, vars, interaction: 'cmd-2' });
  assert.equal(out.results['.count'], '2');
  assert.match(ctx.answers.at(-1).message, /💿 Album: \*\*Random Access Memories\*\*.*\(2 songs\)/);
  // Audio playlists only; songs of libraries that are not shared stay hidden.
  out = await runBlock(plugin, 'play', ctx, { config: { query: 'road', kind: 'playlist' }, vars });
  assert.equal(out.port, 'next');
  out = await runBlock(plugin, 'play', ctx, { config: { query: 'movie night', kind: 'playlist' }, vars });
  assert.equal(out.port, 'not_found', 'video playlists are no music');
  out = await runBlock(plugin, 'play', ctx, { config: { query: 'Private Song', kind: 'track' }, vars });
  assert.equal(out.port, 'not_found', 'library 9 is not shared');
});
