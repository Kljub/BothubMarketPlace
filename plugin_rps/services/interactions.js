// Buttons of a duel: accept / decline (opponent), then both pick in the same
// message; a pick is confirmed privately, so nobody sees the other's choice
// until both picked.
import { duelMessage, EMOJI, endDuel, getDuel, LABEL, money, refund, resolve, saveDuel, take } from './game.js';

const say = (ctx, ev, text) => ctx.interaction.reply(ev.handle, text, { ephemeral: true });

export const components = {
  async accept(ctx, ev) {
    const d = await getDuel(ctx, ev.data);
    if (!d) return say(ctx, ev, '⌛ This duel is over.');
    if (ev.user.id !== d.opponent) return say(ctx, ev, '❌ Only the challenged member can answer.');
    if (d.accepted) return say(ctx, ev, 'ℹ️ Already accepted.');
    const short = await take(ctx, d.guild, d.opponent, d.bet);
    if (short) return say(ctx, ev, short);
    d.accepted = true;
    d.at = Date.now();
    await saveDuel(ctx, d);
    await ctx.interaction.update(ev.handle, duelMessage(d, `<@${d.challenger}> vs <@${d.opponent}>: pick now (2 minutes).`, '#5865f2', 'pick'));
  },

  async decline(ctx, ev) {
    const d = await getDuel(ctx, ev.data);
    if (!d) return say(ctx, ev, '⌛ This duel is over.');
    if (ev.user.id !== d.opponent && ev.user.id !== d.challenger) return say(ctx, ev, '❌ This is not your duel.');
    if (d.accepted) return say(ctx, ev, 'ℹ️ The duel already runs.');
    await refund(ctx, d);
    await endDuel(ctx, d);
    const who = ev.user.id === d.opponent ? `<@${d.opponent}> declined.` : `<@${d.challenger}> took the challenge back.`;
    await ctx.interaction.update(ev.handle, duelMessage(d, `${who}${d.bet ? ' The bet is paid back.' : ''}`, '#6b7280', 'none'));
  },

  async pick(ctx, ev) {
    const [id, choice] = String(ev.data).split(':');
    const d = await getDuel(ctx, id);
    if (!d || !d.accepted) return say(ctx, ev, '⌛ This duel is over.');
    if (ev.user.id !== d.challenger && ev.user.id !== d.opponent) return say(ctx, ev, '❌ This is not your duel.');
    if (d.picks[ev.user.id]) return say(ctx, ev, `ℹ️ You already picked ${EMOJI[d.picks[ev.user.id]]}.`);
    d.picks[ev.user.id] = choice;
    if (!d.picks[d.challenger] || !d.picks[d.opponent]) {
      await saveDuel(ctx, d);
      return say(ctx, ev, `✅ You picked ${EMOJI[choice]} ${LABEL[choice]}. Waiting for the other one.`);
    }
    await endDuel(ctx, d);
    const a = d.picks[d.challenger];
    const b = d.picks[d.opponent];
    const outcome = resolve(a, b);
    let line;
    if (outcome === 'tie') {
      line = '🤝 Tie!';
      if (d.bet) {
        await refund(ctx, d);
        line += ' Both get their bet back.';
      }
    } else {
      const winner = outcome === 'a' ? d.challenger : d.opponent;
      line = `🏆 <@${winner}> wins!`;
      if (d.bet) {
        await ctx.economy.add(d.guild, winner, d.bet * 2);
        line += ` Prize: ${money(ctx, d.bet * 2)}.`;
      }
    }
    const color = outcome === 'tie' ? '#eab308' : '#22c55e';
    await ctx.interaction.update(ev.handle, duelMessage(d, `<@${d.challenger}>: ${EMOJI[a]} ${LABEL[a]}\n<@${d.opponent}>: ${EMOJI[b]} ${LABEL[b]}\n\n${line}`, color, 'none'));
  },
};
