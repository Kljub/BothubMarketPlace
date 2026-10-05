// Buttons: blackjack Hit / Stand / Split and "🔄 Again" of every game
// (only the player; the new round takes a new bet).
import { bjMessage, gameMessage, newBlackjack, rtpOf, stake } from './blocks.js';
import { money, pay, wallet } from './econ.js';
import { canSplit, dealerPlay, handValue, resolveHand } from './games.js';
import { readJson, writeJson } from './util.js';

export async function endHand(ctx, s) {
  await ctx.storage.delete(`bj:${s.id}`);
  await writeJson(ctx, 'hands', (await readJson(ctx, 'hands', [])).filter((x) => x !== s.id));
}

/** Dealer plays, every hand is paid; the finished message. */
export async function settle(ctx, s) {
  dealerPlay(s);
  const lines = [];
  let total = 0;
  s.hands.forEach((h, i) => {
    const r = resolveHand(h.cards, s.dealer, h.bet, rtpOf(ctx), s.hands.length > 1);
    total += r.payout;
    const word = { bust: '💥 Bust', blackjack: '🃏 Blackjack!', win: '🎉 Won', lose: '💀 Lost', push: '🤝 Push' }[r.outcome];
    lines.push(`${s.hands.length > 1 ? `Hand ${i + 1}: ` : ''}${word}${r.payout ? ` · ${money(ctx, r.payout)}` : ''}`);
  });
  const balance = await pay(ctx, s.guild, s.user, total);
  await endHand(ctx, s);
  lines.push(`Balance: ${money(ctx, balance)}`);
  return bjMessage(ctx, s, true, lines);
}

const mine = async (ctx, ev, user) => {
  if (ev.user.id === user) return true;
  await ctx.interaction.reply(ev.handle, '❌ This is not your game.', { ephemeral: true });
  return false;
};

export const components = {
  async bj(ctx, ev) {
    const [id, action] = String(ev.data).split(':');
    const s = await readJson(ctx, `bj:${id}`, null);
    if (!s) return ctx.interaction.reply(ev.handle, '⌛ This hand is over.', { ephemeral: true });
    if (!(await mine(ctx, ev, s.user))) return;
    const hand = s.hands[s.active];
    if (action === 'split') {
      if (s.hands.length > 1 || !canSplit(hand.cards)) return ctx.interaction.reply(ev.handle, '❌ No split possible.', { ephemeral: true });
      try {
        await wallet(ctx).remove(s.guild, s.user, s.bet);
      } catch {
        return ctx.interaction.reply(ev.handle, '❌ Not enough for a second bet.', { ephemeral: true });
      }
      s.hands = [{ cards: [hand.cards[0], s.deck.pop()], bet: s.bet }, { cards: [hand.cards[1], s.deck.pop()], bet: s.bet }];
    } else if (action === 'hit') {
      hand.cards.push(s.deck.pop());
      if (handValue(hand.cards) >= 21) s.active += 1;
    } else {
      s.active += 1;
    }
    s.at = Date.now();
    if (s.active >= s.hands.length) return ctx.interaction.update(ev.handle, await settle(ctx, s));
    await writeJson(ctx, `bj:${s.id}`, s);
    await ctx.interaction.update(ev.handle, bjMessage(ctx, s));
  },

  async again(ctx, ev) {
    const [game, user, betText, extra] = String(ev.data).split(':');
    if (!(await mine(ctx, ev, user))) return;
    const { bet, error } = await stake(ctx, ev.guildId, user, betText);
    if (error) return ctx.interaction.reply(ev.handle, error, { ephemeral: true });
    if (game === 'blackjack') {
      const { s, done } = await newBlackjack(ctx, ev.guildId, user, bet);
      return ctx.interaction.reply(ev.handle, done ? await settle(ctx, s) : bjMessage(ctx, s));
    }
    await ctx.interaction.reply(ev.handle, await gameMessage(ctx, game, ev.guildId, user, bet, extra));
  },
};
