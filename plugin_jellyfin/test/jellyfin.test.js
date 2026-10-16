import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runTask, runWebhook } from '#sdk-testing';
import plugin from '../index.js';
import manifest from '../bothub.json' with { type: 'json' };
import { webhookTitle } from '../services/webhooks.js';

const USER = '100000000000000001';
const GUILD = '200000000000000001';
const ROLE = '700000000000000007';
const NEWS = '900000000000000002';
const LIVE = '900000000000000003';
const POSTER = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const vars = { 'user.id': USER, 'server.id': GUILD, 'channel.id': '300000000000000001' };

const id = (c) => c.repeat(32);
const MOVIES_LIB = id('1');
const PRIVATE_LIB = id('9');
const MUSIC_LIB = id('8');
const ARRIVAL = id('a');
const HEAT = id('b');
const HIDDEN = id('c');
const ALBUM = id('d');
const SONG1 = id('e');
const SONG2 = id('f');
const ANN = '0123456789abcdef0123456789abcdef';
const SERVER_ID = '5'.repeat(32);

const MOVIES = [
  { Id: ARRIVAL, Name: 'Arrival', Type: 'Movie', ProductionYear: 2016, Overview: 'Linguist meets aliens.', Genres: ['Sci-Fi'], CommunityRating: 7.94, RunTimeTicks: 69_600_000_000 },
  { Id: HEAT, Name: 'Heat', Type: 'Movie', ProductionYear: 1995, Overview: 'Cops and robbers.', Genres: ['Crime'] },
];
const SONGS = [
  { Id: SONG1, Name: 'Get Lucky', Type: 'Audio', AlbumArtist: 'Daft Punk', RunTimeTicks: 3_690_000_000 },
  { Id: SONG2, Name: 'Instant Crush', Type: 'Audio', AlbumArtist: 'Daft Punk', RunTimeTicks: 3_370_000_000 },
];

/** A fake Jellyfin (key "jf-key-1" as query ApiKey) and Jellyseerr. */
function fakes(state, log) {
  const jelly = (req) => {
    const u = new URL(req.url);
    const path = u.pathname;
    const q = req.query;
    log.push(`${req.method ?? 'GET'} ${path}`);
    if (path === '/Sessions/Logout') {
      state.loggedOut = q.ApiKey;
      return { status: 204 };
    }
    if (q.ApiKey !== 'jf-key-1') return { status: 401 };
    if (path === '/System/Info') return { json: { ServerName: 'Home', Version: '10.11.2', Id: SERVER_ID } };
    if (path === '/Library/VirtualFolders') return { json: [{ Name: 'Movies', ItemId: MOVIES_LIB, CollectionType: 'movies', Locations: ['/media/movies'] }, { Name: 'Private', ItemId: PRIVATE_LIB, CollectionType: 'movies', Locations: ['/media/movies-private'] }, { Name: 'Music', ItemId: MUSIC_LIB, CollectionType: 'music', Locations: ['D:\\Music\\'] }] };
    if (path === '/Sessions') return { json: [{ UserName: 'ann', NowPlayingItem: { Id: ARRIVAL, Name: 'Arrival', Type: 'Movie', ProductionYear: 2016 }, PlayState: { IsPaused: false } }, { UserName: 'bob', NowPlayingItem: { Id: HIDDEN, Name: 'Hidden', Type: 'Movie' } }, { UserName: 'idle' }] };
    if (path === '/Items' && q.ids) {
      // Like Jellyfin: the file path; "movies-private" must not count as "movies".
      const where = q.ids === HIDDEN ? '/media/movies-private/Hidden.mkv' : [SONG1, SONG2, ALBUM].includes(q.ids) ? 'D:\\Music\\Daft Punk\\song.flac' : `/media/movies/${q.ids}.mkv`;
      return { json: { Items: [{ Id: q.ids, Path: where }] } };
    }
    const img = /^\/Items\/([0-9a-f]{32})\/Images\/Primary$/.exec(path);
    if (img) return img[1] === ARRIVAL ? { base64: POSTER, headers: { 'content-type': 'image/png' } } : { status: 404 };
    if (path === '/QuickConnect/Initiate') return state.qcOff ? { status: 401 } : { json: { Secret: 'qc-secret', Code: '123456', Authenticated: false } };
    if (path === '/QuickConnect/Connect') return q.secret === 'qc-secret' ? { json: { Authenticated: state.approved, Code: '123456' } } : { status: 404 };
    if (path === '/Users/AuthenticateWithQuickConnect') return req.json?.Secret === 'qc-secret' ? { json: { User: { Id: ANN, Name: 'ann' }, AccessToken: 'member-session-token' } } : { status: 400 };
    const favItem = /^\/UserFavoriteItems\/([0-9a-f]{32})$/.exec(path);
    if (favItem && q.userId === ANN) {
      if (req.method === 'POST') state.favs.add(favItem[1]);
      if (req.method === 'DELETE') state.favs.delete(favItem[1]);
      return { json: { IsFavorite: req.method === 'POST' } };
    }
    if (path === '/Artists') return { json: { Items: [] } };
    if (path.startsWith('/Playlists/')) return { json: { Items: [SONGS[0]] } };
    if (path === '/Items') {
      if (q.isFavorite === 'true') return { json: { Items: MOVIES.filter((m) => state.favs.has(m.Id)) } };
      if (q.isPlayed === 'true') return { json: { Items: [{ Genres: ['Crime'] }, { Genres: ['Crime'] }, { Genres: ['Sci-Fi'] }] } };
      if (q.includeItemTypes === 'Playlist') return { json: { Items: String(q.searchTerm).toLowerCase().includes('road') ? [{ Id: id('6'), Name: 'Road Trip', Type: 'Playlist' }] : [] } };
      if (q.parentId === ALBUM) return { json: { Items: SONGS } };
      if (q.parentId === MUSIC_LIB) {
        const term = String(q.searchTerm ?? '').toLowerCase();
        const all = [...SONGS, { Id: ALBUM, Name: 'Random Access Memories', Type: 'MusicAlbum', AlbumArtist: 'Daft Punk' }];
        return { json: { Items: all.filter((m) => m.Name.toLowerCase().includes(term)) } };
      }
      if (q.parentId === MOVIES_LIB) {
        let list = MOVIES;
        if (q.searchTerm) list = list.filter((m) => m.Name.toLowerCase().includes(String(q.searchTerm).toLowerCase()));
        if (q.genres) list = list.filter((m) => m.Genres.includes(q.genres));
        if (q.isPlayed === 'false' && q.userId === ANN) list = list.filter((m) => m.Id !== ARRIVAL);
        return { json: { Items: list } };
      }
      if (q.parentId === PRIVATE_LIB) return { json: { Items: [{ Id: HIDDEN, Name: 'Hidden', Type: 'Movie' }] } };
      return { json: { Items: [] } };
    }
    return { status: 404 };
  };
  const seerr = (req) => {
    const path = new URL(req.url).pathname.replace('/api/v1', '');
    log.push(`${req.method} seerr${path}`);
    if (req.headers['X-Api-Key'] !== 'seerr-key') return { status: 401 };
    if (path === '/search') return { json: { results: [{ id: 603, mediaType: 'movie', title: 'The Matrix' }] } };
    if (path === '/user') return { json: { results: [{ id: 4, jellyfinUserId: 'other' }, { id: 5, jellyfinUserId: ANN }] } };
    if (path === '/request') return { json: { id: 77 } };
    return { status: 404 };
  };
  return { 'jelly.local': jelly, 'seerr.local': seerr };
}

function setup(config = {}, extraSecrets = {}) {
  const state = { approved: false, favs: new Set([HEAT]), qcOff: false };
  const log = [];
  const ctx = createTestContext({
    id: 'plugin_jellyfin', permissions: manifest.sdk.permissions, manifest: { id: 'plugin_jellyfin', secrets: manifest.services.secrets },
    secrets: { JELLYFIN_URL: 'http://jelly.local:8096', JELLYFIN_KEY: 'jf-key-1', JELLYSEERR_URL: 'http://seerr.local:5055/api/v1', JELLYSEERR_KEY: 'seerr-key', ...extraSecrets },
    web: fakes(state, log),
    config: { libraries: [`1:${MOVIES_LIB}`, `1:${MUSIC_LIB}`], linked_role: { id: ROLE, guild: GUILD }, new_content_channel: { id: NEWS, guild: GUILD }, live_channel: { id: LIVE, guild: GUILD }, announce_plays: true, jellyseerr: true, ...config },
    settings: { fields: [{ key: 'libraries', type: 'choices', dynamic: true }] },
  });
  return { ctx, state, log };
}

async function linked(ctx, state) {
  await runBlock(plugin, 'link', ctx, { vars });
  state.approved = true;
  await runTask(plugin, 'link_poll', ctx);
}

test('status and now playing only show shared libraries', async () => {
  const { ctx } = setup();
  const st = await runBlock(plugin, 'status', ctx, { vars });
  assert.equal(st.port, 'online');
  assert.deepEqual([st.results['.version'], st.results['.playing'], st.results['.linked'], st.results['.libraries']], ['10.11.2', '1', 'Not linked (/jellyfin-link)', '2']);
  const np = await runBlock(plugin, 'now_playing', ctx);
  assert.equal(np.results['.count'], '1');
  assert.match(np.results[''], /▶️ \*\*Arrival\*\* \(2016\) · ann/);
  assert.doesNotMatch(np.results[''], /Hidden/);
  const bad = await runBlock(plugin, 'status', setup({}, { JELLYFIN_KEY: 'wrong' }).ctx, { vars });
  assert.equal(bad.port, 'offline');
  assert.match(bad.results[''], /refused the API key/);
});

test('library list for the settings; libraries block with IDs', async () => {
  const { ctx } = setup();
  await plugin.onEnable(ctx);
  assert.deepEqual(ctx.fieldOptions.libraries.map((o) => o.label), ['Home:Movies', 'Home:Private', 'Home:Music']);
  assert.equal(ctx.fieldOptions.libraries[0].value, `1:${MOVIES_LIB}`);
  const libs = await runBlock(plugin, 'libraries', ctx);
  assert.match(libs.results[''], new RegExp(`✅ \\*\\*Movies\\*\\* \\(movies\\) · ID \`${MOVIES_LIB}\``));
  assert.match(libs.results[''], /➖ \*\*Private\*\*/);
});

test('search: the answer carries the poster, the key never leaves the bot', async () => {
  const { ctx } = setup();
  await plugin.onEnable(ctx);
  const hit = await runBlock(plugin, 'search', ctx, { vars, interaction: 'cmd', config: { title: 'arrival' } });
  assert.equal(hit.port, 'replied');
  assert.deepEqual([hit.results[''], hit.results['.duration'], hit.results['.rating'], hit.results['.library']], ['Arrival', '116 min', '7.9', 'Movies']);
  const answer = ctx.answers.at(-1);
  assert.equal(answer.message.embeds[0].thumbnail_url, 'attachment');
  assert.ok(answer.file, 'the poster goes with the answer');
  await runBlock(plugin, 'search', ctx, { vars, interaction: 'cmd2', config: { title: 'heat' } });
  assert.equal(ctx.answers.at(-1).message.embeds[0].thumbnail_url, undefined, 'no poster: no image');
  assert.equal((await runBlock(plugin, 'search', ctx, { config: { title: 'hidden' } })).port, 'not_found', 'private library');
  assert.equal(ctx.requests.find((r) => r.url.includes('/Items')).query.ApiKey, 'jf-key-1', 'the bot adds the key');
  assert.ok(!JSON.stringify(hit.results).includes('jf-key-1'));
});

test('random: answers itself with an "Again" button; the button picks another title', async () => {
  const { ctx } = setup({ libraries: [`1:${MOVIES_LIB}`] });
  const out = await runBlock(plugin, 'random', ctx, { interaction: 'cmd-1' });
  assert.equal(out.port, 'replied');
  const first = ctx.answers[0];
  const button = first.message.components[0][0];
  assert.equal(button.key, 'reroll');
  await runComponent(plugin, 'reroll', ctx, { data: button.data, handle: 'click-1' });
  const update = ctx.answers.at(-1);
  assert.equal(update.kind, 'update');
  assert.notEqual(update.message.embeds[0].title, first.message.embeds[0].title, 'another title than before');
  await runComponent(plugin, 'reroll', ctx, { data: 'gone', handle: 'click-2' });
  assert.equal(ctx.answers.at(-1).ephemeral, true);
  assert.equal((await runBlock(plugin, 'random', setup({ libraries: [] }).ctx, {})).port, 'failed');
});

test('link: Quick Connect code, role and DM after the poll, session logged out; unlink takes the role', async () => {
  const { ctx, state } = setup();
  const started = await runBlock(plugin, 'link', ctx, { vars });
  assert.deepEqual([started.results[''], started.results['.code']], ['Home', '123456']);
  await runTask(plugin, 'link_poll', ctx);
  assert.equal(ctx.actions.length, 0, 'not approved yet');
  state.approved = true;
  await runTask(plugin, 'link_poll', ctx);
  assert.deepEqual(ctx.actions.map((a) => [a.call, a.args.slice(0, 3)]), [['role.addToMember', [GUILD, USER, ROLE]]]);
  assert.equal(ctx.sent.at(-1).channelId, `dm:${USER}`);
  assert.match(ctx.sent.at(-1).message, /Jellyfin account \*\*ann\*\* is linked/);
  assert.equal(state.loggedOut, 'member-session-token', 'the Quick Connect session is logged out');
  assert.ok(![...ctx.store.values(), ...ctx.globalStore.values()].some((v) => v.includes('member-session-token')), 'no member token is kept');
  assert.deepEqual(JSON.parse(ctx.globalStore.get(`acc:${USER}`)).userId, ANN);
  assert.equal((await runBlock(plugin, 'link', ctx, { vars })).port, 'already');
  const gone = await runBlock(plugin, 'unlink_account', ctx, { vars });
  assert.equal(gone.results[''], 'ann');
  assert.equal(ctx.actions.at(-1).call, 'role.removeFromMember');
  assert.equal((await runBlock(plugin, 'unlink_account', ctx, { vars })).port, 'not_linked');
});

test('link: Quick Connect switched off on the server', async () => {
  const { ctx, state } = setup();
  state.qcOff = true;
  await assert.rejects(runBlock(plugin, 'link', ctx, { vars }), /Quick Connect is off/);
});

test('recommend and request need a link; request DMs through the Jellyseerr webhook', async () => {
  const { ctx, state, log } = setup({ libraries: [`1:${MOVIES_LIB}`] });
  assert.equal((await runBlock(plugin, 'recommend', ctx, { vars })).port, 'not_linked');
  assert.equal((await runBlock(plugin, 'request', ctx, { vars, config: { title: 'matrix' } })).port, 'not_linked');
  await linked(ctx, state);
  const rec = await runBlock(plugin, 'recommend', ctx, { vars });
  assert.deepEqual([rec.results[''], rec.results['.genre']], ['Heat', 'Crime']);
  const req = await runBlock(plugin, 'request', ctx, { vars, config: { title: 'matrix' } });
  assert.deepEqual([req.port, req.results['']], ['next', 'The Matrix']);
  assert.ok(log.includes('POST seerr/request'));
  assert.deepEqual(ctx.requests.at(-1).json, { mediaType: 'movie', mediaId: 603, userId: 5 });
  const before = ctx.sent.length;
  await runWebhook(plugin, 'jellyseerr', ctx, { notification_type: 'MEDIA_AVAILABLE', subject: 'The Matrix', request: { request_id: 77 } });
  assert.equal(ctx.sent.length, before + 1);
  assert.deepEqual([ctx.sent.at(-1).channelId, ctx.sent.at(-1).message], [`dm:${USER}`, '🎬 Your Jellyfin request **The Matrix** is available now!']);
  assert.equal((await runBlock(plugin, 'request', setup({ jellyseerr: false }).ctx, { vars, config: { title: 'matrix' } })).port, 'not_configured');
});

test('Jellyfin webhook: new titles and playbacks of linked members, shared libraries only', async () => {
  const { ctx, state } = setup();
  await linked(ctx, state);
  const sent = ctx.sent.length;
  await runWebhook(plugin, 'media', ctx, { NotificationType: 'ItemAdded', ServerId: SERVER_ID, ServerName: 'Home', ItemId: ARRIVAL, Name: 'Arrival', ItemType: 'Movie', Year: 2016, Overview: 'Aliens.' });
  await runWebhook(plugin, 'media', ctx, { NotificationType: 'ItemAdded', ServerId: SERVER_ID, ItemId: HIDDEN, Name: 'Secret' });
  await runWebhook(plugin, 'media', ctx, { NotificationType: 'PlaybackStart', ServerId: SERVER_ID, ItemId: HEAT, Name: 'Heat', ItemType: 'Movie', Year: 1995, UserId: ANN });
  await runWebhook(plugin, 'media', ctx, { NotificationType: 'PlaybackStart', ServerId: SERVER_ID, ItemId: HEAT, Name: 'Heat', UserId: id('4') });
  const posts = ctx.sent.slice(sent);
  assert.deepEqual(posts.map((p) => p.channelId), [NEWS, LIVE]);
  assert.equal(posts[0].message.embeds[0].title, '🆕 Arrival (2016)');
  assert.match(posts[1].message.embeds[0].description, new RegExp(`<@${USER}> is watching \\*\\*Heat\\*\\* \\(1995\\)`));
  assert.equal(webhookTitle({ ItemType: 'Episode', SeriesName: 'Frieren', SeasonNumber00: '01', EpisodeNumber00: '05', Name: 'Phantoms' }), 'Frieren – S01E05 · Phantoms');
});

test('favorites: list, add and remove for the linked Jellyfin user', async () => {
  const { ctx, state } = setup();
  assert.equal((await runBlock(plugin, 'favorites', ctx, { vars })).port, 'not_linked');
  await linked(ctx, state);
  const list = await runBlock(plugin, 'favorites', ctx, { vars });
  assert.equal(list.results['.count'], '1');
  assert.match(list.results[''], /🎬 \*\*Heat\*\* \(1995\)/);
  const added = await runBlock(plugin, 'favorites_add', ctx, { vars, config: { title: 'arrival' } });
  assert.deepEqual([added.port, added.results['']], ['added', 'Arrival']);
  assert.ok(state.favs.has(ARRIVAL));
  const removed = await runBlock(plugin, 'favorites_remove', ctx, { vars, config: { title: 'heat' } });
  assert.deepEqual([removed.port, removed.results['']], ['removed', 'Heat']);
  assert.ok(!state.favs.has(HEAT));
  assert.equal((await runBlock(plugin, 'favorites_remove', ctx, { vars, config: { title: 'nope' } })).port, 'not_listed');
  assert.equal((await runBlock(plugin, 'favorites_add', ctx, { vars, config: { title: 'hidden' } })).port, 'not_found', 'only shared libraries');
});

test('jellyfin-play: songs, albums and playlists go into the music queue with the key as a secret', async () => {
  const { ctx } = setup();
  let out = await runBlock(plugin, 'play', ctx, { config: { query: 'get lucky', kind: 'any' }, vars, interaction: 'cmd-1' });
  assert.equal(out.port, 'replied');
  assert.deepEqual(ctx.queued[0], {
    guildId: GUILD, title: 'Daft Punk - Get Lucky', author: 'Daft Punk', duration: 369,
    source: { url: 'JELLYFIN_URL', path: `/Audio/${SONG1}/stream`, query: { static: 'true' }, auth: { secret: 'JELLYFIN_KEY', format: 'query', param: 'ApiKey' } },
  });
  assert.ok(!JSON.stringify(ctx.queued).includes('jf-key-1'), 'the plugin never handles the key');
  assert.match(ctx.answers.at(-1).message, /🎵 Song: \*\*Get Lucky\*\* · Daft Punk/);
  out = await runBlock(plugin, 'play', ctx, { config: { query: 'random access', kind: 'album' }, vars, interaction: 'cmd-2' });
  assert.equal(out.results['.count'], '2');
  assert.match(ctx.answers.at(-1).message, /💿 Album: \*\*Random Access Memories\*\*.*\(2 songs\)/);
  out = await runBlock(plugin, 'play', ctx, { config: { query: 'road', kind: 'playlist' }, vars });
  assert.equal(out.port, 'next');
  out = await runBlock(plugin, 'play', setup({ libraries: [`1:${MOVIES_LIB}`] }).ctx, { config: { query: 'get lucky' }, vars });
  assert.equal(out.port, 'not_found', 'the music library is not shared');
});
