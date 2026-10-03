import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext, runBlock, runTask } from '#sdk-testing';
import plugin from '../index.js';

const CHANNEL = '900000000000000002';
const permissions = ['storage', 'discord.messages.send', 'scheduler', 'http.outbound'];

const FRIEREN = {
  id: 154587, title: { romaji: 'Sousou no Frieren', english: "Frieren: Beyond Journey's End" }, description: 'An elf <i>mage</i>.<br><br>Story.',
  coverImage: { large: 'https://img.anili.st/frieren.png' }, averageScore: 91, status: 'RELEASING', episodes: 28, genres: ['Adventure', 'Drama', 'Fantasy'],
  format: 'TV', startDate: { year: 2023 }, siteUrl: 'https://anilist.co/anime/154587', nextAiringEpisode: { episode: 5, airingAt: 1 },
};

/** Fake AniList: answers by the query's variables; `next` is the airing episode the Page query returns. */
function anilist(state = { next: 5 }) {
  return {
    'graphql.anilist.co': ({ json }) => {
      const v = json.variables ?? {};
      if (v.ids) return { json: { data: { Page: { media: v.ids.includes(FRIEREN.id) ? [{ ...FRIEREN, nextAiringEpisode: { episode: state.next } }] : [] } } } };
      if (String(v.search).toLowerCase().includes('frieren')) return { json: { data: { Media: { ...FRIEREN, chapters: v.type === 'MANGA' ? 120 : null } } } };
      return { status: 404, json: { errors: [{ message: 'Not Found.' }], data: { Media: null } } };
    },
  };
}

test('search: details as results, port not_found without a match', async () => {
  const ctx = createTestContext({ id: 'plugin_anisearch', permissions, web: anilist() });
  const out = await runBlock(plugin, 'search', ctx, { config: { title: 'frieren', media_type: 'anime' } });
  assert.equal(out.port, 'found');
  assert.equal(out.results[''], "Frieren: Beyond Journey's End");
  assert.equal(out.results['.description'], 'An elf mage.\n\nStory.');
  assert.equal(out.results['.score'], '91/100');
  assert.equal(out.results['.status'], 'Releasing');
  assert.equal(out.results['.genres'], 'Adventure, Drama, Fantasy');
  assert.equal(ctx.web[0].json.variables.type, 'ANIME');

  const manga = await runBlock(plugin, 'search', ctx, { config: { title: 'Frieren', media_type: 'manga' } });
  assert.equal(manga.results['.chapters'], '120');
  assert.equal(ctx.web[1].json.variables.type, 'MANGA');

  assert.equal((await runBlock(plugin, 'search', ctx, { config: { title: 'nothing here' } })).port, 'not_found');
  assert.equal((await runBlock(plugin, 'search', ctx, { config: { title: '  ' } })).port, 'not_found');
});

test('http.outbound is needed and only AniList is reachable', async () => {
  const ctx = createTestContext({ id: 'plugin_anisearch', permissions: ['storage'], web: anilist() });
  await assert.rejects(runBlock(plugin, 'search', ctx, { config: { title: 'frieren' } }), /sdk.call.denied/);
});

test('track / tracked_list / untrack', async () => {
  const noChannel = createTestContext({ id: 'plugin_anisearch', permissions, web: anilist() });
  assert.equal((await runBlock(plugin, 'track', noChannel, { config: { title: 'frieren' } })).port, 'no_channel');

  const ctx = createTestContext({ id: 'plugin_anisearch', permissions, web: anilist(), config: { channel: { id: CHANNEL, guild: '1' } } });
  assert.equal((await runBlock(plugin, 'tracked_list', ctx)).port, 'empty');
  const added = await runBlock(plugin, 'track', ctx, { config: { title: 'frieren' } });
  assert.equal(added.port, 'next');
  assert.equal(added.results['.channel'], `<#${CHANNEL}>`);
  assert.equal((await runBlock(plugin, 'track', ctx, { config: { title: 'Frieren' } })).port, 'already');
  assert.equal((await runBlock(plugin, 'track', ctx, { config: { title: 'unknown show' } })).port, 'not_found');

  const listed = await runBlock(plugin, 'tracked_list', ctx);
  assert.equal(listed.results['.count'], '1');
  assert.match(listed.results[''], /#154587 · next ep\. 5/);

  assert.equal((await runBlock(plugin, 'untrack', ctx, { config: { title: 'one piece' } })).port, 'not_found');
  const removed = await runBlock(plugin, 'untrack', ctx, { config: { title: '#154587' } });
  assert.equal(removed.results[''], "Frieren: Beyond Journey's End");
  assert.equal((await runBlock(plugin, 'tracked_list', ctx)).port, 'empty');
});

test('airing_check: announces the aired episode once, with the settings text and role', async () => {
  const state = { next: 5 };
  const ctx = createTestContext({
    id: 'plugin_anisearch', permissions, web: anilist(state),
    config: { channel: { id: CHANNEL, guild: '1' }, ping_role: { id: '700000000000000007', guild: '1' }, announce_text: 'Ep {episode}: {title}' },
  });
  await runBlock(plugin, 'track', ctx, { config: { title: 'frieren' } });
  await runTask(plugin, 'airing_check', ctx);
  assert.equal(ctx.sent.length, 0, 'nothing new yet');

  state.next = 6;
  await runTask(plugin, 'airing_check', ctx);
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].channelId, CHANNEL);
  assert.equal(ctx.sent[0].message.content, '<@&700000000000000007>');
  assert.equal(ctx.sent[0].message.embeds[0].description, "Ep 5: Frieren: Beyond Journey's End");

  await runTask(plugin, 'airing_check', ctx);
  assert.equal(ctx.sent.length, 1, 'no double announcement');
  assert.equal(ctx.web.at(-1).json.variables.ids.length, 1, 'one request for all tracked anime');
});

test('airing_today: episodes of the day in the time zone, Discord timestamps, adult titles left out', async () => {
  const seen = [];
  const web = {
    'graphql.anilist.co': ({ json }) => {
      seen.push(json.variables);
      return { json: { data: { Page: { pageInfo: { hasNextPage: false }, airingSchedules: [
        { episode: 5, airingAt: 1759500000, media: { ...FRIEREN, isAdult: false } },
        { episode: 1, airingAt: 1759510000, media: { id: 9, title: { romaji: 'Hidden' }, siteUrl: 'https://anilist.co/anime/9', isAdult: true } },
      ] } } } };
    },
  };
  const ctx = createTestContext({ id: 'plugin_anisearch', permissions, web, config: { timezone: 'Europe/Berlin' } });
  const out = await runBlock(plugin, 'airing_today', ctx, { config: {} });
  assert.equal(out.port, 'next');
  assert.equal(out.results['.count'], '1');
  assert.equal(out.results[''], "<t:1759500000:t> [Frieren: Beyond Journey's End](https://anilist.co/anime/154587) · Ep. 5");
  // One request for one local day (23 to 25 hours, DST included).
  assert.ok(seen.length === 1 && seen[0].end - seen[0].start >= 23 * 3600 && seen[0].end - seen[0].start <= 25 * 3600 + 1);

  const empty = createTestContext({ id: 'plugin_anisearch', permissions, web: { 'graphql.anilist.co': () => ({ json: { data: { Page: { pageInfo: { hasNextPage: false }, airingSchedules: [] } } } }) } });
  assert.equal((await runBlock(plugin, 'airing_today', empty, { config: {} })).port, 'empty');
});

test('dayRange: local midnight to midnight, unknown zone = UTC', async () => {
  const { dayRange } = await import('../services/anilist.js');
  // 2026-10-03 21:30 UTC is 23:30 in Berlin (UTC+2): the Berlin day starts 2026-10-02 22:00 UTC.
  const berlin = dayRange(new Date(Date.UTC(2026, 9, 3, 21, 30)), 'Europe/Berlin');
  assert.equal(berlin.start, Date.UTC(2026, 9, 2, 22) / 1000);
  assert.equal(berlin.end, Date.UTC(2026, 9, 3, 22) / 1000);
  // 2026-10-25: DST ends in Berlin, the day has 25 hours.
  const dst = dayRange(new Date(Date.UTC(2026, 9, 25, 12)), 'Europe/Berlin');
  assert.equal(dst.end - dst.start, 25 * 3600);
  const bad = dayRange(new Date(Date.UTC(2026, 9, 3, 21, 30)), 'Mars/Base');
  assert.equal(bad.zone, 'UTC');
  assert.equal(bad.start, Date.UTC(2026, 9, 3) / 1000);
});
