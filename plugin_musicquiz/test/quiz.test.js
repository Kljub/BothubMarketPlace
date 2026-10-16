import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runComponent, runTask } from '#sdk-testing';
import plugin from '../index.js';
import manifest from '../bothub.json' with { type: 'json' };
import { buildRounds } from '../services/game.js';
import { loadTracks, playlistId } from '../services/deezer.js';

const GUILD = '200000000000000001';
const CHANNEL = '300000000000000001';
const HOST = '100000000000000001';
const ANN = '100000000000000002';
const BEN = '100000000000000003';

const song = (i, artist = `Artist ${i}`) => ({
  id: 1000 + i, readable: true, title: `Song ${i}`, title_short: `Song ${i}`, link: `https://www.deezer.com/track/${1000 + i}`,
  preview: `https://cdnt-preview.dzcdn.net/api/1/1/${i}.mp3?hdnea=exp=1~hmac=x`, artist: { name: artist }, album: { cover_medium: `https://cdn-images.dzcdn.net/${i}.jpg` },
});
const CHART = Array.from({ length: 12 }, (_, i) => song(i + 1));

function ctxWith(config = {}, deezer = {}) {
  return createTestContext({
    id: 'plugin_musicquiz', permissions: manifest.sdk.permissions, hosts: manifest.services.hosts,
    config: { language: 'en', rounds: 3, round_time: '45', ...config },
    web: {
      'api.deezer.com': (req) => {
        if (deezer.down) return { status: 500, json: { error: {} } };
        if (req.url.includes('/search/playlist')) return { json: { data: [{ id: 77, nb_tracks: 12 }, { id: 5, nb_tracks: 3 }] } };
        if (req.url.includes('/playlist/77/tracks')) return { json: { data: CHART.slice(0, 8) } };
        if (req.url.includes('/chart/')) return { json: { data: [...CHART, song(1), { ...song(99), preview: '' }] } };
        return { status: 404, json: { error: { code: 800 } } };
      },
    },
  });
}

const vars = (user = HOST) => ({ 'server.id': GUILD, 'channel.id': CHANNEL, 'user.id': user });
const game = (ctx) => JSON.parse(ctx.store.get(`g:${GUILD}`) ?? 'null');
const press = (ctx, data, user) => runComponent(plugin, 'mq', ctx, { data, user: { id: user, name: 'x', displayName: 'X' }, guildId: GUILD, channelId: CHANNEL });
const answerOf = (ctx, handle) => ctx.answers.filter((a) => a.handle === handle).at(-1);
const rounds = (ctx) => ctx.sent.filter((s) => s.message.embeds?.[0]?.title?.startsWith('🎵 Round') && !s.message.embeds[0].title.includes('solved'));

test('songs: distinct, with a preview; playlist links', async () => {
  const ctx = ctxWith();
  const tracks = await loadTracks(ctx, { source: 'pop' });
  assert.equal(tracks.length, 12, 'duplicate and preview-less songs left out');
  assert.deepEqual(Object.keys(tracks[0]), ['id', 'title', 'artist', 'preview', 'link', 'cover']);
  assert.equal((await loadTracks(ctx, { source: '80s' })).length, 8, 'decade: the biggest playlist found');
  assert.equal(playlistId('https://www.deezer.com/de/playlist/1234567'), '1234567');
  assert.equal(playlistId('908622995'), '908622995');
  assert.equal(playlistId('https://open.spotify.com/playlist/x'), null);
});

test('rounds: four different answers, the right one marked; artist mode falls back when artists repeat', () => {
  const tracks = CHART.map((x) => ({ id: String(x.id), title: x.title, artist: x.artist.name, preview: x.preview, link: x.link, cover: '' }));
  const rs = buildRounds(tracks, 10, 'mixed');
  assert.equal(rs.length, 10);
  for (const r of rs) {
    assert.equal(new Set(r.o).size, 4);
    assert.equal(r.o[r.k], r.q === 'artist' ? r.a : r.t);
  }
  assert.equal(new Set(rs.map((r) => r.a)).size, 10, 'different artists first');
  const one = tracks.map((x) => ({ ...x, artist: 'Same' }));
  assert.ok(buildRounds(one, 3, 'artist').every((r) => r.q === 'title'));
});

test('a full quiz: clip in the queue, wrong and right guesses, reveal, final standings, leaderboard', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'start', ctx, { config: { genre: 'rock', rounds: '{option_rounds}', mode: 'title', playlist: '{option_playlist}' }, vars: vars(), interaction: 'cmd' });
  assert.equal(out.port, 'replied');
  assert.equal(out.results['.rounds'], '3');
  assert.match(answerOf(ctx, 'cmd').message, /3 rounds/);
  assert.equal(ctx.queued.length, 1);
  assert.match(ctx.queued[0].source.url, /^https:\/\/cdnt-preview\.dzcdn\.net\//);
  assert.doesNotMatch(ctx.queued[0].title, /Song/, 'the queue does not give the answer away');
  assert.deepEqual(ctx.joined, [HOST]);
  assert.equal(rounds(ctx).length, 1);

  let g = game(ctx);
  const right = g.r[0].k;
  const wrong = (right + 1) % 4;
  // Ann guesses wrong: told privately, the round goes on.
  const h1 = await press(ctx, `a:${g.id}:0:${wrong}`, ANN);
  assert.match(answerOf(ctx, h1).message, /Wrong/);
  assert.ok(answerOf(ctx, h1).ephemeral);
  const h2 = await press(ctx, `a:${g.id}:0:${right}`, ANN);
  assert.match(answerOf(ctx, h2).message, /already/);
  // Ben is right: the message shows the answer, round 2 starts.
  const h3 = await press(ctx, `a:${g.id}:0:${right}`, BEN);
  const reveal = answerOf(ctx, h3);
  assert.equal(reveal.kind, 'update');
  assert.match(reveal.message.embeds[0].description, new RegExp(`\\*\\*${g.r[0].t}\\*\\*`));
  assert.match(reveal.message.embeds[0].description, new RegExp(`🏆 <@${BEN}>`));
  assert.match(reveal.message.embeds[0].description, new RegExp(`Wrong: <@${ANN}>`));
  assert.equal(ctx.queued.length, 2);
  assert.equal(rounds(ctx).length, 2);
  // An old button does nothing.
  const late = await press(ctx, `a:${g.id}:0:${right}`, HOST);
  assert.match(answerOf(ctx, late).message, /over/);

  // Round 2: a stranger cannot reveal, the host can.
  g = game(ctx);
  const stranger = await press(ctx, `s:${g.id}:1`, '100000000000000009');
  assert.match(answerOf(ctx, stranger).message, /Only players/);
  const skip = await press(ctx, `s:${g.id}:1`, HOST);
  assert.match(answerOf(ctx, skip).message.embeds[0].description, /Nobody got it/);

  // Round 3: Ann is right, the quiz ends.
  g = game(ctx);
  await press(ctx, `a:${g.id}:2:${g.r[2].k}`, ANN);
  assert.equal(game(ctx), null);
  const final = ctx.sent.at(-1).message.embeds[0];
  assert.equal(final.title, '🏁 Music Quiz over');
  assert.match(final.description, new RegExp(`🥇 <@(${ANN}|${BEN})>: 1 pts`));
  assert.equal(JSON.parse(ctx.store.get('ix')).length, 0);

  const top = await runBlock(plugin, 'top', ctx, { config: { by: 'points' }, vars: vars(), interaction: 'top' });
  const text = answerOf(ctx, 'top').message.embeds[0].description;
  assert.match(text, /\*\*1\*\* pts · 1 right · 1 quiz wins/);
  assert.doesNotMatch(text, new RegExp(HOST), 'only who guessed is ranked');
  assert.ok([ANN, BEN].includes(top.results['.first']));
});

test('one quiz per server; the tick reveals rounds nobody solves; stop', async () => {
  const ctx = ctxWith({ language: 'de' });
  await runBlock(plugin, 'start', ctx, { config: {}, vars: vars(), interaction: 'a' });
  const again = await runBlock(plugin, 'start', ctx, { config: {}, vars: vars(ANN), interaction: 'b' });
  assert.equal(again.port, 'failed');
  assert.match(again.results['.error'], /läuft schon ein Quiz/);

  await runTask(plugin, 'tick', ctx);
  assert.equal(game(ctx).n, 0, 'not yet');
  const g = game(ctx);
  g.at -= 46_000;
  ctx.store.set(`g:${GUILD}`, JSON.stringify(g));
  await runTask(plugin, 'tick', ctx);
  assert.equal(game(ctx).n, 1, 'round time over: next round');

  const denied = await runBlock(plugin, 'stop', ctx, { vars: vars(ANN), interaction: 's1' });
  assert.match(denied.results[''], /Nur <@/);
  const stopped = await runBlock(plugin, 'stop', ctx, { vars: vars(), interaction: 's2' });
  assert.match(stopped.results[''], /Quiz beendet/);
  assert.equal(game(ctx), null);
  assert.match(ctx.sent.at(-1).message.embeds[0].description, /Niemand hat einen Punkt geholt\.\n\nDas Quiz wurde beendet\./);
});

test('errors: Deezer down, a bad playlist, too few songs', async () => {
  const down = await runBlock(plugin, 'start', ctxWith({}, { down: true }), { config: {}, vars: vars() });
  assert.deepEqual([down.port, down.results['.error']], ['failed', '❌ Deezer did not answer. Try again later.']);
  const bad = await runBlock(plugin, 'start', ctxWith(), { config: { playlist: 'https://open.spotify.com/playlist/1' }, vars: vars() });
  assert.match(bad.results['.error'], /no Deezer playlist/);
  const few = await runBlock(plugin, 'start', ctxWith({ rounds: 15 }), { config: {}, vars: vars() });
  assert.match(few.results['.error'], /too few songs with a preview \(12\)/);
});
