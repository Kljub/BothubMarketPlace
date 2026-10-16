// Logic of the Jellyfin nodes (plugin.plugin_jellyfin.<name>); nodes/<name>.js hand it to the SDK, nodes/<name>.json defines it.
import { account, startLink, unlink } from './accounts.js';
import { allowedLibraries, errorText, itemResults, jellyseerr, libraryNames, normId, poster, randomItem, searchLibraries, sections, servers, sessions, showRef, watchedGenres } from './jellyfin.js';
import { readJson, writeJson } from './storage.js';
import * as fav from './favorites.js';
import { setting } from './util.js';

const COLOR = '#aa5cc3';
const userOf = (vars, config) => String(config.user || vars['user.id'] || '');
const guildOf = (vars) => String(vars['server.id'] || '');

/** State of the connected Jellyfin servers: ports online (at least one answers) / offline. */
export async function status(ctx, { config, vars }) {
  const list = await servers(ctx);
  const acc = await account(ctx, userOf(vars, config));
  const linked = acc ? `Linked as ${acc.username}` : 'Not linked (/jellyfin-link)';
  const up = list.filter((s) => s.ok);
  const lines = list.map((s) => `${s.ok ? '🟢' : '🔴'} ${s.name}${s.ok ? ` · ${s.version}` : ` · ${errorText(s)}`}`).join('\n');
  if (!up.length) return { port: 'offline', results: { '': errorText(list[0]), '.linked': linked, '.servers': lines } };
  const s = await sessions(ctx);
  return {
    port: 'online',
    results: {
      '': up.length === list.length ? 'Online' : `${up.length}/${list.length} online`, '.version': up[0].version, '.playing': String(s.ok ? s.sessions.length : 0),
      '.libraries': String(allowedLibraries(ctx).length), '.linked': linked, '.jellyseerr': setting(ctx, 'jellyseerr', false) ? 'On' : 'Off',
      '.servers': lines,
    },
  };
}

/** Active playbacks in the shared libraries: ports next / empty / failed. */
export async function now_playing(ctx) {
  const s = await sessions(ctx);
  if (!s.ok) return { port: 'failed', results: { '': errorText(s) } };
  if (!s.sessions.length) return { port: 'empty', results: { '.count': '0' } };
  const lines = s.sessions.map((x) => `▶️ **${x.title}**${x.year ? ` (${x.year})` : ''} · ${x.user}${x.state === 'paused' ? ' ⏸' : ''}`);
  return { results: { '': lines.join('\n').slice(0, 4000), '.count': String(s.sessions.length) } };
}

/** First hit for a title in the shared libraries: ports found / not_found / failed (replied with a command). */
export async function search(ctx, { config, interaction }) {
  const title = String(config.title ?? '').trim();
  if (!title) return { port: 'not_found' };
  const res = await searchLibraries(ctx, title);
  if (!res.ok) return { port: 'failed', results: { '': errorText(res) } };
  const exact = res.items.find((i) => i.title.toLowerCase() === title.toLowerCase());
  const item = exact ?? res.items[0];
  if (!item) return { port: 'not_found' };
  const results = { ...itemResults(item, item.library), '.more': String(Math.max(0, res.items.length - 1)) };
  // With a command behind the run the node answers itself, with the poster.
  if (interaction) {
    const file = await poster(ctx, item);
    await ctx.interaction.reply(interaction, searchMessage(results, Boolean(file)), file ? { file: file.name } : undefined);
    if (file) await ctx.files.delete(file.name).catch(() => undefined);
    return { port: 'replied', results };
  }
  return { port: 'found', results };
}

/** The search answer: details and the poster (when loaded) on the right. */
export function searchMessage(r, withPoster) {
  return {
    embeds: [{
      color: COLOR, title: `🔍 ${r['']}`, description: r['.summary'],
      fields: [{ name: 'Year', value: r['.year'], inline: true }, { name: 'Rating', value: r['.rating'], inline: true }, { name: 'Duration', value: r['.duration'], inline: true }, { name: 'Genres', value: r['.genres'] }],
      footer: { text: `Jellyfin · ${r['.library']}` },
      ...(withPoster ? { thumbnail_url: 'attachment' } : {}),
    }],
  };
}

/** The embed and the "again" button of a random pick. */
function randomMessage(item, state) {
  return {
    embeds: [{ color: COLOR, title: `🎲 ${item.title}${item.year ? ` (${item.year})` : ''}`, description: item.summary || '—', fields: item.genres.length ? [{ name: 'Genres', value: item.genres.slice(0, 5).join(', '), inline: true }] : [] }],
    components: [[{ key: 'reroll', data: state, label: 'Again', emoji: '🎲', style: 'secondary' }]],
  };
}

/**
 * A random title (library, genre, unwatched only: unwatched by the linked
 * member). With a command behind the run the node answers itself, with an
 * "Again" button (port replied); otherwise the results go on (port next).
 * Ports: next, replied, empty, failed.
 */
export async function random(ctx, { config, vars, interaction }) {
  const acc = await account(ctx, userOf(vars, config));
  const opts = { library: String(config.library ?? ''), genre: String(config.genre ?? ''), unwatched: [true, 'true', 'yes'].includes(config.unwatched), userId: acc?.userId ?? '' };
  const res = await randomItem(ctx, opts);
  if (!res.ok) return { port: 'failed', results: { '': res.error === 'no_libraries' ? 'No library is shared yet (plugin page → Libraries).' : errorText(res) } };
  if (!res.item) return { port: 'empty' };
  if (interaction) {
    const state = ctx.utils.uuid().slice(0, 12);
    await writeJson(ctx, `rnd:${state}`, { ...opts, last: res.item.key, at: Date.now() });
    await ctx.interaction.reply(interaction, randomMessage(res.item, state));
    return { port: 'replied', results: itemResults(res.item) };
  }
  return { results: itemResults(res.item) };
}

/** Button "Again" of a random pick: a new title in the same message. */
export async function reroll(ctx, ev) {
  const state = await readJson(ctx, `rnd:${ev.data}`, null);
  if (!state) {
    await ctx.interaction.reply(ev.handle, 'This pick is too old. Run the command again.', { ephemeral: true });
    return;
  }
  const res = await randomItem(ctx, { ...state, exclude: state.last });
  if (!res.ok || !res.item) {
    await ctx.interaction.update(ev.handle, { content: '🎲 Nothing else found.', embeds: [], components: [] });
    return;
  }
  await writeJson(ctx, `rnd:${ev.data}`, { ...state, last: res.item.key, at: Date.now() });
  await ctx.interaction.update(ev.handle, randomMessage(res.item, ev.data));
}

/** Unwatched pick in the member's favourite genre (their watch history): ports next / not_linked / empty / failed. */
export async function recommend(ctx, { config, vars }) {
  const acc = await account(ctx, userOf(vars, config));
  if (!acc) return { port: 'not_linked' };
  const watched = await watchedGenres(ctx, acc.server, acc.userId);
  if (!watched.ok) return { port: 'failed', results: { '': errorText(watched) } };
  const genre = Object.entries(watched.counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  let res = await randomItem(ctx, { genre, unwatched: true, userId: acc.userId });
  // The favourite genre may not be in the shared libraries: any unwatched title then.
  if (res.ok && !res.item && genre) res = await randomItem(ctx, { unwatched: true, userId: acc.userId });
  if (!res.ok) return { port: 'failed', results: { '': errorText(res) } };
  if (!res.item) return { port: 'empty' };
  return { results: { ...itemResults(res.item), '.genre': genre || '—' } };
}

/** Jellyseerr request for the first search hit: ports next / not_found / not_linked / not_configured / failed. */
export async function request(ctx, { config, vars }) {
  if (!setting(ctx, 'jellyseerr', false)) return { port: 'not_configured' };
  const userId = userOf(vars, config);
  const acc = await account(ctx, userId);
  if (!acc) return { port: 'not_linked' };
  const found = await jellyseerr(ctx, 'GET', '/search', { query: { query: String(config.title ?? '').slice(0, 100) } });
  if (!found.ok) return { port: 'failed', results: { '': errorText(found) } };
  const hit = (found.json.results ?? []).find((r) => r.mediaType === 'movie' || r.mediaType === 'tv');
  if (!hit) return { port: 'not_found' };
  const users = await jellyseerr(ctx, 'GET', '/user', { query: { take: '100' } });
  const match = users.ok ? (users.json.results ?? []).find((u) => normId(u.jellyfinUserId) === acc.userId || String(u.jellyfinUsername ?? '').toLowerCase() === acc.username.toLowerCase()) : null;
  const body = { mediaType: hit.mediaType, mediaId: hit.id, ...(hit.mediaType === 'tv' ? { seasons: 'all' } : {}), ...(match ? { userId: match.id } : {}) };
  const made = await jellyseerr(ctx, 'POST', '/request', { json: body });
  if (!made.ok) return { port: 'failed', results: { '': errorText(made) } };
  const title = String(hit.title ?? hit.name ?? 'Unknown');
  if (made.json?.id != null) await ctx.storage.set(`req:${made.json.id}`, userId);
  return { results: { '': title, '.type': hit.mediaType, '.id': String(made.json?.id ?? '') } };
}

/** Starts linking with Quick Connect: results = server name, .code = the code. Ports next / already. */
export async function link(ctx, { config, vars }) {
  const userId = userOf(vars, config);
  const acc = await account(ctx, userId);
  if (acc) return { port: 'already', results: { '': acc.username } };
  const { code, serverName } = await startLink(ctx, userId, guildOf(vars), Number(config.server) || 1);
  return { results: { '': serverName, '.code': code } };
}

/** Removes the link (and the linked role): ports next / not_linked. */
export async function unlink_account(ctx, { config, vars }) {
  const userId = userOf(vars, config);
  const acc = await unlink(ctx, userId);
  if (!acc) return { port: 'not_linked' };
  const role = setting(ctx, 'linked_role', null);
  const guild = guildOf(vars);
  if (role?.id && guild) await ctx.role.removeFromMember(guild, userId, role.id, 'Jellyfin account unlinked').catch(() => undefined);
  return { results: { '': acc.username } };
}

/** The Jellyfin libraries of every server with their IDs: ports next / failed. */
export async function libraries(ctx) {
  const res = await sections(ctx);
  if (!res.ok) return { port: 'failed', results: { '': errorText(res) } };
  const allowed = allowedLibraries(ctx);
  const many = res.servers > 1;
  const lines = res.sections.map((s) => `${allowed.includes(s.id) ? '✅' : '➖'} **${s.title}** (${s.type})${many ? ` · ${s.serverName}` : ''} · ID \`${showRef(s.id)}\``);
  return { results: { '': lines.join('\n').slice(0, 4000) || '—', '.count': String(res.sections.length) } };
}

const favError = (res) => (res.error === 'not_linked' ? 'not_linked' : 'failed');
const favText = (res) => (res.error?.startsWith('http_') ? `Jellyfin answered with HTTP ${res.error.slice(5)}.` : errorText(res));

/** The member's favorites: ports next / empty / not_linked / failed. */
export async function favorites(ctx, { config, vars }) {
  const res = await fav.list(ctx, userOf(vars, config));
  if (res.error) return { port: favError(res), results: { '': favText(res) } };
  if (!res.items.length) return { port: 'empty', results: { '.count': '0' } };
  const lines = res.items.slice(0, 40).map((i) => `${i.type === 'Series' ? '📺' : '🎬'} **${i.title}**${i.year ? ` (${i.year})` : ''}`);
  if (res.items.length > 40) lines.push(`… +${res.items.length - 40}`);
  return { results: { '': lines.join('\n').slice(0, 4000), '.count': String(res.items.length) } };
}

/** Adds the first hit for a title to the favorites: ports added / not_found / not_linked / failed. */
export async function favorites_add(ctx, { config, vars }) {
  const title = String(config.title ?? '').trim();
  if (!title) return { port: 'not_found' };
  const found = await fav.find(ctx, userOf(vars, config), title);
  if (found.error === 'not_found') return { port: 'not_found' };
  if (found.error) return { port: favError(found), results: { '': favText(found) } };
  const done = await fav.change(ctx, found.account, found.item.key, true);
  if (done.error) return { port: favError(done), results: { '': favText(done) } };
  return { port: 'added', results: { '': found.item.title, '.year': found.item.year || '—' } };
}

/** Removes a title from the favorites (matched by name): ports removed / not_listed / not_linked / failed. */
export async function favorites_remove(ctx, { config, vars }) {
  const title = String(config.title ?? '').trim().toLowerCase();
  const res = await fav.list(ctx, userOf(vars, config));
  if (res.error) return { port: favError(res), results: { '': favText(res) } };
  const hit = res.items.find((i) => i.title.toLowerCase() === title) ?? res.items.find((i) => title && i.title.toLowerCase().includes(title));
  if (!hit) return { port: 'not_listed' };
  const done = await fav.change(ctx, res.account, hit.key, false);
  if (done.error) return { port: favError(done), results: { '': favText(done) } };
  return { port: 'removed', results: { '': hit.title, '.year': hit.year || '—' } };
}

export { libraryNames };
