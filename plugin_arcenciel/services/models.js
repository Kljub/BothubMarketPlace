// Service "models": /arc-models lists the checkpoints Arc en Ciel offers
// (GET /options, modelDetails.checkpoints; with a search term GET
// /models/checkpoints?q=) and lets a member pick one for their own images.
// The pick is stored per server and member ("model:<guild>:<user>") and wins
// over the checkpoint of the settings page; "Server default" removes it.
// The list a member sees is kept for the select menu ("models:<user>"),
// because Discord only carries short values.
import { API, ArcError, call } from './arc.js';

export const PAGE = 25;
const OPTIONS_MS = 10 * 60_000;
let optionsCache = null;

/** Every checkpoint of the generator: { name, label, base }. */
export async function allCheckpoints(ctx, now = Date.now()) {
  if (optionsCache && now - optionsCache.at < OPTIONS_MS) return optionsCache.list;
  const res = await call(ctx, { url: `${API}/options` });
  const details = res.json?.modelDetails?.checkpoints;
  let list = Array.isArray(details)
    ? details.filter((c) => c && typeof c.name === 'string' && c.name).map((c) => ({ name: c.name, label: String(c.displayName || c.name), base: String(c.baseModel ?? '') }))
    : [];
  if (!list.length && Array.isArray(res.json?.models?.checkpoints)) {
    list = res.json.models.checkpoints.map(String).filter(Boolean).map((name) => ({ name, label: name, base: '' }));
  }
  list.sort((a, b) => a.label.localeCompare(b.label));
  optionsCache = { at: now, list };
  return list;
}

/** Checkpoints matching a search term (Arc en Ciel's catalogue search). */
export async function searchCheckpoints(ctx, query) {
  const q = encodeURIComponent(String(query).trim().slice(0, 100));
  const res = await call(ctx, { url: `${API}/models/checkpoints?q=${q}&limit=${PAGE}` });
  const entries = Array.isArray(res.json?.entries) ? res.json.entries : [];
  return entries
    .filter((e) => e && typeof e.name === 'string' && e.name)
    .map((e) => ({ name: e.name, label: [e.modelTitle, e.versionName].filter(Boolean).join(' · ') || e.name, base: String(e.baseModel ?? '') }));
}

const pickKey = (guildId, userId) => `model:${guildId || 'dm'}:${userId}`;

/** The member's own model, or '' (then the settings page decides). */
export async function userModel(ctx, guildId, userId) {
  if (!userId) return '';
  return String((await ctx.storage.get(pickKey(guildId, userId))) ?? '');
}

export async function setUserModel(ctx, guildId, userId, name) {
  if (name) await ctx.storage.set(pickKey(guildId, userId), String(name).slice(0, 300));
  else await ctx.storage.delete(pickKey(guildId, userId));
}

/** The list of one member (for the select menu); query: the search term or ''. */
async function saveList(ctx, userId, query, names) {
  await ctx.storage.set(`models:${userId}`, JSON.stringify({ query, names: names.slice(0, 2000) }));
}

async function loadList(ctx, userId) {
  try {
    return JSON.parse((await ctx.storage.get(`models:${userId}`)) ?? 'null');
  } catch {
    return null;
  }
}

/** The private answer: one page of models, a select menu and page buttons. */
export function modelsMessage({ list, page, query, current, color }) {
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = list.slice(p * PAGE, (p + 1) * PAGE);
  const line = (m, i) => `${p * PAGE + i + 1}. ${m.name === current ? '✅ ' : ''}**${m.label.slice(0, 80)}**${m.base ? ` · ${m.base}` : ''}`;
  const head = current ? `Your model: **${current.slice(0, 100)}**` : 'Your model: the server default.';
  const embed = {
    color,
    title: query ? `🎨 Models for "${query.slice(0, 60)}" (${list.length})` : `🎨 Arc en Ciel models (${list.length})`,
    description: `${head}\n\n${slice.map(line).join('\n') || 'No models found.'}`.slice(0, 4096),
    footer: pages > 1 ? `Page ${p + 1} of ${pages} · pick one below` : 'Pick one below',
  };
  const components = [];
  if (slice.length) {
    components.push([{
      type: 'select',
      key: 'models_pick',
      data: String(p),
      placeholder: 'Choose your model …',
      options: slice.map((m, i) => ({
        label: m.label.slice(0, 100),
        value: String(p * PAGE + i),
        description: (m.base ? `${m.base} · ${m.name}` : m.name).slice(0, 100),
        default: m.name === current,
      })),
    }]);
  }
  const nav = [];
  if (pages > 1) {
    nav.push({ key: 'models_page', data: String(p - 1), label: 'Back', emoji: '◀️', style: 'secondary', disabled: p === 0 });
    nav.push({ key: 'models_page', data: String(p + 1), label: 'Next', emoji: '▶️', style: 'secondary', disabled: p >= pages - 1 });
  }
  nav.push({ key: 'models_reset', data: 'x', label: 'Server default', emoji: '↩️', style: 'secondary', disabled: !current });
  components.push(nav);
  return { embeds: [embed], components };
}

/** Builds the list for a member (search or all) and remembers it. */
export async function listFor(ctx, userId, query) {
  const list = query ? await searchCheckpoints(ctx, query) : await allCheckpoints(ctx);
  await saveList(ctx, userId, query, list.map((m) => m.name));
  return list;
}

/** The list a member saw, back from the stored names (labels from the cache when possible). */
async function savedList(ctx, userId) {
  const saved = await loadList(ctx, userId);
  if (!saved) return null;
  let known = [];
  try {
    known = saved.query ? [] : await allCheckpoints(ctx);
  } catch {
    known = [];
  }
  const byName = new Map(known.map((m) => [m.name, m]));
  return { query: saved.query, list: saved.names.map((name) => byName.get(name) ?? { name, label: name, base: '' }) };
}

/** Select menu: stores the picked model. */
export async function pickModel(ctx, ev, color) {
  const saved = await savedList(ctx, ev.user.id);
  const index = Number(ev.values?.[0]);
  const model = saved?.list[index];
  if (!saved || !model) {
    await ctx.interaction.reply(ev.handle, '❌ This list is out of date. Run /arc-models again.', { ephemeral: true });
    return;
  }
  await setUserModel(ctx, ev.guildId, ev.user.id, model.name);
  await ctx.interaction.update(ev.handle, modelsMessage({ list: saved.list, page: Math.floor(index / PAGE), query: saved.query, current: model.name, color }));
  await ctx.interaction.followUp(ev.handle, `✅ Your images now use **${model.label.slice(0, 100)}**.`, { ephemeral: true });
}

/** Back / Next. */
export async function pageModels(ctx, ev, color) {
  const saved = await savedList(ctx, ev.user.id);
  if (!saved) {
    await ctx.interaction.reply(ev.handle, '❌ This list is out of date. Run /arc-models again.', { ephemeral: true });
    return;
  }
  const current = await userModel(ctx, ev.guildId, ev.user.id);
  await ctx.interaction.update(ev.handle, modelsMessage({ list: saved.list, page: Number(ev.data) || 0, query: saved.query, current, color }));
}

/** Server default: removes the member's own model. */
export async function resetModel(ctx, ev, color) {
  await setUserModel(ctx, ev.guildId, ev.user.id, '');
  const saved = await savedList(ctx, ev.user.id);
  if (saved) await ctx.interaction.update(ev.handle, modelsMessage({ list: saved.list, page: 0, query: saved.query, current: '', color }));
  await ctx.interaction.followUp(ev.handle, '↩️ Your images use the server default model again.', { ephemeral: true });
}

export { ArcError };
