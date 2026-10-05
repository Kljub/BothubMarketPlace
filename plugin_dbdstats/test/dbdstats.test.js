import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock } from '#sdk-testing';
import plugin from '../index.js';
import manifest from '../bothub.json' with { type: 'json' };
import { summarize } from '../services/steam.js';

const ID = '76561199445601202';
const PRIVATE = '76561199000000001';
const STATS = {
  DBD_BloodwebPoints: 249450952, DBD_MaxBloodwebPointsOneCategory: 29330000,
  DBD_Escape: 504, DBD_EscapeKO: 66, DBD_EscapeThroughHatch: 63,
  DBD_GeneratorPct_float: 2260.4, DBD_HealPct_float: 2562.2, DBD_UnhookOrHeal: 2787, DBD_SkillCheckSuccess: 39842,
  DBD_DLC3_Camper_Stat1: 136, DBD_DLC7_Camper_Stat2: 235,
  DBD_SacrificedCampers: 2800, DBD_KilledCampers: 432, DBD_Chapter13_Slasher_Stat1: 150, DBD_DLC6_Slasher_Stat2: 77,
};

/** A fake Steam Web API (key "steam-key-1"). */
const steam = (seen = []) => ({
  'api.steampowered.com': (req) => {
    seen.push(req);
    if (req.query.key !== 'steam-key-1') return { status: 403, json: {} };
    const path = new URL(req.url).pathname;
    if (path === '/ISteamUser/ResolveVanityURL/v1/') {
      return { json: { response: req.query.vanityurl === 'ezteabag' ? { steamid: ID, success: 1 } : req.query.vanityurl === 'shy' ? { steamid: PRIVATE, success: 1 } : { success: 42, message: 'No match' } } };
    }
    if (path === '/ISteamUser/GetPlayerSummaries/v2/') {
      const name = req.query.steamids === ID ? 'Kljub' : 'Shy';
      return { json: { response: { players: [{ steamid: req.query.steamids, personaname: name, avatarfull: 'https://avatars.steamstatic.com/a_full.jpg', profileurl: `https://steamcommunity.com/id/${name}/`, communityvisibilitystate: 3 }] } } };
    }
    if (path === '/ISteamUserStats/GetUserStatsForGame/v2/') {
      if (req.query.steamid !== ID) return { status: 400, json: {} };
      return { json: { playerstats: { steamID: ID, gameName: 'DeadByDaylight', stats: Object.entries(STATS).map(([name, value]) => ({ name, value })), achievements: [{ name: 'a', achieved: 1 }, { name: 'b', achieved: 1 }] } } };
    }
    if (path === '/IPlayerService/GetOwnedGames/v1/') return { json: { response: { game_count: 1, games: [{ appid: 381210, playtime_forever: 60023, playtime_2weeks: 1039 }] } } };
    return { status: 404, json: {} };
  },
});

const ctxWith = ({ seen = [], secrets = { STEAM_API_KEY: 'steam-key-1' } } = {}) => createTestContext({
  id: 'plugin_dbdstats', permissions: manifest.sdk.permissions, manifest: { id: 'plugin_dbdstats', secrets: manifest.services.secrets },
  hosts: manifest.services.hosts, secrets, web: steam(seen),
});

test('dbd-stats: a custom URL name, the stats as an embed with links', async () => {
  const seen = [];
  const ctx = ctxWith({ seen });
  const out = await runBlock(plugin, 'stats', ctx, { config: { player: 'ezteabag' }, interaction: 'cmd-1' });
  assert.equal(out.port, 'replied');
  assert.deepEqual([out.results[''], out.results['.steamid'], out.results['.escapes'], out.results['.kills']], ['Kljub', ID, '633', '3,232']);
  const msg = ctx.answers.at(-1).message;
  const embed = msg.embeds[0];
  assert.match(embed.title, /Kljub/);
  assert.match(embed.fields[0].value, /249,450,952/);
  assert.match(embed.fields[1].value, /1,000h 23m/, '60023 minutes');
  assert.match(embed.fields[3].value, /\*\*633\*\* escapes \(gates 504 · crawling 66 · hatch 63\)/);
  assert.match(embed.fields[4].value, /\*\*3,232\*\* kills/);
  assert.equal(msg.components[0][0].url, `https://deadbystats.eu/profile/${ID}`);
  assert.ok(seen.every((r) => r.query.key === 'steam-key-1'), 'the bot adds the key');
});

test('dbd-stats: profile links, IDs, unknown and private players, missing key', async () => {
  const ctx = ctxWith();
  assert.equal((await runBlock(plugin, 'stats', ctx, { config: { player: `https://steamcommunity.com/profiles/${ID}/` } })).results['.steamid'], ID);
  assert.equal((await runBlock(plugin, 'stats', ctx, { config: { player: 'https://steamcommunity.com/id/ezteabag' } })).port, 'next');
  assert.equal((await runBlock(plugin, 'stats', ctx, { config: { player: 'nobody_here' } })).port, 'not_found');
  assert.equal((await runBlock(plugin, 'stats', ctx, { config: { player: 'shy' } })).port, 'private');
  const out = await runBlock(plugin, 'stats', ctx, { config: { player: 'shy' }, interaction: 'cmd-2' });
  assert.equal(out.port, 'replied');
  assert.match(ctx.answers.at(-1).message, /no public Dead by Daylight statistics/);
  const bare = ctxWith({ secrets: {} });
  assert.equal((await runBlock(plugin, 'stats', bare, { config: { player: 'ezteabag' } })).port, 'not_set_up');
});

test('summary: numbers without playtime when game details are private', () => {
  const sum = summarize({ DBD_BloodwebPoints: 1000 }, null);
  assert.equal(sum.playtime, 'private');
  assert.equal(sum.bpPerHour, '—');
  assert.equal(sum.escapes, '0');
});
