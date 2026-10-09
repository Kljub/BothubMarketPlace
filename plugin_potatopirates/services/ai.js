// Service "ai": the computer players. Three levels:
//   easy    plays random cards, attacks a random ship, rarely denies
//   medium  builds the strongest program it can pay, attacks the ship it
//           hurts most, denies attacks that would sink it
//   hard    also counts loops and If-Else on every enemy ship, hunts the
//           player with most kings, keeps its crew even, saves Deny cards
//           for big hits and counters Deny against its own attacks
// botAct does one step of the bot's turn; botsReact answers an open Deny window.
import { CARDS, cost, isAction, isBuildable, isControl, isIf } from './cards.js';
import {
  alive, buyShip, canAttack, capacity, declare, deny, endTurn, execute, handCount, hasAction, idx, moveCrew, pick, slots, spare, targetsOf, build,
} from './engine.js';

const enemies = (g, p) => g.players.filter((q) => q !== p && !q.out);

/** Value of hitting ship t of owner q for d damage. */
function score(level, q, t, d) {
  if (d <= 0) return 0;
  const dealt = Math.min(d, t.p);
  const sinks = d >= t.p;
  let v = dealt + (sinks ? 3 + (q.ships.length === 1 ? 4 : 0) : 0);
  if (level === 'hard') v += q.kings * 0.6;
  return v;
}

/** How good a program is right now: If-Else adds up every ship, a stack takes the best target. */
export function programValue(g, p, prog, level = 'medium') {
  const y = p.ships.length;
  let best = 0;
  let sum = 0;
  for (const q of enemies(g, p)) {
    for (const t of q.ships) {
      const list = prog.i ? (t.p < CARDS[prog.i].cond ? prog.a : prog.b) : prog.a;
      if (!list.some(isAction)) continue;
      const v = score(level, q, t, execute(list, { p: t.p }, { x: handCount(q), y }));
      sum += v;
      best = Math.max(best, v);
    }
  }
  return prog.i ? sum : best;
}

const copyProg = (prog) => ({ i: prog.i, a: [...prog.a], b: [...prog.b] });

/** Card placements that are legal on this program: [{ code, side }]. */
function placements(prog, code, room) {
  if (room <= 0 || !isBuildable(code) || code === 'DP' || code === 'MC') return [];
  const empty = !prog.i && !prog.a.length && !prog.b.length;
  if (isIf(code)) return empty ? [{ code, side: 'a' }] : [];
  const sides = prog.i ? ['a', 'b'] : ['a'];
  return sides.filter((side) => !(isControl(code) && (side === 'b' ? prog.b : prog.a).some(isAction))).map((side) => ({ code, side }));
}

function place(prog, { code, side }) {
  const next = copyProg(prog);
  if (isIf(code)) next.i = code;
  else (prog.i && side === 'b' ? next.b : next.a).push(code);
  return next;
}

/**
 * Best cards to add to a ship (up to 3 more, within the crystals): returns
 * { steps: [{ code, side }], value }. The search tries every order of the
 * distinct cards in hand.
 */
export function bestPlan(g, p, s, level = 'medium') {
  const crystals = g.cfg.crystals ? p.crystals : Infinity;
  const room = Math.min(3, capacity(s) - slots(s));
  let best = { steps: [], value: programValue(g, p, s.prog, level) };
  const walk = (prog, hand, left, depth, steps) => {
    if (depth >= room) return;
    for (const code of new Set(hand)) {
      const price = g.cfg.crystals ? cost(code) : 0;
      if (price > left) continue;
      for (const pl of placements(prog, code, capacity(s) - slots({ prog }))) {
        const next = place(prog, pl);
        const rest = [...hand];
        rest.splice(rest.indexOf(code), 1);
        const value = programValue(g, p, next, level) - (price * 0.05);
        const path = [...steps, pl];
        if (value > best.value + 0.01) best = { steps: path, value };
        walk(next, rest, left - price, depth + 1, path);
      }
    }
  };
  walk(s.prog, p.hand.filter((c) => isBuildable(c) && c !== 'DP' && c !== 'MC'), crystals, 0, []);
  return best;
}

/** Best enemy ship for a stack program: { shipId, value }. */
function bestTarget(g, p, s, level, rng) {
  const options = [];
  for (const q of enemies(g, p)) {
    for (const t of q.ships) options.push({ shipId: t.id, value: score(level, q, t, execute(s.prog.a, { p: t.p }, { x: handCount(q), y: p.ships.length })) });
  }
  if (!options.length) return null;
  if (level === 'easy') return options[Math.floor(rng() * options.length)];
  return options.sort((a, b) => b.value - a.value)[0];
}

const PICK = ['F', 'D', 'I6', 'W4', 'F3', 'I5', 'M', 'FX', 'FY', 'F2', 'W5', 'H', 'L', 'S', 'W6', 'I4', 'R', 'DP', 'MC'];

/** One step of a bot's turn. Returns false when the bot is done (the flow ends its turn). */
export function botAct(g, env, pi) {
  const p = g.players[pi];
  const level = p.bot ?? 'medium';
  const rng = env.rng;
  const has = (c) => p.hand.includes(c);

  if (p.pick) {
    const choice = PICK.find((c) => g.discard.includes(c));
    if (choice) pick(g, pi, choice);
    else p.pick = false;
    return true;
  }

  // 1. Attack with ships that are ready.
  for (const s of p.ships) {
    if (!canAttack(s)) continue;
    if (level === 'easy' && rng() < 0.15) continue;
    if (level === 'hard' && !s.prog.i && slots(s) < capacity(s)) {
      const now = programValue(g, p, s.prog, level);
      const later = bestPlan(g, p, s, level).value;
      if (now < later * 0.6 && p.crystals > 0) continue;
    }
    if (s.prog.i) {
      if (programValue(g, p, s.prog, level) <= 0 && level !== 'easy') continue;
      declare(g, env, pi, { kind: 'attack', ship: s.id });
      return true;
    }
    const t = bestTarget(g, p, s, level, rng);
    if (!t || (t.value <= 0 && level !== 'easy')) continue;
    declare(g, env, pi, { kind: 'attack', ship: s.id, target: t.shipId });
    return true;
  }

  // 2. Surprise cards on the own turn.
  if (surprise(g, env, pi, level)) return true;

  // 3. Buy a ship.
  const want = level === 'hard' ? 7 : level === 'medium' ? 9 : 12;
  if (p.ships.length < g.cfg.maxShips && spare(p) >= want && (level !== 'easy' || rng() < 0.5)) {
    buyShip(g, pi);
    return true;
  }

  // 4. Keep the crew even (hard always, medium when a ship is low).
  const free = p.ships.filter((s) => s.mode === 'anchor');
  if (free.length >= 2 && level !== 'easy') {
    const sorted = [...free].sort((a, b) => a.p - b.p);
    const low = sorted[0];
    const high = sorted.at(-1);
    const gap = high.p - low.p;
    if ((level === 'hard' && gap >= 2) || (level === 'medium' && low.p <= 2 && high.p >= 5)) {
      moveCrew(g, pi, high.id, low.id, Math.floor(gap / 2));
      return true;
    }
  }
  if (p.reserve > 0 && free.length) {
    moveCrew(g, pi, 'r', free[0].id, p.reserve);
    return true;
  }

  // 5. Promo cards: Megachip on a ship with room, Dutchpan on the strongest program.
  if (has('MC')) {
    const s = free.find((x) => !x.mc && !x.shot);
    if (s) {
      build(g, pi, 'MC', s.id);
      return true;
    }
  }
  if (has('DP')) {
    const s = free.filter((x) => !x.dp && !x.shot && hasAction(x)).sort((a, b) => programValue(g, p, b.prog) - programValue(g, p, a.prog))[0];
    if (s) {
      build(g, pi, 'DP', s.id);
      return true;
    }
  }

  // 6. Build programs on ships that did not attack.
  const builders = free.filter((s) => !s.shot && slots(s) < capacity(s));
  if (level === 'easy') {
    if (rng() < 0.35) return false;
    for (const s of builders) {
      const options = [];
      for (const code of new Set(p.hand)) {
        if (g.cfg.crystals && cost(code) > p.crystals) continue;
        options.push(...placements(s.prog, code, capacity(s) - slots(s)));
      }
      if (!options.length) continue;
      const pl = options[Math.floor(rng() * options.length)];
      build(g, pi, pl.code, s.id, pl.side);
      return true;
    }
    return false;
  }
  let bestShip = null;
  for (const s of builders) {
    const plan = bestPlan(g, p, s, level);
    if (!plan.steps.length) continue;
    if (!bestShip || plan.value > bestShip.plan.value) bestShip = { s, plan };
  }
  if (bestShip) {
    const step = bestShip.plan.steps[0];
    build(g, pi, step.code, bestShip.s.id, step.side);
    return true;
  }
  return false;
}

function surprise(g, env, pi, level) {
  const p = g.players[pi];
  const rng = env.rng;
  const has = (c) => p.hand.includes(c);
  const easyGo = () => level !== 'easy' || rng() < 0.3;
  if (has('S') && easyGo()) {
    const n = p.ships.length;
    const good = (n === 1 && n < g.cfg.maxShips) || n === 3 || (n === 2 && g.discard.some((c) => ['F', 'D', 'I6', 'W4', 'F3'].includes(c)));
    if (good || level === 'easy') {
      declare(g, env, pi, { kind: 'switch' });
      return true;
    }
  }
  if (has('L') && easyGo()) {
    const targets = enemies(g, p).filter((q) => handCount(q) > 0)
      .sort((a, b) => (level === 'hard' ? b.kings - a.kings : 0) || handCount(b) - handCount(a));
    const q = targets[0];
    if (q && (level === 'easy' || handCount(q) >= 3 || q.kings > 0)) {
      declare(g, env, pi, { kind: 'loot', target: idx(g, q) });
      return true;
    }
  }
  if (has('H') && p.ships.length < g.cfg.maxShips && spare(p) >= 1 && easyGo()) {
    let best = null;
    for (const q of enemies(g, p)) {
      for (const t of q.ships) {
        if (t.mode !== 'anchor') continue;
        const v = slots(t) * 2 + (t.dp ? 4 : 0) + (t.mc ? 2 : 0) + (q.ships.length === 1 ? 5 : 0) + (level === 'hard' ? q.kings : 0);
        if (!best || v > best.v) best = { t, v };
      }
    }
    if (best && (level === 'easy' || best.v >= 4 || p.ships.length < 2)) {
      declare(g, env, pi, { kind: 'hijack', target: best.t.id });
      return true;
    }
  }
  return false;
}

/** Damage an open attack would deal to player q. */
function threat(g, a, q) {
  const p = g.players[a.by];
  const s = p.ships.find((x) => x.id === a.ship);
  if (!s) return { dmg: 0, sinks: false };
  let dmg = 0;
  let sinks = false;
  let hits = [];
  try {
    hits = targetsOf(g, p, s, a.target);
  } catch {
    hits = [];
  }
  for (const h of hits) {
    if (h.owner !== q) continue;
    const d = execute(h.list, { p: h.ship.p }, { x: handCount(h.owner), y: p.ships.length });
    dmg += d;
    if (d >= h.ship.p) sinks = true;
  }
  return { dmg, sinks };
}

/** Bots answer an open Deny window (they decide at once). Returns true when one denied. */
export function botsReact(g, env) {
  const pend = g.pending;
  if (!pend) return false;
  const rng = env.rng;
  const order = g.players.map((p, i) => ({ p, i })).filter(({ p, i }) => p.bot && !p.out && i !== pend.last && p.hand.includes('D'));
  for (const { p, i } of order) {
    const level = p.bot;
    const a = pend.a;
    const cancelled = pend.denies % 2 === 1;
    let want = 0;
    if (cancelled) {
      // The action is cancelled right now: its owner (and nobody else) fights back.
      if (a.by === i) want = level === 'hard' ? 1 : level === 'medium' ? 0.5 : 0.1;
    } else if (a.by !== i) {
      if (a.kind === 'attack') {
        const t = threat(g, a, p);
        if (t.dmg > 0) {
          if (level === 'hard') want = t.sinks || t.dmg >= 3 ? 1 : 0.2;
          else if (level === 'medium') want = t.sinks ? 0.8 : t.dmg >= 5 ? 0.6 : 0;
          else want = 0.15;
        }
      } else if ((a.kind === 'loot' && a.target === i) || (a.kind === 'hijack' && p.ships.some((s) => s.id === Number(a.target)))) {
        want = level === 'hard' ? 1 : level === 'medium' ? 0.6 : 0.15;
      } else if (level === 'hard' && a.kind !== 'switch' && alive(g).length > 2) {
        const leader = [...alive(g)].sort((x, y) => y.kings - x.kings)[0];
        if (leader === g.players[a.by] && leader.kings >= g.cfg.kingsToWin - 2) want = 0.5;
      }
    }
    if (want > 0 && rng() < want) {
      deny(g, env, i);
      return true;
    }
  }
  return false;
}

/** Ends a bot's turn (wrapper so the flow has one call). */
export function botEnd(g, env, pi) {
  endTurn(g, env, pi);
}
