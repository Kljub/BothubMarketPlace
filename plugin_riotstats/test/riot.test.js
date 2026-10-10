import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBlock, runTask } from '#sdk-testing';
import plugin from '../index.js';
import { lolMatch, tftMatch } from './fakes.js';
import { ANN, BEN, CHANNEL, GUILD, ctxWith, freshState, vars } from './fakes.js';
import { cleanName } from '../services/tft.js';
import { rankName, rankScore } from '../services/lol.js';

const RIOT_ONLY = { RIOT_API_KEY: 'riot-key' };

test('/lol: ranks, mastery and the last matches; matches are cached', async () => {
  const seen = [];
  const ctx = ctxWith(freshState(), { seen });
  const out = await runBlock(plugin, 'stats', ctx, { config: { game: 'lol', player: 'Kljub#EUW' }, vars: vars(), interaction: 'c-1' });
  assert.equal(out.port, 'replied');
  assert.deepEqual([out.results['.rank'], out.results['.points'], out.results['.winrate'], out.results['.games']], ['Gold II', '50', '67', '3']);
  const msg = ctx.answers.at(-1).message;
  const e = msg.embeds[0];
  assert.equal(e.title, '⚔️ Kljub#EUW · League of Legends');
  assert.match(e.thumbnail_url, /emblem-gold\.png$/);
  assert.match(e.fields[0].value, /\*\*Gold II\*\* · 50 LP\n30 W \/ 20 L \(60 %\)/);
  assert.equal(e.fields[1].value, 'Unranked');
  assert.match(e.fields[2].value, /Level 321 · EUW/);
  assert.match(e.fields[3].value, /^Jinx · level 12 · 345,678 pts\nEzreal · level 7/);
  assert.match(e.fields[4].value, /2 W · 1 L \(67 %\)\nKDA \*\*3\.58\*\* \(8\.33\/4\.00\/6\.00\)\nCS\/min 6\.67\nMain role: Bot/);
  assert.match(e.fields[5].value, /Jinx · 2\/2\nEzreal · 0\/1/);
  assert.equal(msg.components[0][0].url, 'https://op.gg/lol/summoners/euw/Kljub-EUW');
  assert.ok(seen.filter((r) => r.url.includes('riotgames')).every((r) => r.headers['X-Riot-Token'] === 'riot-key'));
  const before = seen.filter((r) => /\/matches\/L\d$/.test(r.url)).length;
  await runBlock(plugin, 'stats', ctx, { config: { game: 'lol', player: 'Kljub#EUW' }, vars: vars() });
  assert.equal(seen.filter((r) => /\/matches\/L\d$/.test(r.url)).length, before, 'known matches are not loaded again');
});

test('/lol-matches: queue filter goes to Riot', async () => {
  const seen = [];
  const ctx = ctxWith(freshState(), { seen });
  const out = await runBlock(plugin, 'matches', ctx, { config: { game: 'lol', player: 'Kljub#EUW', mode: 'aram' }, vars: vars(), interaction: 'm-1' });
  assert.equal(out.results['.count'], '1');
  assert.equal(seen.find((r) => r.url.includes('/ids')).query.queue, '450');
  assert.match(ctx.answers.at(-1).message.embeds[0].description, /^🔴 \*\*Ezreal\*\* · ARAM · 3\/7\/4 · 200 CS \(6\.7\) · 30:00 · <t:1760000000:R>$/);
});

test('/tft and /tft-matches: rank, average place, traits; TFT falls back to RIOT_API_KEY', async () => {
  const ctx = ctxWith(freshState(), { secrets: RIOT_ONLY });
  const out = await runBlock(plugin, 'stats', ctx, { config: { game: 'tft', player: 'Kljub#EUW' }, vars: vars(), interaction: 't-1' });
  assert.deepEqual([out.results['.rank'], out.results['.kda'], out.results['.winrate']], ['Platinum IV', '3.00', '50']);
  const e = ctx.answers.at(-1).message.embeds[0];
  assert.match(e.fields[0].value, /\*\*Platinum IV\*\* · 10 LP\n23 games · 3 wins/);
  assert.match(e.fields.find((f) => f.name === 'Last 2 games').value, /Average place \*\*3\.00\*\*\nTop 4: 50 % · wins: 1/);
  const m = await runBlock(plugin, 'matches', ctx, { config: { game: 'tft', player: 'Kljub#EUW', mode: 'doubleup' }, vars: vars(), interaction: 't-2' });
  assert.equal(m.results['.count'], '1');
  assert.match(ctx.answers.at(-1).message.embeds[0].description, /^🥇 \*\*#1\*\* · Double Up · 4 Sniper, 3 Battle Academia · Lv 8/);
  const none = await runBlock(plugin, 'stats', ctxWith(freshState(), { secrets: { HENRIKDEV_API_KEY: 'hd-key' } }), { config: { game: 'tft', player: 'Kljub#EUW' }, vars: vars() });
  assert.equal(none.port, 'not_set_up');
  assert.match(none.results['.error'], /RIOT_TFT_API_KEY or RIOT_API_KEY/);
});

test('/lor: last matches with regions', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'stats', ctx, { config: { game: 'lor', player: 'Kljub#EUW' }, vars: vars(), interaction: 'r-1' });
  assert.deepEqual([out.results['.winrate'], out.results['.games']], ['50', '2']);
  const e = ctx.answers.at(-1).message.embeds[0];
  assert.match(e.fields[1].value, /Demacia ×2\nShadow Isles ×2/);
  assert.match(e.fields[2].value, /^🔴 Demacia \/ Shadow Isles · Ranked/);
});

test('refused Riot key and unknown Riot ID', async () => {
  const bad = await runBlock(plugin, 'stats', ctxWith(freshState(), { secrets: { RIOT_API_KEY: 'expired' } }), { config: { game: 'lol', player: 'Kljub#EUW' }, vars: vars() });
  assert.match(bad.results['.error'], /Riot refused the API key/);
  const nf = await runBlock(plugin, 'stats', ctxWith(), { config: { game: 'lol', player: 'Nobody#0000' }, vars: vars() });
  assert.equal(nf.port, 'not_found');
});

test('link finds every game; LoL leaderboard; LoL tracker posts LP and the rank up', async () => {
  const state = freshState();
  const ctx = ctxWith(state, { config: { channel: { id: CHANNEL, guild: GUILD }, track_valorant: false, track_tft: false } });
  const linked = await runBlock(plugin, 'link', ctx, { config: { action: 'link', player: 'Kljub#EUW' }, vars: vars(ANN), interaction: 'l-1' });
  assert.equal(linked.results['.games'], 'valorant,lol,tft');
  assert.match(ctx.answers.at(-1).message, /\(Valorant, League of Legends, Teamfight Tactics\)/);
  await runBlock(plugin, 'link', ctx, { config: { action: 'link', player: 'Ben#1234' }, vars: vars(BEN) });
  await runBlock(plugin, 'leaderboard', ctx, { config: { game: 'lol' }, vars: vars(), interaction: 'lb' });
  const lines = ctx.answers.at(-1).message.embeds[0].description.split('\n');
  assert.match(lines[0], /🥇 <@700000000000000001> · Kljub#EUW — \*\*Gold II\*\* · 50 LP/);
  assert.match(lines[1], /🥈 <@700000000000000002> · Ben#1234 — Unranked/);

  await runTask(plugin, 'tick', ctx);
  assert.equal(ctx.sent.length, 0, 'first check: nothing posted');
  state.lolIds = ['L5', 'L4', ...state.lolIds];
  state.lol.L4 = lolMatch('L4', { win: false, champ: 'Ezreal', cid: 81, q: 450 });
  state.lol.L5 = lolMatch('L5', { k: 15, d: 1, a: 9 });
  state.solo = { ...state.solo, rank: 'I', leaguePoints: 3 };
  await runTask(plugin, 'tick', ctx);
  const posts = ctx.sent.map((s) => s.message.embeds[0]);
  assert.deepEqual(posts.map((p) => p.title), ['🔴 Kljub#EUW: Defeat · Ezreal', '🟢 Kljub#EUW: Victory · Jinx']);
  assert.match(posts[0].description, /^\*\*Ezreal\*\* · 10\/2\/8 · 200 CS · 30:00 · ARAM$/, 'ARAM: no rank');
  assert.match(posts[1].description, /Gold I · 3 LP\n⬆️ Rank up: Gold II → \*\*Gold I\*\*/);
  assert.match(posts[1].thumbnail_url, /champion-icons\/222\.png$/);
});

test('TFT tracker posts the place', async () => {
  const state = freshState();
  const ctx = ctxWith(state, { config: { channel: { id: CHANNEL, guild: GUILD }, players: [{ _id: 'a', riot_id: 'Kljub#EUW', game: 'tft' }] } });
  await runTask(plugin, 'tick', ctx);
  state.tftIds = ['T3', ...state.tftIds];
  state.tft.T3 = tftMatch('T3', { place: 3 });
  state.tftRank = { ...state.tftRank, leaguePoints: 45 };
  await runTask(plugin, 'tick', ctx);
  const p = ctx.sent[0].message.embeds[0];
  assert.equal(p.title, '🟢 Kljub#EUW: Place #3');
  assert.match(p.description, /Ranked · 4 Sniper, 3 Battle Academia · Lv 8\nPlatinum IV · 45 LP \(\+35\)/);
});

test('helpers: rank names and scores, trait names', () => {
  assert.equal(rankName({ tier: 'MASTER', rank: 'I' }), 'Master');
  assert.ok(rankScore({ tier: 'GOLD', rank: 'I', leaguePoints: 0 }) > rankScore({ tier: 'GOLD', rank: 'II', leaguePoints: 99 }));
  assert.ok(rankScore({ tier: 'CHALLENGER', rank: 'I', leaguePoints: 1 }) > rankScore({ tier: 'MASTER', rank: 'I', leaguePoints: 900 }) - 1000);
  assert.equal(rankScore(null), -1);
  assert.equal(cleanName('TFT15_BattleAcademia'), 'Battle Academia');
});
