// Service "engine": the rules of Potato Pirates, without Discord or storage.
// Every function changes the game object `g` in place; invalid moves throw a
// GameError whose key the view translates. `env` = { rng, now } so tests and
// bots are repeatable.
//
// Game: { id, phase: lobby|play|over, cfg, players, turn, round, deck,
//   discard, pending, salute, log, winner, seq }
// Player: { id, name, bot (null|easy|medium|hard), hand, kings, crystals,
//   ships, reserve, out, adrift, first }
// Ship: { id, p (potatoes), mode: anchor|battle, prog: { i, a, b }, dp, mc,
//   mod (modified this turn), shot (attacked this turn) }
//   prog.i: If-Else card or null; prog.a: the stack (or the If side);
//   prog.b: the Else side. Control cards lie above action cards; every
//   control repeats everything below it.
//
// The three match currencies live only in the game: potatoes (crew on the
// ships), crystals (energy to put cards on ships) and ships (max. cfg.maxShips).
import { CARDS, buildDeck, cost, isAction, isBuildable, isControl, isIf, shuffle } from './cards.js';

export class GameError extends Error {
  constructor(key, params = {}) {
    super(key);
    this.key = key;
    this.params = params;
  }
}

export const DEFAULTS = {
  kingsToWin: 7,
  maxShips: 3,
  shipPotatoes: 10,
  handSize: 5,
  crystals: true,
  crystalsStart: 3,
  crystalsTurn: 3,
  crystalsMax: 10,
  short: false,
  promo: false,
  denySec: 20,
  saluteSec: 15,
  turnMin: 5,
  maxPlayers: 6,
};

const LOG_KEEP = 8;
const LOOP_GUARD = 200;

export function log(g, k, params = {}) {
  g.log.push({ k, ...params });
  if (g.log.length > LOG_KEEP) g.log.splice(0, g.log.length - LOG_KEEP);
}

export function createGame({ id, guild, channel, host, lang = 'en', cfg = {} }) {
  return {
    id, guild, channel, msg: null, host, lang, phase: 'lobby', cfg: { ...DEFAULTS, ...cfg },
    players: [], turn: 0, round: 0, deck: [], discard: [], pending: null, salute: null,
    log: [], winner: null, seq: 1, at: 0, turnAt: 0,
  };
}

export function addPlayer(g, { id, name, bot = null }) {
  if (g.phase !== 'lobby') throw new GameError('err.running');
  if (g.players.length >= g.cfg.maxPlayers) throw new GameError('err.full', { max: g.cfg.maxPlayers });
  if (!bot && g.players.some((p) => p.id === id)) throw new GameError('err.joined');
  const n = g.players.filter((p) => p.bot).length + 1;
  g.players.push({ id: bot ? `bot${n}` : id, name: bot ? `${name} ${n}` : name, bot, hand: [], kings: 0, crystals: 0, ships: [], reserve: 0, out: false, adrift: 0, first: true });
}

export function removePlayer(g, id) {
  if (g.phase !== 'lobby') throw new GameError('err.running');
  const i = g.players.findIndex((p) => p.id === id);
  if (i < 0) throw new GameError('err.not_joined');
  g.players.splice(i, 1);
}

// ---------- helpers ----------

export const cur = (g) => g.players[g.turn];
export const alive = (g) => g.players.filter((p) => !p.out);
export const idx = (g, p) => g.players.indexOf(p);
export const potatoes = (p) => p.reserve + p.ships.reduce((s, x) => s + x.p, 0);
export const handCount = (p) => p.hand.length + p.kings;
const anchored = (p) => p.ships.filter((s) => s.mode === 'anchor');

export function findShip(g, shipId) {
  for (const p of g.players) {
    const s = p.ships.find((x) => x.id === Number(shipId));
    if (s) return { owner: p, ship: s };
  }
  return null;
}

function playerOf(g, pi) {
  const p = g.players[pi];
  if (!p || p.out) throw new GameError('err.not_playing');
  return p;
}

function ownTurn(g, pi) {
  if (g.phase !== 'play') throw new GameError('err.not_running');
  if (g.turn !== pi) throw new GameError('err.not_your_turn');
  if (g.pending) throw new GameError('err.pending');
  return playerOf(g, pi);
}

function ownShip(p, shipId) {
  const s = p.ships.find((x) => x.id === Number(shipId));
  if (!s) throw new GameError('err.no_ship');
  return s;
}

function takeCard(p, code) {
  const i = p.hand.indexOf(code);
  if (i < 0) throw new GameError('err.no_card');
  p.hand.splice(i, 1);
}

const progCards = (s) => [...(s.prog.i ? [s.prog.i] : []), ...s.prog.a, ...s.prog.b];
export const slots = (s) => progCards(s).length;
export const capacity = (s) => (s.mc ? 5 : 3);
export const hasAction = (s) => progCards(s).some(isAction);

function newShip(g, p, crew) {
  const s = { id: g.seq++, p: crew, mode: 'anchor', prog: { i: null, a: [], b: [] }, dp: false, mc: false, mod: false, shot: false };
  p.ships.push(s);
  p.adrift = 0;
  return s;
}

/** Crew a player can move or pay: the reserve plus all but one potato of each anchored ship. */
export function spare(p) {
  return p.reserve + anchored(p).reduce((s, x) => s + x.p - 1, 0);
}

/** Takes n spare crew (reserve first, then the fullest anchored ships); never sinks a ship. */
function takeSpare(p, n) {
  let left = n;
  const fromReserve = Math.min(p.reserve, left);
  p.reserve -= fromReserve;
  left -= fromReserve;
  while (left > 0) {
    const s = anchored(p).filter((x) => x.p > 1).sort((a, b) => b.p - a.p)[0];
    if (!s) break;
    s.p--;
    left--;
  }
  return n - left;
}

// ---------- start, draw, turns ----------

export function startGame(g, env) {
  if (g.phase !== 'lobby') throw new GameError('err.running');
  if (g.players.length < 2) throw new GameError('err.too_few');
  g.deck = shuffle(buildDeck(g.cfg.promo), env.rng);
  g.discard = [];
  for (const p of g.players) {
    p.hand = g.deck.splice(0, g.cfg.handSize);
    p.ships = [];
    newShip(g, p, g.cfg.shipPotatoes);
    newShip(g, p, g.cfg.shipPotatoes);
    p.crystals = g.cfg.crystals ? g.cfg.crystalsStart : 0;
  }
  g.phase = 'play';
  g.turn = Math.floor(env.rng() * g.players.length);
  g.round = 1;
  log(g, 'log.start', { p: g.turn });
  beginTurn(g, env);
}

/** Draws n cards; Potato Kings are revealed at once. Returns the kings found. */
export function draw(g, p, n, env) {
  let kings = 0;
  for (let i = 0; i < n; i++) {
    if (!g.deck.length) {
      if (g.cfg.short) {
        finishByKings(g);
        return kings;
      }
      if (!g.discard.length) break;
      g.deck = shuffle(g.discard, env.rng);
      g.discard = [];
      log(g, 'log.reshuffle');
    }
    const c = g.deck.shift();
    if (c === 'K') {
      p.kings++;
      kings++;
    } else {
      p.hand.push(c);
    }
  }
  return kings;
}

function beginTurn(g, env) {
  const p = cur(g);
  g.turnAt = env.now;
  for (const s of p.ships) {
    if (s.mode === 'battle' && !s.dp) s.mode = 'anchor';
    s.mod = false;
    s.shot = false;
  }
  let kings = 0;
  if (p.first) {
    // Kings of the starting hand are revealed on the first turn.
    p.first = false;
    const start = p.hand.filter((c) => c === 'K').length;
    if (start) {
      p.hand = p.hand.filter((c) => c !== 'K');
      p.kings += start;
      kings += start;
    }
  }
  kings += draw(g, p, 2, env);
  if (g.phase !== 'play') return;
  if (g.cfg.crystals) p.crystals = Math.min(g.cfg.crystalsMax, p.crystals + g.cfg.crystalsTurn);
  log(g, 'log.turn', { p: g.turn });
  if (kings) foundKings(g, env, g.turn, kings);
}

export function endTurn(g, env, pi, timeout = false) {
  const p = ownTurn(g, pi);
  if (timeout) log(g, 'log.timeout', { p: pi });
  if (!p.ships.length) {
    p.adrift--;
    if (p.adrift <= 0) eliminate(g, pi, null, 'adrift');
  }
  g.needsAdvance = false;
  if (g.phase !== 'play') return;
  nextTurn(g, env);
}

function nextTurn(g, env) {
  const n = g.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (g.turn + k) % n;
    if (!g.players[i].out) {
      if (i <= g.turn) g.round++;
      g.turn = i;
      break;
    }
  }
  beginTurn(g, env);
}

// ---------- winning, sinking, elimination ----------

function checkWin(g) {
  if (g.phase !== 'play') return;
  const left = alive(g);
  const king = left.find((p) => p.kings >= g.cfg.kingsToWin);
  if (king) return win(g, idx(g, king), 'kings');
  if (left.length === 1) return win(g, idx(g, left[0]), 'last');
  // Only bots left (a real table always has a human): the best bot wins.
  if (g.players.some((p) => !p.bot) && !left.some((p) => !p.bot)) {
    const best = [...left].sort((a, b) => b.kings - a.kings || potatoes(b) - potatoes(a))[0];
    return win(g, idx(g, best), 'bots');
  }
}

function win(g, pi, how) {
  g.phase = 'over';
  g.winner = pi;
  g.how = how;
  g.pending = null;
  g.salute = null;
  log(g, 'log.win', { p: pi, how });
}

/** Short game: the deck is empty; most kings wins, then most potatoes. */
function finishByKings(g) {
  const best = [...alive(g)].sort((a, b) => b.kings - a.kings || potatoes(b) - potatoes(a))[0];
  win(g, idx(g, best), 'deck');
}

function sink(g, owner, s, by) {
  owner.ships = owner.ships.filter((x) => x !== s);
  g.discard.push(...progCards(s), ...(s.dp ? ['DP'] : []), ...(s.mc ? ['MC'] : []));
  log(g, 'log.sunk', { p: idx(g, owner), by });
  if (!owner.ships.length) {
    if (owner.reserve > 0) owner.adrift = g.turn === idx(g, owner) ? 2 : 1;
    else eliminate(g, idx(g, owner), by, 'sunk');
  }
}

/** Out of the game. The hand and the kings go to whoever removed the player; else back into the game. */
export function eliminate(g, pi, by, why) {
  const p = g.players[pi];
  if (p.out) return;
  p.out = true;
  const taker = by !== null && by !== undefined && !g.players[by].out ? g.players[by] : null;
  const kings = p.kings + p.hand.filter((c) => c === 'K').length;
  const cards = p.hand.filter((c) => c !== 'K');
  if (taker) {
    taker.hand.push(...cards);
    taker.kings += kings;
  } else {
    g.discard.push(...cards);
    for (let k = 0; k < kings; k++) g.deck.splice(Math.floor(Math.random() * (g.deck.length + 1)), 0, 'K');
  }
  for (const s of p.ships) g.discard.push(...progCards(s));
  p.hand = [];
  p.kings = 0;
  p.ships = [];
  p.reserve = 0;
  log(g, 'log.out', { p: pi, by: taker ? by : null, why });
  if (g.salute && (g.salute.finder === pi)) g.salute = null;
  if (g.phase === 'play' && g.turn === pi && alive(g).length > 1 && !g.pending) {
    checkWin(g);
    if (g.phase === 'play') nextTurnAfterOut(g);
    return;
  }
  checkWin(g);
}

// The current player dropped out on their own turn: the next one starts.
// beginTurn needs env; the flow calls advance() with it right after.
function nextTurnAfterOut(g) {
  g.needsAdvance = true;
}

export function advance(g, env) {
  if (!g.needsAdvance) return;
  g.needsAdvance = false;
  if (g.phase === 'play') nextTurn(g, env);
}

export function surrender(g, env, pi) {
  playerOf(g, pi);
  if (g.phase !== 'play') throw new GameError('err.not_running');
  if (g.pending && g.pending.by === pi) g.pending = null;
  eliminate(g, pi, null, 'surrender');
  advance(g, env);
}

// ---------- crew and ships ----------

export function buyShip(g, pi) {
  const p = ownTurn(g, pi);
  if (p.ships.length >= g.cfg.maxShips) throw new GameError('err.max_ships', { max: g.cfg.maxShips });
  if (spare(p) < 5) throw new GameError('err.buy_crew');
  takeSpare(p, 5);
  newShip(g, p, 1);
  log(g, 'log.buy', { p: pi });
}

export function moveCrew(g, pi, from, to, n) {
  const p = ownTurn(g, pi);
  const target = ownShip(p, to);
  if (target.mode !== 'anchor') throw new GameError('err.battle_crew');
  n = Math.floor(Number(n));
  if (!(n >= 1)) throw new GameError('err.amount');
  if (from === 'r') {
    if (p.reserve < n) throw new GameError('err.amount');
    p.reserve -= n;
  } else {
    const source = ownShip(p, from);
    if (source === target) throw new GameError('err.same_ship');
    if (source.mode !== 'anchor') throw new GameError('err.battle_crew');
    if (source.p - n < 1) throw new GameError('err.keep_one');
    source.p -= n;
  }
  target.p += n;
}

export function abandon(g, pi, shipId) {
  const p = ownTurn(g, pi);
  const s = ownShip(p, shipId);
  if (s.mode !== 'anchor') throw new GameError('err.battle_crew');
  const rest = anchored(p).filter((x) => x !== s).sort((a, b) => a.p - b.p)[0];
  if (!rest) throw new GameError('err.last_ship');
  rest.p += s.p;
  p.ships = p.ships.filter((x) => x !== s);
  g.discard.push(...progCards(s), ...(s.dp ? ['DP'] : []), ...(s.mc ? ['MC'] : []));
  log(g, 'log.abandon', { p: pi });
}

// ---------- programming the ships ----------

/**
 * Puts a card from the hand onto an anchored ship. side: 'a' (stack or If
 * side) or 'b' (Else side). Rules: max. 3 cards (5 with S.S. Megachip), the
 * If-Else card only on an empty ship and only there, control cards above
 * action cards, costs crystals.
 */
export function build(g, pi, code, shipId, side = 'a') {
  const p = ownTurn(g, pi);
  const s = ownShip(p, shipId);
  if (!isBuildable(code)) throw new GameError('err.not_buildable');
  if (!p.hand.includes(code)) throw new GameError('err.no_card');
  if (s.mode !== 'anchor') throw new GameError('err.battle_build');
  if (s.shot) throw new GameError('err.shot');
  const price = g.cfg.crystals ? cost(code) : 0;
  if (p.crystals < price) throw new GameError('err.crystals', { need: price, have: p.crystals });
  if (code === 'DP' || code === 'MC') {
    if ((code === 'DP' && s.dp) || (code === 'MC' && s.mc)) throw new GameError('err.promo_twice');
    takeCard(p, code);
    if (code === 'DP') s.dp = true;
    else s.mc = true;
  } else {
    if (slots(s) >= capacity(s)) throw new GameError('err.full_ship', { max: capacity(s) });
    if (isIf(code)) {
      if (slots(s)) throw new GameError('err.if_first');
      takeCard(p, code);
      s.prog.i = code;
    } else {
      const stack = s.prog.i && side === 'b' ? s.prog.b : s.prog.a;
      if (isControl(code) && stack.some(isAction)) throw new GameError('err.control_above');
      takeCard(p, code);
      stack.push(code);
    }
  }
  p.crystals -= price;
  s.mod = true;
}

/** Takes the program of a ship back into the hand (no crystals back). */
export function unbuild(g, pi, shipId) {
  const p = ownTurn(g, pi);
  const s = ownShip(p, shipId);
  if (s.mode !== 'anchor') throw new GameError('err.battle_build');
  if (!slots(s)) throw new GameError('err.empty_ship');
  p.hand.push(...progCards(s));
  s.prog = { i: null, a: [], b: [] };
  s.mod = true;
}

/** Frying Dutchpan ship in battle mode back to anchor (to change its program). */
export function anchor(g, pi, shipId) {
  const p = ownTurn(g, pi);
  const s = ownShip(p, shipId);
  if (s.mode !== 'battle') throw new GameError('err.not_battle');
  s.mode = 'anchor';
  s.mod = true;
}

export function canAttack(s) {
  return !s.mod && !s.shot && hasAction(s) && (s.mode === 'anchor' || s.dp);
}

// ---------- running a program ----------

/**
 * Runs a card list against one ship (state.p is lowered). vals: { x: cards in
 * the hand of the target's owner, y: ships of the attacker }. Returns the
 * damage dealt (capped at the potatoes the ship had).
 */
export function execute(list, state, vals) {
  let guard = 0;
  const run = (cards) => {
    for (let k = 0; k < cards.length; k++) {
      if (state.p <= 0) return;
      const c = CARDS[cards[k]];
      if (c.kind === 'action') {
        state.p -= c.dmg;
        continue;
      }
      const body = cards.slice(k + 1);
      if (!body.some(isAction)) return;
      if (c.loop === 'for') {
        const n = c.n === 'x' ? vals.x : c.n === 'y' ? vals.y : c.n;
        for (let r = 0; r < n && state.p > 0 && guard++ < LOOP_GUARD; r++) run(body);
      } else if (c.loop === 'while') {
        while (state.p > c.n && guard++ < LOOP_GUARD) run(body);
      }
      return;
    }
  };
  const before = state.p;
  run(list);
  const dealt = before - Math.max(0, state.p);
  state.p = Math.max(0, state.p);
  return dealt;
}

/** Ships an attack hits: [{ owner, ship, list }] (If-Else: every enemy ship). */
export function targetsOf(g, attacker, s, targetShipId) {
  if (s.prog.i) {
    const n = CARDS[s.prog.i].cond;
    const out = [];
    for (const q of g.players) {
      if (q === attacker || q.out) continue;
      for (const t of q.ships) {
        const list = t.p < n ? s.prog.a : s.prog.b;
        if (list.some(isAction)) out.push({ owner: q, ship: t, list });
      }
    }
    return out;
  }
  const hit = findShip(g, targetShipId);
  if (!hit || hit.owner === attacker || hit.owner.out) throw new GameError('err.target');
  return [{ ...hit, list: s.prog.a }];
}

// ---------- surprise cards and the Deny window ----------

/**
 * Starts an action other players may deny: an attack or a surprise card.
 * action: { kind: attack|loot|hijack|switch, ship?, target? }.
 */
export function declare(g, env, pi, action) {
  const p = playerOf(g, pi);
  if (g.phase !== 'play') throw new GameError('err.not_running');
  if (g.pending) throw new GameError('err.pending');
  const a = { ...action, by: pi };
  if (a.kind === 'attack') {
    ownTurn(g, pi);
    const s = ownShip(p, a.ship);
    if (!canAttack(s)) throw new GameError(s.mod ? 'err.modified' : s.shot ? 'err.shot' : 'err.no_program');
    if (!s.prog.i) targetsOf(g, p, s, a.target);
    s.shot = true;
  } else if (a.kind === 'loot') {
    const q = g.players[a.target];
    if (!q || q.out || q === p) throw new GameError('err.target');
    if (!handCount(q)) throw new GameError('err.empty_hand');
    takeCard(p, 'L');
    g.discard.push('L');
  } else if (a.kind === 'hijack') {
    const hit = findShip(g, a.target);
    if (!hit || hit.owner === p || hit.owner.out) throw new GameError('err.target');
    if (hit.ship.mode !== 'anchor') throw new GameError('err.hijack_battle');
    if (p.ships.length >= g.cfg.maxShips) throw new GameError('err.max_ships', { max: g.cfg.maxShips });
    if (spare(p) < 1) throw new GameError('err.hijack_crew');
    takeCard(p, 'H');
    g.discard.push('H');
  } else if (a.kind === 'switch') {
    takeCard(p, 'S');
    g.discard.push('S');
  } else {
    throw new GameError('err.unknown');
  }
  g.pending = { a, denies: 0, last: pi, passed: [], deadline: env.now + g.cfg.denySec * 1000 };
  log(g, `log.declare_${a.kind}`, { p: pi, t: a.kind === 'loot' ? a.target : a.kind === 'hijack' ? ownerIdx(g, a.target) : undefined });
}

function ownerIdx(g, shipId) {
  const hit = findShip(g, shipId);
  return hit ? idx(g, hit.owner) : undefined;
}

/** Humans who still may answer the open window (everyone but the last player). */
export function waitingFor(g) {
  if (!g.pending) return [];
  return g.players.map((p, i) => ({ p, i })).filter(({ p, i }) => !p.out && !p.bot && i !== g.pending.last && !g.pending.passed.includes(i)).map(({ i }) => i);
}

export function deny(g, env, pi) {
  const p = playerOf(g, pi);
  if (!g.pending) throw new GameError('err.nothing_to_deny');
  if (g.pending.last === pi) throw new GameError('err.deny_self');
  takeCard(p, 'D');
  g.discard.push('D');
  g.pending.denies++;
  g.pending.last = pi;
  g.pending.passed = [];
  g.pending.deadline = env.now + g.cfg.denySec * 1000;
  log(g, 'log.deny', { p: pi, n: g.pending.denies });
}

export function pass(g, pi) {
  if (!g.pending) return;
  if (!g.pending.passed.includes(pi)) g.pending.passed.push(pi);
}

/** Closes the window: an odd number of Deny cards cancels the action. */
export function resolvePending(g, env) {
  const pend = g.pending;
  if (!pend) return;
  g.pending = null;
  const a = pend.a;
  const p = g.players[a.by];
  if (p.out) return;
  if (pend.denies % 2 === 1) {
    log(g, 'log.denied', { p: a.by, kind: a.kind });
    if (a.kind === 'attack') {
      const s = p.ships.find((x) => x.id === a.ship);
      if (s) {
        g.discard.push(...progCards(s));
        s.prog = { i: null, a: [], b: [] };
        s.mode = 'battle';
      }
    }
  } else if (a.kind === 'attack') runAttack(g, env, a);
  else if (a.kind === 'loot') runLoot(g, env, a);
  else if (a.kind === 'hijack') runHijack(g, a);
  else if (a.kind === 'switch') runSwitch(g, env, a);
  checkWin(g);
  advance(g, env);
}

function runAttack(g, env, a) {
  const p = g.players[a.by];
  const s = p.ships.find((x) => x.id === a.ship);
  if (!s) return;
  let hits;
  try {
    hits = targetsOf(g, p, s, a.target);
  } catch {
    hits = [];
  }
  const y = p.ships.length;
  const report = [];
  for (const h of hits) {
    if (!h.owner.ships.includes(h.ship)) continue;
    const dealt = execute(h.list, h.ship, { x: handCount(h.owner), y });
    report.push({ t: idx(g, h.owner), d: dealt });
    if (h.ship.p <= 0) sink(g, h.owner, h.ship, a.by);
  }
  log(g, 'log.attack', { p: a.by, hits: report, prog: { ...s.prog } });
  if (!s.dp) {
    g.discard.push(...progCards(s));
    s.prog = { i: null, a: [], b: [] };
  }
  s.mode = 'battle';
}

function runLoot(g, env, a) {
  const p = g.players[a.by];
  const q = g.players[a.target];
  if (q.out) return;
  const pool = [...q.hand.map((c, i) => ({ c, i })), ...Array.from({ length: q.kings }, () => ({ c: 'K' }))];
  shuffle(pool, env.rng);
  const got = pool.slice(0, 2);
  let kings = 0;
  for (const it of got) {
    if (it.c === 'K') {
      q.kings--;
      p.kings++;
      kings++;
    } else {
      q.hand.splice(q.hand.indexOf(it.c), 1);
      p.hand.push(it.c);
    }
  }
  log(g, 'log.loot', { p: a.by, t: a.target, n: got.length, kings });
  if (kings) foundKings(g, env, a.by, kings);
}

function runHijack(g, a) {
  const p = g.players[a.by];
  const hit = findShip(g, a.target);
  if (!hit || hit.ship.mode !== 'anchor' || p.ships.length >= g.cfg.maxShips || spare(p) < 1) return;
  const { owner: q, ship: s } = hit;
  q.ships = q.ships.filter((x) => x !== s);
  const refuge = anchored(q).sort((x, y) => x.p - y.p)[0] ?? q.ships[0];
  if (refuge) refuge.p += s.p;
  else {
    q.reserve += s.p;
    q.adrift = g.turn === idx(g, q) ? 2 : 1;
  }
  takeSpare(p, 1);
  s.p = 1;
  s.mod = false;
  s.shot = false;
  s.mode = 'anchor';
  p.ships.push(s);
  p.adrift = 0;
  log(g, 'log.hijack', { p: a.by, t: idx(g, q) });
}

function runSwitch(g, env, a) {
  const p = g.players[a.by];
  const n = p.ships.length;
  if (n === 1) {
    if (p.ships.length < g.cfg.maxShips) newShip(g, p, 1);
    log(g, 'log.switch_ship', { p: a.by });
  } else if (n === 2) {
    if (g.discard.some((c) => c !== 'K')) {
      p.pick = true;
      log(g, 'log.switch_pick', { p: a.by });
    } else log(g, 'log.switch_none', { p: a.by });
  } else if (n === 3) {
    const kings = draw(g, p, 3, env);
    log(g, 'log.switch_draw', { p: a.by });
    if (kings) foundKings(g, env, a.by, kings);
  } else log(g, 'log.switch_none', { p: a.by });
}

/** Switch with 2 ships: takes one card of the discard pile (secretly). */
export function pick(g, pi, code) {
  const p = playerOf(g, pi);
  if (!p.pick) throw new GameError('err.no_pick');
  const i = g.discard.lastIndexOf(code);
  if (i < 0 || code === 'K') throw new GameError('err.no_card');
  g.discard.splice(i, 1);
  p.hand.push(code);
  p.pick = false;
}

// ---------- Potato King salute ----------

const BOT_SALUTE = { easy: [2500, 9000], medium: [1200, 5000], hard: [500, 2500] };

/** Kings revealed: everyone salutes, the last one pays 2 potatoes per king to the finder. */
export function foundKings(g, env, pi, count) {
  log(g, 'log.king', { p: pi, n: count, total: g.players[pi].kings });
  checkWin(g);
  if (g.phase !== 'play') return;
  if (g.salute) resolveSalute(g, env, true);
  const others = g.players.map((p, i) => ({ p, i })).filter(({ p, i }) => i !== pi && !p.out);
  if (!others.length) return;
  const bots = {};
  for (const { p, i } of others) {
    if (!p.bot) continue;
    const [lo, hi] = BOT_SALUTE[p.bot] ?? BOT_SALUTE.medium;
    bots[i] = Math.round(lo + env.rng() * (hi - lo));
  }
  g.salute = { finder: pi, count, at: env.now, clicks: {}, bots, deadline: env.now + g.cfg.saluteSec * 1000 };
  if (!saluteWaiting(g).length) resolveSalute(g, env);
}

export function saluteWaiting(g) {
  if (!g.salute) return [];
  return g.players.map((p, i) => ({ p, i })).filter(({ p, i }) => !p.out && !p.bot && i !== g.salute.finder && !(i in g.salute.clicks)).map(({ i }) => i);
}

export function salute(g, env, pi) {
  const sal = g.salute;
  if (!sal) throw new GameError('err.no_salute');
  if (pi === sal.finder) throw new GameError('err.own_king');
  playerOf(g, pi);
  if (pi in sal.clicks) throw new GameError('err.saluted');
  sal.clicks[pi] = env.now - sal.at;
  if (!saluteWaiting(g).length) resolveSalute(g, env);
}

export function resolveSalute(g, env, force = false) {
  const sal = g.salute;
  if (!sal) return;
  if (!force && saluteWaiting(g).length && env.now < sal.deadline) return;
  g.salute = null;
  const times = g.players.map((p, i) => ({ p, i })).filter(({ p, i }) => i !== sal.finder && !p.out)
    .map(({ p, i }) => ({ i, ms: p.bot ? sal.bots[i] ?? 3000 : sal.clicks[i] ?? Infinity, r: env.rng() }));
  if (!times.length) return;
  times.sort((a, b) => b.ms - a.ms || b.r - a.r);
  const payer = times[0].i;
  const amount = 2 * sal.count;
  const paid = payPotatoes(g, payer, sal.finder, amount);
  log(g, 'log.salute', { p: payer, t: sal.finder, n: paid, ms: Number.isFinite(times[0].ms) ? times[0].ms : null });
  checkWin(g);
  advance(g, env);
}

/** Moves potatoes from one player to another; may sink the payer's ships. */
function payPotatoes(g, from, to, n) {
  const a = g.players[from];
  const b = g.players[to];
  let paid = 0;
  while (paid < n && !a.out) {
    if (a.reserve > 0) a.reserve--;
    else {
      const s = [...a.ships].sort((x, y) => y.p - x.p)[0];
      if (!s) break;
      s.p--;
      if (s.p <= 0) sink(g, a, s, to);
    }
    paid++;
  }
  if (b.out) return paid;
  const home = anchored(b).sort((x, y) => x.p - y.p)[0] ?? b.ships[0];
  if (home) home.p += paid;
  else b.reserve += paid;
  return paid;
}

// ---------- reading helpers for views and bots ----------

/** Expected damage of a ship's program against every enemy ship (for previews). */
export function preview(g, attacker, s) {
  const y = attacker.ships.length;
  if (s.prog.i) {
    let total = 0;
    for (const h of targetsOf(g, attacker, s)) total += execute(h.list, { p: h.ship.p }, { x: handCount(h.owner), y });
    return total;
  }
  let best = 0;
  for (const q of g.players) {
    if (q === attacker || q.out) continue;
    for (const t of q.ships) best = Math.max(best, execute(s.prog.a, { p: t.p }, { x: handCount(q), y }));
  }
  return best;
}
