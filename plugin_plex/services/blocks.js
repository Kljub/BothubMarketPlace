// Logic of the Plex nodes (plugin.plugin_plex.<name>); nodes/<name>.js hand it to the SDK, nodes/<name>.json defines it.
import { account, startLink, unlink } from './accounts.js';
import { allowedLibraries, errorText, itemResults, overseerr, plex, randomItem, searchLibraries, sections, sessions } from './plex.js';
import { readJson, writeJson } from './storage.js';
import { setting } from './util.js';

const userOf = (vars, config) => String(config.user || vars['user.id'] || '');
const guildOf = (vars) => String(vars['server.id'] || '');

/** Plex server state: ports online / offline. */
export async function status(ctx, { config, vars }) {
  const id = await plex(ctx, '/identity');
  const acc = await account(ctx, userOf(vars, config));
  const linked = acc ? `Linked as ${acc.username}` : 'Not linked (/plex-link)';
  if (!id.ok) return { port: 'offline', results: { '': errorText(id), '.linked': linked } };
  const s = await sessions(ctx);
  return {
    port: 'online',
    results: {
      '': 'Online', '.version': String(id.json?.MediaContainer?.version ?? '?'), '.playing': String(s.ok ? s.sessions.length : 0),
      '.libraries': String(allowedLibraries(ctx).length), '.linked': linked, '.overseerr': setting(ctx, 'overseerr', false) ? 'On' : 'Off',
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

/** First hit for a title in the shared libraries: ports found / not_found / failed. */
export async function search(ctx, { config }) {
  const title = String(config.title ?? '').trim();
  if (!title) return { port: 'not_found' };
  const res = await searchLibraries(ctx, title);
  if (!res.ok) return { port: 'failed', results: { '': errorText(res) } };
  const exact = res.items.find((i) => i.title.toLowerCase() === title.toLowerCase());
  const item = exact ?? res.items[0];
  if (!item) return { port: 'not_found' };
  return { port: 'found', results: { ...itemResults(item), '.more': String(Math.max(0, res.items.length - 1)) } };
}

/** The embed and the "again" button of a random pick. */
function randomMessage(item, state) {
  return {
    embeds: [{ color: '#e5a00d', title: `🎲 ${item.title}${item.year ? ` (${item.year})` : ''}`, description: item.summary || '—', fields: item.genres.length ? [{ name: 'Genres', value: item.genres.slice(0, 5).join(', '), inline: true }] : [] }],
    components: [[{ key: 'reroll', data: state, label: 'Again', emoji: '🎲', style: 'secondary' }]],
  };
}

/**
 * A random title (library, genre, unwatched only). With a command behind the
 * run the node answers itself, with an "Again" button (port replied);
 * otherwise the results go on (port next). Ports: next, replied, empty, failed.
 */
export async function random(ctx, { config, interaction }) {
  const opts = { library: String(config.library ?? ''), genre: String(config.genre ?? ''), unwatched: [true, 'true', 'yes'].includes(config.unwatched) };
  const res = await randomItem(ctx, opts);
  if (!res.ok) return { port: 'failed', results: { '': res.error === 'no_libraries' ? 'No library is shared yet (plugin page → Libraries).' : errorText(res) } };
  if (!res.item) return { port: 'empty' };
  // interaction is only set when the bot allows discord.interactions for this plugin.
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

/** Unwatched pick in the member's favourite genre (watch history): ports next / not_linked / empty / failed. */
export async function recommend(ctx, { config, vars }) {
  const acc = await account(ctx, userOf(vars, config));
  if (!acc) return { port: 'not_linked' };
  const hist = await plex(ctx, '/status/sessions/history/all', { sort: 'viewedAt:desc', 'X-Plex-Container-Size': '50' });
  if (!hist.ok) return { port: 'failed', results: { '': errorText(hist) } };
  const counts = {};
  for (const h of hist.json?.MediaContainer?.Metadata ?? []) {
    if (String(h.User?.title ?? h.accountTitle ?? '').toLowerCase() !== acc.username.toLowerCase() && h.accountID != null && String(h.accountID) !== acc.uuid) continue;
    for (const g of h.Genre ?? []) counts[g.tag] = (counts[g.tag] ?? 0) + 1;
  }
  const genre = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const res = await randomItem(ctx, { genre, unwatched: true });
  if (!res.ok) return { port: 'failed', results: { '': errorText(res) } };
  if (!res.item) return { port: 'empty' };
  return { results: { ...itemResults(res.item), '.genre': genre || '—' } };
}

/** Overseerr request for the first search hit: ports next / not_found / not_linked / not_configured / failed. */
export async function request(ctx, { config, vars }) {
  if (!setting(ctx, 'overseerr', false)) return { port: 'not_configured' };
  const userId = userOf(vars, config);
  const acc = await account(ctx, userId);
  if (!acc) return { port: 'not_linked' };
  const found = await overseerr(ctx, 'GET', '/search', { query: { query: String(config.title ?? '').slice(0, 100) } });
  if (!found.ok) return { port: 'failed', results: { '': errorText(found) } };
  const hit = (found.json.results ?? []).find((r) => r.mediaType === 'movie' || r.mediaType === 'tv');
  if (!hit) return { port: 'not_found' };
  const users = await overseerr(ctx, 'GET', '/user', { query: { take: '100' } });
  const match = users.ok ? (users.json.results ?? []).find((u) => (acc.uuid && String(u.plexId ?? '') === acc.uuid) || (acc.email && u.email === acc.email) || String(u.plexUsername ?? '').toLowerCase() === acc.username.toLowerCase()) : null;
  const body = { mediaType: hit.mediaType, mediaId: hit.id, ...(hit.mediaType === 'tv' ? { seasons: 'all' } : {}), ...(match ? { userId: match.id } : {}) };
  const made = await overseerr(ctx, 'POST', '/request', { json: body });
  if (!made.ok) return { port: 'failed', results: { '': errorText(made) } };
  const title = String(hit.title ?? hit.name ?? 'Unknown');
  if (made.json?.id != null) await ctx.storage.set(`req:${made.json.id}`, userId);
  return { results: { '': title, '.type': hit.mediaType, '.id': String(made.json?.id ?? '') } };
}

/** Starts linking a Plex account: results = login URL. Ports next / already. */
export async function link(ctx, { config, vars }) {
  const userId = userOf(vars, config);
  const acc = await account(ctx, userId);
  if (acc) return { port: 'already', results: { '': acc.username } };
  const url = await startLink(ctx, userId, guildOf(vars));
  return { results: { '': url } };
}

/** Removes the link (and the linked role): ports next / not_linked. */
export async function unlink_account(ctx, { config, vars }) {
  const userId = userOf(vars, config);
  const acc = await unlink(ctx, userId);
  if (!acc) return { port: 'not_linked' };
  const role = setting(ctx, 'linked_role', null);
  const guild = guildOf(vars);
  if (role?.id && guild) await ctx.role.removeFromMember(guild, userId, role.id, 'Plex account unlinked').catch(() => undefined);
  return { results: { '': acc.username } };
}

/** The Plex libraries with their IDs (for the settings page): ports next / failed. */
export async function libraries(ctx) {
  const res = await sections(ctx);
  if (!res.ok) return { port: 'failed', results: { '': errorText(res) } };
  const allowed = allowedLibraries(ctx);
  const lines = res.sections.map((s) => `${allowed.includes(s.id) ? '✅' : '➖'} **${s.title}** (${s.type}) · ID \`${s.id}\``);
  return { results: { '': lines.join('\n').slice(0, 4000) || '—', '.count': String(res.sections.length) } };
}
