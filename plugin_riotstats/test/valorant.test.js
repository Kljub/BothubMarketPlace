import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBlock, runTask } from '#sdk-testing';
import plugin from '../index.js';
import { parseRiotId } from '../services/henrik.js';
import { freshEntries } from '../services/tracker.js';
import { outcome, summarize } from '../services/valorant.js';
import { ANN, BEN, CARD, CHANNEL, GUILD, ctxWith, freshState, valoEntry as entry, valoMatch as match, vars } from './fakes.js';

const VALO_ONLY = { HENRIKDEV_API_KEY: 'hd-key' };

test('riot IDs: Name#TAG, spaces, tracker.gg links; bad input', () => {
  assert.deepEqual(parseRiotId('Kljub#EUW'), { name: 'Kljub', tag: 'EUW' });
  assert.deepEqual(parseRiotId('  Sir Potato # 1234 '), { name: 'Sir Potato', tag: '1234' });
  assert.deepEqual(parseRiotId('https://tracker.gg/valorant/profile/riot/Kljub%23EUW/overview'), { name: 'Kljub', tag: 'EUW' });
  assert.equal(parseRiotId('Kljub'), null);
  assert.equal(parseRiotId('ab#EUW'), null, 'names have 3-16 characters');
  assert.equal(parseRiotId('Kljub#E'), null);
});

test('/valorant: rank, peak, season and the last competitive matches as an embed', async () => {
  const seen = [];
  const state = { ...freshState(), matches: [match('a'), match('b', { won: false, agent: 'Sova', k: 10, d: 15 }), match('c', { agent: 'Jett' }), match('u', { mode: 'Unrated' })] };
  const ctx = ctxWith(state, { seen });
  const out = await runBlock(plugin, 'stats', ctx, { config: { game: 'valorant', player: 'kljub#euw' }, vars: vars(), interaction: 'cmd-1' });
  assert.equal(out.port, 'replied');
  assert.deepEqual([out.results[''], out.results['.rank'], out.results['.points'], out.results['.winrate'], out.results['.games']], ['Kljub#EUW', 'Gold 2', '54', '67', '3']);
  const msg = ctx.answers.at(-1).message;
  const embed = msg.embeds[0];
  assert.match(embed.title, /Kljub#EUW · Pro/);
  assert.equal(embed.color, '#eccf56', 'gold');
  assert.match(embed.thumbnail_url, /competitivetiers\/.+\/13\/largeicon\.png$/);
  assert.equal(embed.image_url, `https://media.valorant-api.com/playercards/${CARD}/wideart.png`);
  assert.match(embed.fields[0].value, /\*\*Gold 2\*\* · 54 RR\nlast game \+18 RR\nPeak: Diamond 1 \(e9a3\)/);
  assert.match(embed.fields[2].value, /11 W \/ 20 games \(55 %\)/);
  assert.equal(embed.fields[3].name, 'Last 3 competitive', 'unrated left out');
  assert.match(embed.fields[3].value, /2 W · 1 L \(67 %\)\nK\/D \*\*1\.43\*\*/);
  assert.match(embed.fields[4].value, /Jett ×2\nSova ×1/);
  assert.equal(msg.components[0][0].url, 'https://tracker.gg/valorant/profile/riot/Kljub%23EUW/overview');
  assert.ok(seen.every((r) => r.headers.Authorization === 'hd-key'), 'the bot adds the key');
  await runBlock(plugin, 'stats', ctx, { config: { player: 'Kljub#EUW' }, vars: vars() });
  assert.equal(seen.filter((r) => r.url.includes('/v2/account/')).length, 1, 'the account is cached');
});

test('/valorant errors: unknown ID, no ID and no link, no key, refused key', async () => {
  const ctx = ctxWith();
  assert.equal((await runBlock(plugin, 'stats', ctx, { config: { player: 'Nobody#0000' }, vars: vars() })).port, 'not_found');
  const out = await runBlock(plugin, 'stats', ctx, { config: { player: 'Nobody#0000' }, vars: vars(), interaction: 'cmd-2' });
  assert.equal(out.port, 'replied');
  assert.match(ctx.answers.at(-1).message, /No Riot account "Nobody#0000" found/);
  assert.equal((await runBlock(plugin, 'stats', ctx, { config: {}, vars: vars() })).port, 'not_found');
  const bare = await runBlock(plugin, 'stats', ctxWith(undefined, { secrets: {} }), { config: { player: 'Kljub#EUW' }, vars: vars() });
  assert.equal(bare.port, 'not_set_up');
  assert.match(bare.results['.error'], /HENRIKDEV_API_KEY/);
  const bad = await runBlock(plugin, 'stats', ctxWith(undefined, { secrets: { HENRIKDEV_API_KEY: 'old' } }), { config: { player: 'Kljub#EUW' }, vars: vars() });
  assert.equal(bad.port, 'failed');
  assert.match(bad.results['.error'], /refused the API key/);
});

test('link, stats without a name, member option, leaderboard, unlink', async () => {
  const ctx = ctxWith({ ...freshState(), matches: [match('a')] }, { secrets: VALO_ONLY, config: { channel: { id: CHANNEL, guild: GUILD }, language: 'de' } });
  const linked = await runBlock(plugin, 'link', ctx, { config: { action: 'link', player: 'Kljub#EUW' }, vars: vars(ANN), interaction: 'l-1' });
  assert.deepEqual([linked.results[''], linked.results['.games']], ['Kljub#EUW', 'valorant']);
  assert.match(ctx.answers.at(-1).message, /Verknüpft mit \*\*Kljub#EUW\*\* \(Valorant\)\.\nDeine neuen Matches erscheinen in <#900000000000000001>/);
  await runBlock(plugin, 'link', ctx, { config: { action: 'link', player: 'Ben#1234' }, vars: vars(BEN) });
  assert.equal((await runBlock(plugin, 'stats', ctx, { config: {}, vars: vars(ANN) })).results[''], 'Kljub#EUW', 'own link');
  assert.equal((await runBlock(plugin, 'stats', ctx, { config: { member: `<@${BEN}>` }, vars: vars(ANN) })).results[''], 'Ben#1234', 'member option');
  const lb = await runBlock(plugin, 'leaderboard', ctx, { config: { game: 'valorant' }, vars: vars(), interaction: 'lb-1' });
  assert.equal(lb.results['.count'], '2');
  const embed = ctx.answers.at(-1).message.embeds[0];
  assert.equal(embed.title, '🏆 Valorant-Rangliste');
  const lines = embed.description.split('\n');
  assert.match(lines[0], /🥇 <@700000000000000002> · Ben#1234 — \*\*Diamond 3\*\* · 80 RR/);
  assert.match(lines[1], /🥈 <@700000000000000001> · Kljub#EUW — \*\*Gold 2\*\* · 54 RR/);
  await runBlock(plugin, 'link', ctx, { config: { action: 'unlink' }, vars: vars(BEN), interaction: 'u-1' });
  assert.match(ctx.answers.at(-1).message, /nicht mehr verknüpft/);
  const gone = await runBlock(plugin, 'stats', ctx, { config: { member: BEN }, vars: vars(ANN) });
  assert.equal(gone.port, 'not_found');
  assert.match(gone.results['.error'], /keine verknüpfte Riot-ID/);
  const none = await runBlock(plugin, 'link', ctxWith(undefined, { secrets: {} }), { config: { action: 'link', player: 'Kljub#EUW' }, vars: vars() });
  assert.equal(none.port, 'not_set_up');
});

test('/valorant-matches: one line per match, mode filter', async () => {
  const ctx = ctxWith({ ...freshState(), matches: [match('a'), match('u', { mode: 'Unrated', won: false, map: 'Bind' })] });
  const out = await runBlock(plugin, 'matches', ctx, { config: { game: 'valorant', player: 'Kljub#EUW', mode: 'all' }, vars: vars(), interaction: 'm-1' });
  assert.equal(out.results['.count'], '2');
  const lines = ctx.answers.at(-1).message.embeds[0].description.split('\n');
  assert.match(lines[0], /^🟢 \*\*Ascent\*\* 13–9 · Competitive · Jett · 20\/10\/5 · ACS 250 · HS 25 % · <t:\d+:R>$/);
  assert.match(lines[1], /^🔴 \*\*Bind\*\* 9–13 · Unrated/);
  assert.equal((await runBlock(plugin, 'matches', ctx, { config: { game: 'valorant', player: 'Kljub#EUW' }, vars: vars() })).results['.count'], '1', 'competitive by default');
});

test('tracker: first check remembers, then new matches and the rank up are posted', async () => {
  const state = { ...freshState(), history: [entry('m1', 12, 90, 15, '2026-10-09T18:00:00Z')], matches: [match('m1')] };
  const ctx = ctxWith(state, { secrets: VALO_ONLY, config: { channel: { id: CHANNEL, guild: GUILD } } });
  await runBlock(plugin, 'link', ctx, { config: { action: 'link', player: 'Kljub#EUW' }, vars: vars(ANN) });
  await runTask(plugin, 'tick', ctx);
  assert.equal(ctx.sent.length, 0, 'first check: nothing posted');
  state.history = [entry('m3', 13, 12, 22, '2026-10-09T21:00:00Z'), entry('m2', 12, 90, -10, '2026-10-09T20:00:00Z'), ...state.history];
  state.matches = [match('m3', { k: 25, d: 12 }), match('m2', { won: false }), ...state.matches];
  await runTask(plugin, 'tick', ctx);
  const embeds = ctx.sent.map((s) => s.message.embeds[0]);
  assert.deepEqual(embeds.map((e) => e.title), ['🔴 Kljub#EUW: Defeat 9–13 · Ascent', '🟢 Kljub#EUW: Victory 13–9 · Ascent'], 'oldest first');
  assert.match(embeds[0].description, /\*\*Jett\*\* · 20\/10\/5 · ACS 250 · HS 25 %\nGold 1 · 90 RR \(-10\)$/);
  assert.match(embeds[1].description, /Gold 2 · 12 RR \(\+22\)\n⬆️ Rank up: Gold 1 → \*\*Gold 2\*\*/);
  await runTask(plugin, 'tick', ctx);
  assert.equal(ctx.sent.length, 2, 'nothing new');
});

test('tracker: only rank changes when single matches are off; listed players; no channel', async () => {
  const state = { ...freshState(), history: [entry('m1', 12, 90, 15, '2026-10-09T18:00:00Z')] };
  const list = [{ _id: 'x1', riot_id: 'Kljub#EUW', game: 'valorant' }];
  const ctx = ctxWith(state, { config: { channel: { id: CHANNEL, guild: GUILD }, notify_matches: false, players: list } });
  await runTask(plugin, 'tick', ctx);
  state.history = [entry('m2', 12, 95, 5, '2026-10-09T19:00:00Z'), ...state.history];
  await runTask(plugin, 'tick', ctx);
  assert.equal(ctx.sent.length, 0, 'no rank change');
  state.history = [entry('m3', 13, 10, 15, '2026-10-09T20:00:00Z'), ...state.history];
  await runTask(plugin, 'tick', ctx);
  assert.equal(ctx.sent.length, 1);
  assert.match(ctx.sent[0].message.embeds[0].description, /Rank up: Gold 1 → \*\*Gold 2\*\*/);
  const quiet = ctxWith(state, { config: { players: list } });
  await runTask(plugin, 'tick', quiet);
  state.history = [entry('m4', 13, 30, 20, '2026-10-09T21:00:00Z'), ...state.history];
  await runTask(plugin, 'tick', quiet);
  assert.equal(quiet.sent.length, 0, 'no channel: nothing posted');
});

test('helpers: fresh entries, outcome, summary', () => {
  const h = ['c', 'b', 'a'];
  assert.deepEqual(freshEntries(h, 'a'), ['b', 'c']);
  assert.deepEqual(freshEntries(h, 'zz'), ['c'], 'unknown last match: only the newest');
  assert.deepEqual(freshEntries(h, 'c'), []);
  assert.equal(outcome({ stats: { team: 'Blue' }, teams: { red: 0, blue: 0 } }), null, 'deathmatch');
  assert.equal(outcome({ stats: { team: 'Blue' }, teams: { red: 12, blue: 12 } }).result, 'draw');
  assert.equal(summarize([]).kd, '0.00');
});
