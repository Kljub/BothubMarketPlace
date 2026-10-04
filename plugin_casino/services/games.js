// Service "games": the rules (no Discord, no storage), testable with an
// injected rng. Every game pays its fair multiplier (expected value 1x the
// bet at RTP 100) times RTP/100: the house edge comes from the RTP setting,
// never from bent odds. Blackjack: cards are always fair; RTP only scales
// winnings.
export function weightedPick(table, rng) {
  const total = table.reduce((s, t) => s + t.weight, 0);
  let r = rng() * total;
  for (const t of table) {
    if (r < t.weight) return t;
    r -= t.weight;
  }
  return table[table.length - 1];
}

export function coinflip(bet, side, rtp, rng = Math.random) {
  const result = rng() < 0.5 ? 'heads' : 'tails';
  const win = result === side;
  return { win, result, payout: win ? Math.floor(bet * 2 * (rtp / 100)) : 0 };
}

export function dice(bet, guess, rtp, rng = Math.random) {
  const roll = 1 + Math.floor(rng() * 6);
  const win = roll === guess;
  return { win, roll, payout: win ? Math.floor(bet * 6 * (rtp / 100)) : 0 };
}

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const rouletteColor = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');

/** European roulette (0-36): a number, or red / black / even / odd / low / high. null for an unknown field. */
export function roulette(bet, field, rtp, rng = Math.random) {
  const f = String(field).trim().toLowerCase();
  const pocket = Math.floor(rng() * 37);
  const color = rouletteColor(pocket);
  let win;
  let fair;
  if (/^\d+$/.test(f)) {
    const n = Number(f);
    if (n > 36) return null;
    fair = 37;
    win = n === pocket;
  } else {
    const tests = { red: color === 'red', black: color === 'black', even: pocket !== 0 && pocket % 2 === 0, odd: pocket % 2 === 1, low: pocket >= 1 && pocket <= 18, high: pocket >= 19 };
    if (!(f in tests)) return null;
    fair = 37 / 18;
    win = tests[f];
  }
  return { win, pocket, color, payout: win ? Math.floor(bet * fair * (rtp / 100)) : 0 };
}

export const SLOTS = [
  { key: 'cherry', emoji: '🍒', weight: 40, three: 3, two: 1 },
  { key: 'lemon', emoji: '🍋', weight: 30, three: 5, two: 1 },
  { key: 'grape', emoji: '🍇', weight: 15, three: 10, two: 1 },
  { key: 'bell', emoji: '🔔', weight: 10, three: 20, two: 1 },
  { key: 'diamond', emoji: '💎', weight: 4, three: 50, two: 1 },
  { key: 'seven', emoji: '7️⃣', weight: 1, three: 200, two: 1 },
];
const SLOT_TOTAL = SLOTS.reduce((s, x) => s + x.weight, 0);
/** Expected value of the pay table; payouts are divided by it so RTP holds exactly. */
export const SLOT_EV = SLOTS.reduce((ev, s) => {
  const p = s.weight / SLOT_TOTAL;
  return ev + p ** 3 * s.three + 3 * p ** 2 * (1 - p) * s.two;
}, 0);

export function slots(bet, rtp, rng = Math.random) {
  const reels = [weightedPick(SLOTS, rng), weightedPick(SLOTS, rng), weightedPick(SLOTS, rng)];
  const k = reels.map((r) => r.key);
  let raw = 0;
  if (k[0] === k[1] && k[1] === k[2]) raw = reels[0].three;
  else if (k[0] === k[1] || k[1] === k[2] || k[0] === k[2]) raw = (k[0] === k[1] ? reels[0] : reels[1]).two;
  return { win: raw > 0, reels: reels.map((r) => r.emoji), payout: raw > 0 ? Math.floor(bet * (raw / SLOT_EV) * (rtp / 100)) : 0 };
}

// ---- blackjack ----
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function deck(rng = Math.random) {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(`${r}${s}`);
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const rank = (card) => card.slice(0, -1);
const cardValue = (card) => (rank(card) === 'A' ? 11 : ['J', 'Q', 'K'].includes(rank(card)) ? 10 : Number(rank(card)));

export function handValue(cards) {
  let total = cards.reduce((s, c) => s + cardValue(c), 0);
  let aces = cards.filter((c) => rank(c) === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

export const isBlackjack = (cards) => cards.length === 2 && handValue(cards) === 21;
export const canSplit = (cards) => cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]);

/** The dealer draws to 17 (stands on soft 17). */
export function dealerPlay(state) {
  while (handValue(state.dealer) < 17) state.dealer.push(state.deck.pop());
}

/** One hand against the finished dealer hand; split hands get no 2.5x blackjack bonus. */
export function resolveHand(cards, dealer, bet, rtp, split = false) {
  const p = handValue(cards);
  const d = handValue(dealer);
  if (p > 21) return { outcome: 'bust', payout: 0 };
  const pbj = !split && isBlackjack(cards);
  const dbj = isBlackjack(dealer);
  let outcome;
  let fair;
  if (pbj && dbj) [outcome, fair] = ['push', 1];
  else if (pbj) [outcome, fair] = ['blackjack', 2.5];
  else if (dbj) [outcome, fair] = ['lose', 0];
  else if (d > 21 || p > d) [outcome, fair] = ['win', 2];
  else if (p < d) [outcome, fair] = ['lose', 0];
  else [outcome, fair] = ['push', 1];
  return { outcome, payout: Math.floor(bet * (outcome === 'push' ? 1 : fair * (rtp / 100))) };
}
