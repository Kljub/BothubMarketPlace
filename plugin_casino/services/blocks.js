// The blocks behind the casino commands. Each takes the bet, plays and
// answers itself with the result and a "🔄 Again" button.
import { betOf, money, pay, take } from './econ.js';
import { canSplit, coinflip, deck, dice, handValue, isBlackjack, roulette, slots } from './games.js';
import { readJson, setting, writeJson } from './util.js';

export const rtpOf = (ctx) => Number(setting(ctx, 'rtp', 95));

export const againRow = (game, user, bet, extra = '') => [[{ key: 'again', data: `${game}:${user}:${bet}:${extra}`.slice(0, 64), label: 'Again', emoji: '🔄', style: 'secondary' }]];

async function no(ctx, interaction, text) {
  if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
  return { port: 'failed', results: { '': text } };
}

/** Checks and takes the bet; { bet } or { error }. */
export async function stake(ctx, guild, user, rawBet) {
  if (!guild || !user) return { error: '❌ Only on a server.' };
  const { bet, error } = betOf(ctx, rawBet);
  if (error) return { error };
  const short = await take(ctx, guild, user, bet);
  return short ? { error: short } : { bet };
}

/** Runs one simple game; returns the message. play(bet) -> { win, payout, line }. */
export async function simple(ctx, guild, user, bet, title, playIt, again) {
  const res = playIt(bet);
  const balance = await pay(ctx, guild, user, res.payout);
  const result = res.win ? `🎉 Won ${money(ctx, res.payout)}!` : res.payout > 0 ? `Back: ${money(ctx, res.payout)}` : '💀 Lost.';
  return {
    embeds: [{ color: res.win ? '#22c55e' : '#ef4444', title, description: `${res.line}\n\n${result}\nBet: ${money(ctx, bet)} · Balance: ${money(ctx, balance)}` }],
    components: againRow(...again),
  };
}

export function gameMessage(ctx, game, guild, user, bet, extra) {
  const rtp = rtpOf(ctx);
  switch (game) {
    case 'coinflip':
      return simple(ctx, guild, user, bet, '🪙 Coinflip', (b) => {
        const r = coinflip(b, extra, rtp);
        return { ...r, line: `You chose **${extra === 'heads' ? 'heads' : 'tails'}** · it is **${r.result}**` };
      }, ['coinflip', user, bet, extra]);
    case 'dice':
      return simple(ctx, guild, user, bet, '🎲 Dice', (b) => {
        const r = dice(b, Number(extra), rtp);
        return { ...r, line: `You guessed **${extra}** · rolled **${r.roll}**` };
      }, ['dice', user, bet, extra]);
    case 'slots':
      return simple(ctx, guild, user, bet, '🎰 Slots', (b) => {
        const r = slots(b, rtp);
        return { ...r, line: `[ ${r.reels.join(' | ')} ]` };
      }, ['slots', user, bet, '']);
    case 'roulette':
      return simple(ctx, guild, user, bet, '🎡 Roulette', (b) => {
        const r = roulette(b, extra, rtp);
        const c = { red: '🔴', black: '⚫', green: '🟢' }[r.color];
        return { ...r, line: `You bet on **${extra}** · the ball lands on ${c} **${r.pocket}**` };
      }, ['roulette', user, bet, extra]);
    default:
      return null;
  }
}

function block(game, checkExtra) {
  return async (ctx, { config, vars, interaction }) => {
    const guild = vars['server.id'];
    const user = vars['user.id'];
    const extra = checkExtra ? checkExtra(config) : '';
    if (extra === null) return no(ctx, interaction, '❌ Unknown choice.');
    const { bet, error } = await stake(ctx, guild, user, config.bet);
    if (error) return no(ctx, interaction, error);
    const message = await gameMessage(ctx, game, guild, user, bet, extra);
    if (interaction) await ctx.interaction.reply(interaction, message);
    return { port: interaction ? 'replied' : 'next', results: { '': message.embeds[0].description } };
  };
}

export const coinflipBlock = block('coinflip', (c) => ({ heads: 'heads', tails: 'tails', kopf: 'heads', zahl: 'tails' })[String(c.side ?? '').toLowerCase()] ?? null);
export const diceBlock = block('dice', (c) => (/^[1-6]$/.test(String(c.number ?? '').trim()) ? String(c.number).trim() : null));
export const slotsBlock = block('slots');
export const rouletteBlock = block('roulette', (c) => {
  const f = String(c.field ?? '').trim().toLowerCase();
  return /^(\d|[12]\d|3[0-6])$/.test(f) || ['red', 'black', 'even', 'odd', 'low', 'high'].includes(f) ? f : null;
});

// ---- blackjack: a hand lives in storage "bj:<id>" ----
export function bjMessage(ctx, s, done = false, lines = []) {
  const hands = s.hands.map((h, i) => `${s.hands.length > 1 ? `Hand ${i + 1}${i === s.active && !done ? ' ▶' : ''}: ` : 'You: '}${h.cards.join(' ')} (**${handValue(h.cards)}**)`);
  const dealer = done ? `${s.dealer.join(' ')} (**${handValue(s.dealer)}**)` : `${s.dealer[0]} 🂠`;
  const hand = s.hands[s.active];
  const buttons = done
    ? againRow('blackjack', s.user, s.bet)
    : [[
        { key: 'bj', data: `${s.id}:hit`, label: 'Hit', style: 'success' },
        { key: 'bj', data: `${s.id}:stand`, label: 'Stand', style: 'danger' },
        ...(s.hands.length === 1 && canSplit(hand.cards) ? [{ key: 'bj', data: `${s.id}:split`, label: 'Split', style: 'primary' }] : []),
      ]];
  return { embeds: [{ color: done ? '#5865f2' : '#f0c040', title: '🃏 Blackjack', description: [...hands, `Dealer: ${dealer}`, ...(lines.length ? ['', ...lines] : [])].join('\n') }], components: buttons };
}

export async function newBlackjack(ctx, guild, user, bet) {
  const d = deck();
  const s = { id: ctx.utils.uuid().replace(/-/g, '').slice(0, 12), guild, user, bet, deck: d, dealer: [d.pop(), d.pop()], hands: [{ cards: [d.pop(), d.pop()], bet }], active: 0, at: Date.now() };
  // A natural blackjack (either side) ends at once.
  if (isBlackjack(s.hands[0].cards) || isBlackjack(s.dealer)) return { s, done: true };
  await writeJson(ctx, `bj:${s.id}`, s);
  await writeJson(ctx, 'hands', [...(await readJson(ctx, 'hands', [])), s.id]);
  return { s, done: false };
}

export async function blackjackBlock(ctx, { config, vars, interaction }) {
  const guild = vars['server.id'];
  const user = vars['user.id'];
  if (!interaction) return no(ctx, null, '❌ Only as a command.');
  const { bet, error } = await stake(ctx, guild, user, config.bet);
  if (error) return no(ctx, interaction, error);
  const { s, done } = await newBlackjack(ctx, guild, user, bet);
  const { settle } = await import('./interactions.js');
  await ctx.interaction.reply(interaction, done ? await settle(ctx, s) : bjMessage(ctx, s));
  return { port: 'replied', results: { '': s.id } };
}
