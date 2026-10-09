// Buttons and selects. Table buttons (lobby, Deny window, salute) update the
// public table; hand buttons update the player's ephemeral panel and edit
// the table message. Data: "<gameId>:<args>".
import {
  GameError, abandon, addPlayer, anchor, buyShip, build, canAttack, declare, deny, endTurn, findShip, moveCrew, pass, pick, removePlayer, resolvePending, salute, startGame, surrender, unbuild,
} from './engine.js';
import { errorText, loadGame, withGame } from './flow.js';
import { t } from './i18n.js';
import { handPanel, rulesMessage, tableMessage } from './view.js';

const parts = (ev) => String(ev.data ?? '').split(':');
const value = (ev) => String(ev.values?.[0] ?? '');
const ephemeral = (ctx, ev, message) => ctx.interaction.reply(ev.handle, message, { ephemeral: true });

function seat(g, userId) {
  const i = g.players.findIndex((p) => !p.bot && p.id === userId);
  if (i < 0) throw new GameError('err.not_playing');
  return i;
}

// ---------- table buttons ----------

async function tableAction(ctx, ev, fn) {
  const [id] = parts(ev);
  let g = null;
  try {
    ({ g } = await withGame(ctx, id, (game, e) => fn(game, e), { table: false }));
    await ctx.interaction.update(ev.handle, tableMessage(g));
  } catch (err) {
    await ephemeral(ctx, ev, errorText(g ?? (await loadGame(ctx, id).catch(() => null)), ctx, err));
  }
}

function hostOnly(g, ev) {
  if (g.host !== ev.user.id) throw new GameError('err.host');
}

// ---------- hand panel ----------

/** Shows the panel without a change (view switches, first steps of a choice). */
async function show(ctx, ev, view, note = '') {
  const [id] = parts(ev);
  const g = await loadGame(ctx, id);
  if (!g) return ctx.interaction.update(ev.handle, { content: t('en', 'err.gone'), embeds: [], components: [] });
  try {
    return ctx.interaction.update(ev.handle, handPanel(g, seat(g, ev.user.id), view, note));
  } catch (err) {
    return ephemeral(ctx, ev, errorText(g, ctx, err));
  }
}

/** Runs a move of the player and shows the panel again (with the error on top when it failed). */
async function move(ctx, ev, fn, after = { name: 'main' }) {
  const [id, ...args] = parts(ev);
  try {
    const { g, result } = await withGame(ctx, id, (game, e) => fn(game, e, seat(game, ev.user.id), args));
    await ctx.interaction.update(ev.handle, handPanel(g, seat(g, ev.user.id), result?.view ?? after, result?.note ?? ''));
  } catch (err) {
    const g = await loadGame(ctx, id).catch(() => null);
    const text = errorText(g, ctx, err);
    const i = g ? g.players.findIndex((p) => !p.bot && p.id === ev.user.id) : -1;
    if (g && i >= 0) await ctx.interaction.update(ev.handle, handPanel(g, i, after.name === 'main' ? after : { name: 'main' }, text));
    else await ctx.interaction.update(ev.handle, { content: text, embeds: [], components: [] });
  }
}

export const components = {
  // Lobby
  join: (ctx, ev) => tableAction(ctx, ev, (g) => addPlayer(g, { id: ev.user.id, name: ev.user.displayName || ev.user.name })),
  leave: (ctx, ev) => tableAction(ctx, ev, (g) => {
    removePlayer(g, ev.user.id);
    if (!g.players.some((p) => !p.bot)) g.phase = 'closed';
    else if (g.host === ev.user.id) g.host = g.players.find((p) => !p.bot).id;
  }),
  addbot: (ctx, ev) => tableAction(ctx, ev, (g) => {
    hostOnly(g, ev);
    const level = ['easy', 'medium', 'hard'].includes(parts(ev)[1]) ? parts(ev)[1] : 'medium';
    addPlayer(g, { id: '', name: 'Bot', bot: level });
  }),
  start: (ctx, ev) => tableAction(ctx, ev, (g, e) => {
    hostOnly(g, ev);
    startGame(g, e);
  }),
  cancel: (ctx, ev) => tableAction(ctx, ev, (g) => {
    hostOnly(g, ev);
    if (g.phase !== 'lobby') throw new GameError('err.running');
    g.phase = 'closed';
  }),

  // Table during the game
  async hand(ctx, ev) {
    const [id] = parts(ev);
    const g = await loadGame(ctx, id);
    if (!g) return ephemeral(ctx, ev, t('en', 'err.gone'));
    try {
      return ctx.interaction.reply(ev.handle, handPanel(g, seat(g, ev.user.id)), { ephemeral: true });
    } catch (err) {
      return ephemeral(ctx, ev, errorText(g, ctx, err));
    }
  },
  async rules(ctx, ev) {
    const g = await loadGame(ctx, parts(ev)[0]);
    return ctx.interaction.reply(ev.handle, rulesMessage(g?.lang ?? 'en'), { ephemeral: true });
  },
  deny: (ctx, ev) => tableAction(ctx, ev, (g, e) => deny(g, e, seat(g, ev.user.id))),
  pass: (ctx, ev) => tableAction(ctx, ev, (g) => pass(g, seat(g, ev.user.id))),
  resolve: (ctx, ev) => tableAction(ctx, ev, (g, e) => {
    seat(g, ev.user.id);
    if (!g.pending) return;
    if (e.now < g.pending.deadline) throw new GameError('err.too_early');
    resolvePending(g, e);
  }),
  salute: (ctx, ev) => tableAction(ctx, ev, (g, e) => salute(g, e, seat(g, ev.user.id))),

  // Hand panel: views
  view: (ctx, ev) => show(ctx, ev, { name: parts(ev)[1] || 'main' }),
  build: (ctx, ev) => show(ctx, ev, { name: 'place', code: value(ev) }),
  route(ctx, ev) {
    const [from, to] = value(ev).split('>');
    return show(ctx, ev, { name: 'amount', from, to });
  },
  async attack(ctx, ev) {
    const [id] = parts(ev);
    const g = await loadGame(ctx, id);
    const hit = g && findShip(g, value(ev));
    if (hit && !canAttack(hit.ship)) {
      const key = hit.ship.mod ? 'err.modified' : hit.ship.shot ? 'err.shot' : 'err.no_program';
      return show(ctx, ev, { name: 'main' }, errorText(g, ctx, new GameError(key)));
    }
    if (hit?.ship.prog.i) return move(ctx, { ...ev, data: `${id}:${value(ev)}` }, (game, e, pi, [ship]) => declare(game, e, pi, { kind: 'attack', ship: Number(ship) }));
    return show(ctx, ev, { name: 'target', ship: value(ev) });
  },
  surprise(ctx, ev) {
    const code = value(ev);
    if (code === 'L') return show(ctx, ev, { name: 'loot' });
    if (code === 'H') return show(ctx, ev, { name: 'hijack' });
    return move(ctx, ev, (g, e, pi) => declare(g, e, pi, { kind: 'switch' }));
  },

  // Hand panel: moves
  place: (ctx, ev) => move(ctx, ev, (g, e, pi, [code, ship, side]) => build(g, pi, code, ship, side)),
  fire: (ctx, ev) => move(ctx, ev, (g, e, pi, [ship]) => declare(g, e, pi, { kind: 'attack', ship: Number(ship), target: Number(value(ev)) })),
  loot: (ctx, ev) => move(ctx, ev, (g, e, pi) => declare(g, e, pi, { kind: 'loot', target: Number(value(ev)) })),
  hijack: (ctx, ev) => move(ctx, ev, (g, e, pi) => declare(g, e, pi, { kind: 'hijack', target: Number(value(ev)) })),
  pick: (ctx, ev) => move(ctx, ev, (g, e, pi) => pick(g, pi, value(ev))),
  buy: (ctx, ev) => move(ctx, ev, (g, e, pi) => buyShip(g, pi)),
  end: (ctx, ev) => move(ctx, ev, (g, e, pi) => endTurn(g, e, pi)),
  crew: (ctx, ev) => move(ctx, ev, (g, e, pi, [from, to, n]) => moveCrew(g, pi, from, to, n), { name: 'manage' }),
  unbuild: (ctx, ev) => move(ctx, ev, (g, e, pi) => unbuild(g, pi, value(ev)), { name: 'manage' }),
  abandon: (ctx, ev) => move(ctx, ev, (g, e, pi) => abandon(g, pi, value(ev)), { name: 'manage' }),
  anchor: (ctx, ev) => move(ctx, ev, (g, e, pi, [ship]) => anchor(g, pi, ship), { name: 'manage' }),
  surr: (ctx, ev) => move(ctx, ev, (g, e, pi) => surrender(g, e, pi)),
};

