// Service "cards": the 85 playing cards of the base game (the 18 ship cards
// are the ships themselves) and the two promo cards. Codes are short because
// the whole game state lives in one storage value (max 16 KB).
//   kind: action (damage), control (loops and conditions), surprise (any
//   time, also on other players' turns), king (Potato King / bug card),
//   promo (Frying Dutchpan, S.S. Megachip; dashboard switch "promo_cards").

export const CARDS = {
  R: { kind: 'action', count: 12, dmg: 1, emoji: '🔥' },
  M: { kind: 'action', count: 12, dmg: 2, emoji: '🥣' },
  F: { kind: 'action', count: 8, dmg: 3, emoji: '🍟' },
  F2: { kind: 'control', count: 4, loop: 'for', n: 2, emoji: '🔁' },
  F3: { kind: 'control', count: 4, loop: 'for', n: 3, emoji: '🔁' },
  FX: { kind: 'control', count: 2, loop: 'for', n: 'x', emoji: '🔁' },
  FY: { kind: 'control', count: 2, loop: 'for', n: 'y', emoji: '🔁' },
  W4: { kind: 'control', count: 2, loop: 'while', n: 4, emoji: '🌀' },
  W5: { kind: 'control', count: 2, loop: 'while', n: 5, emoji: '🌀' },
  W6: { kind: 'control', count: 2, loop: 'while', n: 6, emoji: '🌀' },
  I4: { kind: 'control', count: 2, cond: 4, emoji: '🔀' },
  I5: { kind: 'control', count: 2, cond: 5, emoji: '🔀' },
  I6: { kind: 'control', count: 2, cond: 6, emoji: '🔀' },
  L: { kind: 'surprise', count: 4, emoji: '💰' },
  H: { kind: 'surprise', count: 4, emoji: '🏴‍☠️' },
  S: { kind: 'surprise', count: 4, emoji: '🔄' },
  D: { kind: 'surprise', count: 10, emoji: '🦑' },
  K: { kind: 'king', count: 7, emoji: '👑' },
  DP: { kind: 'promo', count: 1, emoji: '👻' },
  MC: { kind: 'promo', count: 1, emoji: '🚢' },
};

/** Codes in a fixed order (hand lists, selects). */
export const ORDER = ['R', 'M', 'F', 'F2', 'F3', 'FX', 'FY', 'W4', 'W5', 'W6', 'I4', 'I5', 'I6', 'L', 'H', 'S', 'D', 'K', 'DP', 'MC'];

export const isAction = (c) => CARDS[c]?.kind === 'action';
export const isControl = (c) => CARDS[c]?.kind === 'control';
export const isIf = (c) => Boolean(CARDS[c]?.cond);
export const isLoop = (c) => Boolean(CARDS[c]?.loop);
/** Cards that go onto a ship (from the hand, during the own turn). */
export const isBuildable = (c) => isAction(c) || isControl(c) || CARDS[c]?.kind === 'promo';

/** Crystal (energy) cost to put a card on a ship: Roast 1, Mash 2, Fry 3, control 1, others 0. */
export function cost(c) {
  if (isAction(c)) return CARDS[c].dmg;
  if (isControl(c)) return 1;
  return 0;
}

/** A fresh deck: every base card in its count, plus the promo cards when switched on. */
export function buildDeck(promo = false) {
  const deck = [];
  for (const [code, card] of Object.entries(CARDS)) {
    if (card.kind === 'promo' && !promo) continue;
    for (let i = 0; i < card.count; i++) deck.push(code);
  }
  return deck;
}

/** Fisher-Yates in place with the given random source. */
export function shuffle(list, rng = Math.random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
