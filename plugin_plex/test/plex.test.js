import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runTask, runWebhook } from '#sdk-testing';
import plugin from '../index.js';

const USER = '100000000000000001';
const GUILD = '200000000000000001';
const ROLE = '700000000000000007';
const NEWS = '900000000000000002';
const LIVE = '900000000000000003';
const permissions = ['storage', 'discord.messages.send', 'scheduler', 'http.endpoints', 'http.outbound', 'discord.interactions', 'discord.roles.manage', 'webhooks.inbound'];
const vars = { 'user.id': USER, 'server.id': GUILD };

const MOVIES = [
  { ratingKey: '11', title: 'Arrival', year: 2016, summary: 'Linguist meets aliens.', librarySectionID: 1, Genre: [{ tag: 'Sci-Fi' }], audienceRating: 8.1, duration: 6960000 },
  { ratingKey: '12', title: 'Heat', year: 1995, summary: 'Cops and robbers.', librarySectionID: 1, Genre: [{ tag: 'Crime' }] },
];

/** Fake Plex server (PLEX_API) and Overseerr (OVERSEERR_API). */
function servers(log = []) {
  return {
    PLEX_API: ({ path, query }) => {
      log.push(path);
      if (path === '/identity') return { json: { MediaContainer: { version: '1.40.0' } } };
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
    id: 'plugin_plex', permissions, endpoints: servers(log), web: plexTv(extra.pin), manifest: { endpoints: ['PLEX_API', 'OVERSEERR_API'] },
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

test('search finds in shared libraries, the token never leaves the bot', async () => {
  const { ctx } = setup();
  const hit = await runBlock(plugin, 'search', ctx, { config: { title: 'arrival' } });
  assert.equal(hit.port, 'found');
  assert.deepEqual([hit.results[''], hit.results['.duration'], hit.results['.genres']], ['Arrival', '116 min', 'Sci-Fi']);
  assert.equal((await runBlock(plugin, 'search', ctx, { config: { title: 'zzz' } })).port, 'not_found');
  assert.ok(!JSON.stringify(ctx.requests).includes('X-Plex-Token'));
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
  assert.match(started.results[''], /^https:\/\/app\.plex\.tv\/auth#\?clientID=bothub-plex-1&code=ABCD/);

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
