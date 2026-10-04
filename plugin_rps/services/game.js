// Service "game": rules, bets and the duel state. Bets use the bot's Economy
// module (ctx.economy, the same balances as /balance); without a bet nothing
// touches it. A duel lives in storage "duel:<id>" = { challenger, opponent,
// bet, guild, channel, message, accepted, picks, at } and ends after 2
// minutes without both picks (bets are paid back, task "expire").
import { readJson, setting, writeJson } from './util.js';

export const CHOICES = ['rock', 'paper', 'scissors'];
export const EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };
export const LABEL = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };
export const DUEL_MS = 120_000;
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

/** 'a' when a wins, 'b' when b wins, 'tie'. */
export function resolve(a, b) {
  if (a === b) return 'tie';
  return BEATS[a] === b ? 'a' : 'b';
}

export const randomChoice = (ctx) => CHOICES[ctx.utils.random(0, 2)];

export function choiceOf(v) {
  const s = String(v ?? '').trim().toLowerCase();
  const map = { stein: 'rock', papier: 'paper', schere: 'scissors', '🪨': 'rock', '📄': 'paper', '✂️': 'scissors' };
  return CHOICES.includes(s) ? s : map[s] ?? null;
}

export const money = (ctx, n) => `**${Number(n).toLocaleString('en-US')}** ${setting(ctx, 'currency', 'coins')}`;

/** The bet as a whole number; error text when it is not allowed. */
export function betOf(ctx, v) {
  const s = String(v ?? '').trim();
  if (!s) return { bet: 0 };
  const bet = Math.floor(Number(s));
  if (!(bet >= 1)) return { error: '❌ The bet must be a number from 1.' };
  const max = Number(setting(ctx, 'max_bet', '') || 0);
  if (max && bet > max) return { error: `❌ The highest bet is ${money(ctx, max)}.` };
  return { bet };
}

/** Takes the bet; error text when the balance is too low. */
export async function take(ctx, guild, user, bet) {
  if (!bet) return null;
  try {
    await ctx.economy.remove(guild, user, bet);
    return null;
  } catch (err) {
    if (String(err?.message ?? err).includes('not_enough')) return `❌ Not enough ${setting(ctx, 'currency', 'coins')}: you have ${money(ctx, await ctx.economy.get(guild, user))}.`;
    throw err;
  }
}

export const getDuel = (ctx, id) => readJson(ctx, `duel:${String(id).replace(/[^a-z0-9]/g, '')}`, null);
export const saveDuel = (ctx, d) => writeJson(ctx, `duel:${d.id}`, d);

export async function endDuel(ctx, d) {
  await ctx.storage.delete(`duel:${d.id}`);
  const open = (await readJson(ctx, 'duels', [])).filter((x) => x !== d.id);
  await writeJson(ctx, 'duels', open);
}

export async function newDuel(ctx, d) {
  await saveDuel(ctx, d);
  await writeJson(ctx, 'duels', [...(await readJson(ctx, 'duels', [])), d.id]);
}

/** Pays the bets back (challenger always, opponent once accepted). */
export async function refund(ctx, d) {
  if (!d.bet) return;
  await ctx.economy.add(d.guild, d.challenger, d.bet);
  if (d.accepted) await ctx.economy.add(d.guild, d.opponent, d.bet);
}

export function duelMessage(d, text, color = '#f0c040', buttons = 'invite') {
  const bet = d.bet ? `\nBet: ${d.betText} each` : '\nNo bet.';
  const rows = buttons === 'invite'
    ? [[{ key: 'accept', data: d.id, label: 'Accept', style: 'success' }, { key: 'decline', data: d.id, label: 'Decline', style: 'danger' }]]
    : buttons === 'pick'
      ? [CHOICES.map((c) => ({ key: 'pick', data: `${d.id}:${c}`, label: LABEL[c], emoji: EMOJI[c], style: 'secondary' }))]
      : [];
  return { embeds: [{ color, title: '⚔️ Rock, Paper, Scissors duel', description: `${text}${buttons === 'none' ? '' : bet}` }], components: rows, mentionUsers: buttons === 'invite' };
}
