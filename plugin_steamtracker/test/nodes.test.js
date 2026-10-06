import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runTask } from '#sdk-testing';
import plugin from '../index.js';
import { changes } from '../services/tracker.js';

const CHANNEL = '900000000000000001';
const permissions = ['storage', 'scheduler', 'secrets.use', 'discord.messages.send', 'discord.interactions.reply'];
const hosts = ['api.steampowered.com', 'store.steampowered.com'];

function steam(state) {
  return {
    'store.steampowered.com': (req) => {
      const path = new URL(req.url).pathname;
      if (path === '/api/storesearch/') return { json: { items: req.query.term === 'portal' ? [{ id: 400, name: 'Portal' }] : [] } };
      if (path === '/api/appdetails') {
        const out = {};
        for (const id of String(req.query.appids).split(',')) {
          if (id !== '400') { out[id] = { success: false }; continue; }
          const price = { currency: 'EUR', initial: 999, final: Math.round(999 * (1 - state.discount / 100)), discount_percent: state.discount, final_formatted: '' };
          out[id] = { success: true, data: req.query.filters ? { price_overview: price } : { name: 'Portal', header_image: 'https://x/h.jpg', is_free: false, price_overview: price, release_date: { date: '10 Oct, 2007' }, developers: ['Valve'], genres: [{ description: 'Action' }], short_description: 'Think with portals.' } };
        }
        return { json: out };
      }
      if (path === '/appreviews/400') return { json: { query_summary: { review_score_desc: 'Overwhelmingly Positive', total_positive: 98, total_reviews: 100 } } };
      return { status: 404, json: {} };
    },
    'api.steampowered.com': (req) => {
      const path = new URL(req.url).pathname;
      if (path === '/ISteamUserStats/GetNumberOfCurrentPlayers/v1/') return { json: { response: { player_count: 1234, result: 1 } } };
      if (path === '/ISteamNews/GetNewsForApp/v2/') return { json: { appnews: { newsitems: state.news } } };
      return { status: 404, json: {} };
    },
  };
}
const ctxWith = (state, config = {}) => createTestContext({
  id: 'plugin_steamtracker', permissions, hosts, web: steam(state),
  config: { channel: { id: CHANNEL, guild: '1' }, country: 'de', min_discount: 20, games: [{ _id: 'a1b2c3d4', game: 'portal' }], ...config },
});

test('changes: first check only remembers; sale once from the minimum; free; new news', () => {
  const opts = { sales: true, minDiscount: 20, free: true, news: true };
  assert.deepEqual(changes(null, { price: { discount: 50, final: 1, initial: 2 }, news: [] }, opts), []);
  assert.deepEqual(changes({ discount: 0, final: 2 }, { price: { discount: 50, final: 1, initial: 2 }, news: [] }, opts).map((p) => p.kind), ['sale']);
  assert.deepEqual(changes({ discount: 50, final: 1 }, { price: { discount: 60, final: 1, initial: 2 }, news: [] }, opts), [], 'already on sale');
  assert.deepEqual(changes({ discount: 0, final: 2 }, { price: { discount: 100, final: 0, initial: 2 }, news: [] }, opts).map((p) => p.kind), ['free']);
  const news = [{ gid: '3', title: 'c' }, { gid: '2', title: 'b' }, { gid: '1', title: 'a' }];
  assert.deepEqual(changes({ discount: 0, news: '1' }, { price: null, news }, opts).map((p) => p.item.gid), ['2', '3'], 'oldest first');
});

test('tick: remembers first, then posts a sale and new patch notes', async () => {
  const state = { discount: 0, news: [{ gid: '10', title: 'Old update', url: 'https://x/10', contents: 'old', date: 1 }] };
  const ctx = ctxWith(state);
  await runTask(plugin, 'tick', ctx);
  assert.equal(ctx.sent.length, 0, 'first check: nothing posted');
  state.discount = 75;
  state.news = [{ gid: '11', title: 'Patch 1.1', url: 'https://x/11', contents: '[b]Fixes[/b] bugs', date: 2 }, ...state.news];
  await runTask(plugin, 'tick', ctx);
  const titles = ctx.sent.map((s) => s.message.embeds[0].title);
  assert.deepEqual(titles, ['🏷️ Portal: -75 %', '📰 Portal: Patch 1.1']);
  assert.match(ctx.sent[0].message.embeds[0].description, /~~€9\.99~~ → \*\*€2\.50\*\*/);
  await runTask(plugin, 'tick', ctx);
  assert.equal(ctx.sent.length, 2, 'nothing twice');
});

test('steam-game: price, players, reviews', async () => {
  const ctx = ctxWith({ discount: 50, news: [] });
  const out = await runBlock(plugin, 'game', ctx, { config: { game: 'https://store.steampowered.com/app/400/Portal/' }, interaction: 'h1' });
  assert.equal(out.port, 'replied');
  assert.deepEqual([out.results[''], out.results['.players'], out.results['.discount']], ['Portal', '1234', '50']);
  const fields = ctx.answers[1].message.embeds[0].fields;
  assert.match(fields[2].value, /Overwhelmingly Positive \(98 %/);
  assert.equal((await runBlock(plugin, 'game', ctx, { config: { game: 'nothing here' } })).port, 'not_found');
});
