// Games of luck with a bet: /5dice (one roll of five dice, paid by the
// hand), /high-low (higher or lower than the card; every right guess raises
// the multiplier, cash out any time) and /scratchcard (bought at a fixed
// price; the prize is drawn at purchase, the nine fields are scratched by
// button).
import { betOf, money, take, wallet } from './econ.js';
import { endGame, loadGame, newGame, no, roll, rng, saveGame, say, shuffle, who } from './core.js';
import { setting } from './util.js';

// ---------- five dice ----------

const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
/** Hand -> payout (times the bet, the bet included). Fair value about 99.6 %. */
export const FIVE_DICE = [
  ['five', 'Five of a kind', 30], ['four', 'Four of a kind', 6], ['full', 'Full house', 4], ['straight', 'Straight', 4],
  ['three', 'Three of a kind', 1.5], ['twopair', 'Two pairs', 1.5], ['pair', 'One pair', 0], ['none', 'Nothing', 0],
];

export function handOf(dice) {
  const counts = Object.values(dice.reduce((m, d) => ({ ...m, [d]: (m[d] ?? 0) + 1 }), {})).sort((a, b) => b - a);
  const sorted = [...dice].sort().join('');
  if (counts[0] === 5) return 'five';
  if (counts[0] === 4) return 'four';
  if (counts[0] === 3 && counts[1] === 2) return 'full';
  if (sorted === '12345' || sorted === '23456') return 'straight';
  if (counts[0] === 3) return 'three';
  if (counts[0] === 2 && counts[1] === 2) return 'twopair';
  if (counts[0] === 2) return 'pair';
  return 'none';
}

export async function fivedice(ctx, { config, vars, interaction }) {
  const { guild, user, error } = who(vars, interaction);
  if (error) return no(ctx, interaction, error);
  const { bet, error: betError } = betOf(ctx, config.bet, true);
  if (betError) return no(ctx, interaction, betError);
  const short = await take(ctx, guild, user, bet);
  if (short) return no(ctx, interaction, short);
  const dice = Array.from({ length: 5 }, () => roll(6));
  const hand = handOf(dice);
  const [, name, times] = FIVE_DICE.find((h) => h[0] === hand);
  const win = Math.floor(bet * times);
  if (win) await wallet(ctx).add(guild, user, win);
  const table = FIVE_DICE.filter((h) => h[2]).map((h) => `${h[1]} ${h[2]}×`).join(' · ');
  await ctx.interaction.reply(interaction, { embeds: [{ color: win > bet ? '#22c55e' : win ? '#f0c040' : '#ef4444', title: '🎲 5 Dice',
    description: `${dice.map((d) => DIE[d]).join(' ')}\n**${name}**\n\n${win ? `You get ${money(ctx, win)} (bet ${money(ctx, bet)}).` : `Bet lost: ${money(ctx, bet)}.`}\n-# ${table}` }] });
  return { port: 'replied', results: { '': hand } };
}

// ---------- high-low ----------

const CARD = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const MAX_ROUNDS = 10;
const rtp = (ctx) => Math.max(50, Math.min(100, Number(setting(ctx, 'rtp', 97)))) / 100;

/** Multiplier step of a right guess: fair odds (ties do not count) times the payout rate. */
export function step(card, dir, rate = 1) {
  const n = dir === 'h' ? 13 - card : card - 1;
  return n > 0 ? (12 / n) * rate : 0;
}

function hlMessage(ctx, g, text, done = false) {
  const lines = [`Card: **${CARD[g.card]}**`, `Bet: ${money(ctx, g.bet)} · multiplier **${g.mult.toFixed(2)}×** · round ${g.round}/${MAX_ROUNDS}`];
  if (!done) lines.push(`Higher pays ×${step(g.card, 'h', rtp(ctx)).toFixed(2)}, lower ×${step(g.card, 'l', rtp(ctx)).toFixed(2)}`);
  const rows = done ? [] : [[
    { key: 'hl', data: `${g.id}:h`, label: 'Higher', emoji: '⬆️', style: 'primary', disabled: g.card === 13 },
    { key: 'hl', data: `${g.id}:l`, label: 'Lower', emoji: '⬇️', style: 'primary', disabled: g.card === 1 },
    { key: 'hl', data: `${g.id}:c`, label: `Cash out ${Math.floor(g.bet * g.mult)}`, emoji: '💰', style: 'success', disabled: g.round === 0 },
  ]];
  return { embeds: [{ color: done ? '#5865f2' : '#f0c040', title: '🃏 Higher or Lower', description: `${lines.join('\n')}${text ? `\n\n${text}` : ''}` }], components: rows };
}

export async function highlow(ctx, { config, vars, interaction }) {
  const { guild, user, error } = who(vars, interaction);
  if (error) return no(ctx, interaction, error);
  const { bet, error: betError } = betOf(ctx, config.bet, true);
  if (betError) return no(ctx, interaction, betError);
  const short = await take(ctx, guild, user, bet);
  if (short) return no(ctx, interaction, short);
  const g = await newGame(ctx, 'highlow', guild, user, { bet, card: roll(13), mult: 1, round: 0 });
  await ctx.interaction.reply(interaction, hlMessage(ctx, g, 'Is the next card higher or lower? Equal cards count as nothing.'));
  return { port: 'replied', results: { '': g.id } };
}

/** Pays the current value (end of the game, also when it expires). */
export async function cashOut(ctx, g) {
  const win = g.round ? Math.floor(g.bet * g.mult) : g.bet;
  await wallet(ctx).add(g.guild, g.user, win);
  return win;
}

// ---------- scratch card ----------

const SYMBOLS = ['💎', '7️⃣', '🍒', '🍋', '🍀', '⭐'];
/** Winning symbol -> chance and prize (times the price). Fair value about 99 %. */
export const SCRATCH = [['💎', 0.01, 20], ['7️⃣', 0.06, 5], ['🍒', 0.17, 2], ['🍋', 0.15, 1]];

/** Nine fields; the winning symbol three times, every other symbol at most twice. */
export function scratchCard() {
  let r = rng.next();
  let win = null;
  for (const [sym, p] of SCRATCH) {
    if (r < p) { win = sym; break; }
    r -= p;
  }
  const cells = win ? [win, win, win] : [];
  const pool = shuffle(SYMBOLS.filter((s) => s !== win).flatMap((s) => [s, s]));
  while (cells.length < 9) cells.push(pool.pop());
  return { cells: shuffle(cells), win };
}

function scratchMessage(ctx, g, text = '') {
  const done = g.open.every(Boolean);
  const rows = [0, 1, 2].map((r) => [0, 1, 2].map((c) => {
    const i = r * 3 + c;
    return g.open[i] ? { key: 'scratch', data: `${g.id}:${i}`, emoji: g.cells[i], style: g.cells[i] === g.win ? 'success' : 'secondary', disabled: true }
      : { key: 'scratch', data: `${g.id}:${i}`, label: '❔', style: 'secondary', disabled: done };
  }));
  if (!done) rows.push([{ key: 'scratch', data: `${g.id}:all`, label: 'Reveal all', style: 'primary' }]);
  const table = SCRATCH.map(([s, , x]) => `${s}${s}${s} ${x}×`).join(' · ');
  return { embeds: [{ color: done ? (g.win ? '#22c55e' : '#ef4444') : '#f0c040', title: '🎟️ Scratch card', description: `Three of a kind win! ${table}${text ? `\n\n${text}` : ''}` }], components: rows };
}

export async function scratchcard(ctx, { vars, interaction }) {
  const { guild, user, error } = who(vars, interaction);
  if (error) return no(ctx, interaction, error);
  const price = Math.floor(Number(setting(ctx, 'scratch_price', '100') || 0));
  if (price <= 0) return no(ctx, interaction, '❌ Scratch cards are not for sale on this bot.');
  const short = await take(ctx, guild, user, price);
  if (short) return no(ctx, interaction, short);
  const { cells, win } = scratchCard();
  const g = await newGame(ctx, 'scratch', guild, user, { price, cells, win, open: Array(9).fill(false) });
  await ctx.interaction.reply(interaction, scratchMessage(ctx, g, `Bought for ${money(ctx, price)}. Scratch!`));
  return { port: 'replied', results: { '': g.id } };
}

/** Pays the prize of a card (when all fields are open, or it expires). */
export async function scratchPrize(ctx, g) {
  const x = SCRATCH.find((s) => s[0] === g.win)?.[2] ?? 0;
  const prize = g.price * x;
  if (prize) await wallet(ctx).add(g.guild, g.user, prize);
  return prize;
}

// ---------- buttons ----------

export const luckComponents = {
  async hl(ctx, ev) {
    const [id, dir] = String(ev.data).split(':');
    const g = await loadGame(ctx, id);
    if (!g) return say(ctx, ev, '⌛ This game is over.');
    if (ev.user.id !== g.user) return say(ctx, ev, '❌ This is not your game.');
    if (dir === 'c') {
      if (!g.round) return say(ctx, ev, 'ℹ️ Guess at least once.');
      await endGame(ctx, g);
      const win = await cashOut(ctx, g);
      return ctx.interaction.update(ev.handle, hlMessage(ctx, g, `💰 Cashed out ${money(ctx, win)}!`, true));
    }
    const s = step(g.card, dir, rtp(ctx));
    if (!s) return say(ctx, ev, '❌ Not possible with this card.');
    const prev = g.card;
    const next = roll(13);
    g.card = next;
    if (next === prev) {
      await saveGame(ctx, g);
      return ctx.interaction.update(ev.handle, hlMessage(ctx, g, `${CARD[next]}: equal, nothing changes.`));
    }
    if ((dir === 'h') !== (next > prev)) {
      await endGame(ctx, g);
      return ctx.interaction.update(ev.handle, hlMessage(ctx, g, `${CARD[prev]} → **${CARD[next]}**: wrong! Bet lost: ${money(ctx, g.bet)}.`, true));
    }
    g.mult *= s;
    g.round += 1;
    if (g.round >= MAX_ROUNDS) {
      await endGame(ctx, g);
      const win = await cashOut(ctx, g);
      return ctx.interaction.update(ev.handle, hlMessage(ctx, g, `Last round! Paid out ${money(ctx, win)}.`, true));
    }
    await saveGame(ctx, g);
    await ctx.interaction.update(ev.handle, hlMessage(ctx, g, `${CARD[prev]} → **${CARD[next]}**: right!`));
  },

  async scratch(ctx, ev) {
    const [id, at] = String(ev.data).split(':');
    const g = await loadGame(ctx, id);
    if (!g) return say(ctx, ev, '⌛ This card is used up.');
    if (ev.user.id !== g.user) return say(ctx, ev, '❌ This is not your card.');
    if (at === 'all') g.open.fill(true);
    else if (Number(at) >= 0 && Number(at) < 9) g.open[Number(at)] = true;
    if (!g.open.every(Boolean)) {
      await saveGame(ctx, g);
      return ctx.interaction.update(ev.handle, scratchMessage(ctx, g));
    }
    await endGame(ctx, g);
    const prize = await scratchPrize(ctx, g);
    await ctx.interaction.update(ev.handle, scratchMessage(ctx, g, prize ? `🎉 ${g.win}${g.win}${g.win}: you win ${money(ctx, prize)}!` : 'No luck this time.'));
  },
};
