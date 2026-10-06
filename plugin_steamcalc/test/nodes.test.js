import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock } from '#sdk-testing';
import plugin from '../index.js';
import { calc } from '../services/steam.js';

const ID = '76561197960287930';
const permissions = ['secrets.use', 'discord.interactions.reply'];
const GAMES = [
  { appid: 10, name: 'Counter-Strike', playtime_forever: 6000, playtime_2weeks: 120 },
  { appid: 20, name: 'Team Fortress Classic', playtime_forever: 0 },
  { appid: 30, name: 'Free Game', playtime_forever: 90 },
];
const web = (seen = []) => ({
  'api.steampowered.com': (req) => {
    seen.push(req);
    if (req.query.key !== 'k1') return { status: 403, json: {} };
    const path = new URL(req.url).pathname;
    if (path === '/ISteamUser/ResolveVanityURL/v1/') return { json: { response: req.query.vanityurl === 'gaben' ? { steamid: ID, success: 1 } : { success: 42 } } };
    if (path === '/ISteamUser/GetPlayerSummaries/v2/') return { json: { response: { players: [{ steamid: ID, personaname: 'Gabe', avatarfull: 'https://a/x.jpg', profileurl: 'https://steamcommunity.com/id/gaben/', communityvisibilitystate: 3, personastate: 1, loccountrycode: 'US', timecreated: 1063407589 }] } } };
    if (path === '/IPlayerService/GetSteamLevel/v1/') return { json: { response: { player_level: 42 } } };
    if (path === '/IPlayerService/GetBadges/v1/') return { json: { response: { badges: [{}, {}], player_xp: 5000 } } };
    if (path === '/ISteamUser/GetPlayerBans/v1/') return { json: { players: [{ NumberOfVACBans: 0, NumberOfGameBans: 0, CommunityBanned: false }] } };
    if (path === '/ISteamUser/GetFriendList/v1/') return { json: { friendslist: { friends: [{}, {}, {}] } } };
    if (path === '/IPlayerService/GetOwnedGames/v1/') return { json: { response: { game_count: 3, games: GAMES } } };
    return { status: 404, json: {} };
  },
  'store.steampowered.com': (req) => {
    seen.push(req);
    const out = {};
    for (const id of String(req.query.appids).split(',')) {
      out[id] = id === '10' ? { success: true, data: { price_overview: { currency: 'EUR', initial: 1999, final: 999, discount_percent: 50 } } }
        : id === '20' ? { success: true, data: { price_overview: { currency: 'EUR', initial: 499, final: 499, discount_percent: 0 } } }
        : { success: true, data: [] };
    }
    return { json: out };
  },
});
const ctxWith = (seen = [], secrets = { STEAM_API_KEY: 'k1' }) => createTestContext({
  id: 'plugin_steamcalc', permissions, secrets, web: web(seen), hosts: ['api.steampowered.com', 'store.steampowered.com'], config: { country: 'de' },
});

test('calc: value with and without sales, unplayed games, price per hour', () => {
  const list = GAMES.map((g) => ({ appid: g.appid, name: g.name, minutes: g.playtime_forever, twoWeeks: g.playtime_2weeks ?? 0 }));
  const c = calc(list, { 10: { initial: 1999, final: 999, currency: 'EUR' }, 20: { initial: 499, final: 499, currency: 'EUR' } });
  assert.deepEqual([c.games, c.played, c.unplayed, c.priced, c.value, c.full, c.currency], [3, 2, 1, 2, 1498, 2498, 'EUR']);
  assert.equal(c.minutes, 6090);
});

test('steam-calc: answers with value, games, playtime; prices in the set country', async () => {
  const seen = [];
  const ctx = ctxWith(seen);
  const out = await runBlock(plugin, 'calc', ctx, { config: { player: 'https://steamcommunity.com/id/gaben/' }, interaction: 'h1' });
  assert.equal(out.port, 'replied');
  assert.equal(out.results['.value'], '€14.98');
  assert.equal(out.results['.games'], '3');
  assert.deepEqual(ctx.answers.map((a) => a.kind), ['deferReply', 'editReply']);
  const embed = ctx.answers[1].message.embeds[0];
  assert.match(embed.fields[0].value, /€14\.98[\s\S]*Without sales: €24\.98/);
  assert.match(embed.fields[1].value, /2 played · 1 never played/);
  assert.ok(seen.some((r) => r.query.cc === 'de' && r.query.filters === 'price_overview'));
});

test('steam-profile: status, level, friends, recent games', async () => {
  const ctx = ctxWith();
  const out = await runBlock(plugin, 'profile', ctx, { config: { player: ID }, interaction: 'h2' });
  assert.equal(out.results['.level'], '42');
  const fields = ctx.answers[1].message.embeds[0].fields;
  assert.equal(fields.find((f) => f.name.includes('Friends')).value, '3');
  assert.match(fields.find((f) => f.name.includes('Last 2 weeks')).value, /Counter-Strike/);
});

test('unknown player, missing key', async () => {
  const ctx = ctxWith();
  assert.equal((await runBlock(plugin, 'calc', ctx, { config: { player: 'nobody' } })).port, 'not_found');
  const none = ctxWith([], {});
  assert.equal((await runBlock(plugin, 'calc', none, { config: { player: 'gaben' } })).port, 'not_set_up');
});
