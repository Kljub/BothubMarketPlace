// Service "flow": loads a game from storage, runs one change under a lock,
// lets bots and windows move on (auto.js), saves, and refreshes the table.
// Storage: "g:<id>" the game (JSON, < 16 KB), "games" the open game IDs,
// "c:<channel>" the game of a channel, "l:<id>" / "lt:<id>" the lock.
import { settle } from './auto.js';
import { GameError, DEFAULTS } from './engine.js';
import { t } from './i18n.js';
import { readJson, writeJson } from './storage.js';
import { setting } from './util.js';
import { tableMessage } from './view.js';

const LOCK_MS = 10_000;

/** The game settings of the dashboard, read when a table opens. */
export function gameConfig(ctx) {
  const num = (key, fallback, min, max) => {
    const n = Math.floor(Number(setting(ctx, key, fallback)));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return {
    kingsToWin: num('kings_to_win', DEFAULTS.kingsToWin, 1, 7),
    maxShips: num('max_ships', DEFAULTS.maxShips, 2, 5),
    crystals: setting(ctx, 'crystals', true) !== false,
    crystalsStart: num('crystals_start', DEFAULTS.crystalsStart, 0, 30),
    crystalsTurn: num('crystals_turn', DEFAULTS.crystalsTurn, 1, 30),
    crystalsMax: num('crystals_max', DEFAULTS.crystalsMax, 3, 30),
    short: setting(ctx, 'short_game', false) === true,
    promo: setting(ctx, 'promo_cards', false) === true,
    denySec: num('deny_seconds', DEFAULTS.denySec, 5, 120),
    saluteSec: num('salute_seconds', DEFAULTS.saluteSec, 5, 60),
    turnMin: num('turn_minutes', DEFAULTS.turnMin, 1, 30),
  };
}

export const lang = (ctx) => (setting(ctx, 'language', 'en') === 'de' ? 'de' : 'en');
export const env = (now = Date.now()) => ({ rng: Math.random, now });

export async function loadGame(ctx, id) {
  return readJson(ctx, `g:${id}`, null);
}

export async function saveGame(ctx, g) {
  await writeJson(ctx, `g:${g.id}`, g);
}

export async function dropGame(ctx, g) {
  await ctx.storage.delete(`g:${g.id}`);
  if (g.channel && (await ctx.storage.get(`c:${g.channel}`)) === g.id) await ctx.storage.delete(`c:${g.channel}`);
  await writeJson(ctx, 'games', (await readJson(ctx, 'games', [])).filter((x) => x !== g.id));
}

export async function listGames(ctx) {
  return readJson(ctx, 'games', []);
}

/** Lock per game, so two clicks at once do not overwrite each other. A lock older than 10 s is stale. */
async function lock(ctx, id) {
  const n = await ctx.storage.increment(`l:${id}`);
  if (n === 1) {
    await ctx.storage.set(`lt:${id}`, String(Date.now()));
    return true;
  }
  const since = Number(await ctx.storage.get(`lt:${id}`)) || 0;
  if (Date.now() - since > LOCK_MS) {
    await ctx.storage.set(`lt:${id}`, String(Date.now()));
    return true;
  }
  return false;
}

async function unlock(ctx, id) {
  await ctx.storage.delete(`l:${id}`);
  await ctx.storage.delete(`lt:${id}`);
}

/**
 * Runs fn(g, e) on the stored game, then settles (bots, windows), saves and
 * refreshes the table message (unless table: false, when the click updates
 * the table itself). touch: false keeps the idle clock (timed moves). Throws GameError('err.gone' | 'err.busy').
 */
export async function withGame(ctx, id, fn, { table = true, touch = true } = {}) {
  if (!(await lock(ctx, id))) throw new GameError('err.busy');
  try {
    const g = await loadGame(ctx, id);
    if (!g) throw new GameError('err.gone');
    const e = env();
    const result = await fn(g, e);
    if (g.phase === 'play') settle(g, e);
    if (touch) g.at = e.now;
    if (g.phase === 'over' || g.phase === 'closed') await dropGame(ctx, g);
    else await saveGame(ctx, g);
    if (table) await refreshTable(ctx, g);
    return { g, result };
  } finally {
    await unlock(ctx, id);
  }
}

export async function refreshTable(ctx, g) {
  if (!g.channel || !g.msg) return;
  try {
    await ctx.message.edit(g.channel, g.msg, tableMessage(g));
  } catch (err) {
    await ctx.logger.warn(`table ${g.id}: ${err?.message ?? err}`);
  }
}

/** Translated text of an error for the player; unknown errors are rethrown. */
export function errorText(g, ctx, err) {
  if (err instanceof GameError) return `❌ ${t(g?.lang ?? lang(ctx), err.key, err.params)}`;
  throw err;
}
