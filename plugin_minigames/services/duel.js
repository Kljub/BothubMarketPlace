// Duels with a member and an optional bet: /dicebet (both roll 2 dice,
// higher wins the pot, a tie pays back; without opponent against the bot)
// and /dos (double or steal: both pick secretly; both double = both win
// their bet, one steals = the pot to the stealer, both steal = both lose).
import { betOf, money, take, wallet } from './econ.js';
import { endGame, loadGame, newGame, no, roll, saveGame, say, who } from './core.js';

const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

async function opponentOf(ctx, guild, user, raw, required) {
  const id = String(raw ?? '').replace(/\D/g, '');
  if (!id) return required ? { error: '❌ Choose a member.' } : { id: '' };
  if (id === user) return { error: '❌ You cannot play against yourself.' };
  const m = await ctx.member.get(guild, id).catch(() => null);
  if (!m || m.bot) return { error: '❌ Choose a member (no bot).' };
  return { id };
}

const challenge = (g) => [[{ key: 'duel_accept', data: g.id, label: 'Accept', style: 'success' }, { key: 'duel_decline', data: g.id, label: 'Decline', style: 'danger' }]];

/** Refund of a duel that never finished. */
export async function refundDuel(ctx, g) {
  if (!g.bet) return;
  await wallet(ctx).add(g.guild, g.user, g.bet);
  if (g.accepted) await wallet(ctx).add(g.guild, g.opponent, g.bet);
}

// ---------- dicebet ----------

function diceMessage(ctx, g, text, done) {
  const vs = g.opponent ? `<@${g.opponent}>` : 'the bot';
  const bet = g.bet ? `\nBet: ${money(ctx, g.bet)}${g.opponent ? ' each' : ''}` : '';
  return { embeds: [{ color: done ? '#5865f2' : '#f0c040', title: '🎲 Dice bet', description: `<@${g.user}> vs ${vs}${bet}\n\n${text}` }], components: done ? [] : challenge(g), mentionUsers: !done };
}

async function rollOff(ctx, g) {
  const a = [roll(6), roll(6)];
  const b = [roll(6), roll(6)];
  const sa = a[0] + a[1];
  const sb = b[0] + b[1];
  const show = (d, s) => `${DIE[d[0]]} ${DIE[d[1]]} = **${s}**`;
  const other = g.opponent ? `<@${g.opponent}>` : '🤖 Bot';
  let text = `<@${g.user}>: ${show(a, sa)}\n${other}: ${show(b, sb)}\n\n`;
  if (sa === sb) {
    await refundDuel(ctx, g);
    text += `🤝 Tie!${g.bet ? ' Bets back.' : ''}`;
  } else {
    const winner = sa > sb ? g.user : g.opponent;
    if (winner && g.bet) await wallet(ctx).add(g.guild, winner, g.bet * 2);
    text += winner ? `🏆 <@${winner}> wins${g.bet ? ` ${money(ctx, g.bet * 2)}` : ''}!` : `🤖 The bot wins!${g.bet ? ' Bet lost.' : ''}`;
  }
  return text;
}

export async function dicebet(ctx, { config, vars, interaction }) {
  const { guild, user, error } = who(vars, interaction);
  if (error) return no(ctx, interaction, error);
  const opp = await opponentOf(ctx, guild, user, config.opponent, false);
  if (opp.error) return no(ctx, interaction, opp.error);
  const { bet, error: betError } = betOf(ctx, config.bet, false);
  if (betError) return no(ctx, interaction, betError);
  const short = await take(ctx, guild, user, bet);
  if (short) return no(ctx, interaction, short);
  if (!opp.id) {
    const text = await rollOff(ctx, { guild, user, opponent: '', bet, accepted: true });
    await ctx.interaction.reply(interaction, diceMessage(ctx, { user, opponent: '', bet }, text, true));
    return { port: 'replied', results: { '': 'done' } };
  }
  const g = await newGame(ctx, 'dicebet', guild, user, { opponent: opp.id, bet, accepted: false });
  await ctx.interaction.reply(interaction, diceMessage(ctx, g, `<@${g.opponent}>, do you accept?`, false));
  return { port: 'replied', results: { '': g.id } };
}

// ---------- double or steal ----------

function dosMessage(ctx, g, text, done) {
  const state = (u) => (g.picks?.[u] ? '✅ picked' : '…');
  const rows = done ? [] : g.accepted
    ? [[{ key: 'dos_pick', data: `${g.id}:d`, label: 'Double', emoji: '💰', style: 'success' }, { key: 'dos_pick', data: `${g.id}:s`, label: 'Steal', emoji: '🗡️', style: 'danger' }]]
    : challenge(g);
  const lines = [`<@${g.user}> vs <@${g.opponent}>`, `Pot: ${money(ctx, g.bet * 2)}`];
  if (g.accepted && !done) lines.push(`<@${g.user}>: ${state(g.user)} · <@${g.opponent}>: ${state(g.opponent)}`);
  return { embeds: [{ color: done ? '#5865f2' : '#f0c040', title: '💰 Double or Steal', description: `${lines.join('\n')}\n\n${text}` }], components: rows, mentionUsers: !g.accepted };
}

export async function dos(ctx, { config, vars, interaction }) {
  const { guild, user, error } = who(vars, interaction);
  if (error) return no(ctx, interaction, error);
  const opp = await opponentOf(ctx, guild, user, config.opponent, true);
  if (opp.error) return no(ctx, interaction, opp.error);
  const { bet, error: betError } = betOf(ctx, config.bet, true);
  if (betError) return no(ctx, interaction, betError);
  const short = await take(ctx, guild, user, bet);
  if (short) return no(ctx, interaction, short);
  const g = await newGame(ctx, 'dos', guild, user, { opponent: opp.id, bet, accepted: false, picks: {} });
  await ctx.interaction.reply(interaction, dosMessage(ctx, g, `<@${g.opponent}>, do you accept? Both pick **Double** or **Steal** in secret.`, false));
  return { port: 'replied', results: { '': g.id } };
}

/** Outcome of double or steal: what each player gets back. */
export function dosOutcome(a, b, bet) {
  if (a === 'd' && b === 'd') return [bet * 2, bet * 2];
  if (a === 's' && b === 'd') return [bet * 2, 0];
  if (a === 'd' && b === 's') return [0, bet * 2];
  return [0, 0];
}

// ---------- buttons ----------

export const duelComponents = {
  async duel_accept(ctx, ev) {
    const g = await loadGame(ctx, ev.data);
    if (!g || g.accepted) return say(ctx, ev, '⌛ This game is over.');
    if (ev.user.id !== g.opponent) return say(ctx, ev, '❌ Only the challenged member can answer.');
    const short = await take(ctx, g.guild, g.opponent, g.bet);
    if (short) return say(ctx, ev, short);
    g.accepted = true;
    if (g.kind === 'dicebet') {
      await endGame(ctx, g);
      return ctx.interaction.update(ev.handle, diceMessage(ctx, g, await rollOff(ctx, g), true));
    }
    await saveGame(ctx, g);
    await ctx.interaction.update(ev.handle, dosMessage(ctx, g, 'Pick in secret!', false));
  },

  async duel_decline(ctx, ev) {
    const g = await loadGame(ctx, ev.data);
    if (!g || g.accepted) return say(ctx, ev, '⌛ This game is over.');
    if (ev.user.id !== g.opponent && ev.user.id !== g.user) return say(ctx, ev, '❌ This is not your game.');
    await refundDuel(ctx, g);
    await endGame(ctx, g);
    const text = `${ev.user.id === g.opponent ? 'Declined' : 'Taken back'}.${g.bet ? ' The bet is paid back.' : ''}`;
    await ctx.interaction.update(ev.handle, g.kind === 'dicebet' ? diceMessage(ctx, g, text, true) : dosMessage(ctx, g, text, true));
  },

  async dos_pick(ctx, ev) {
    const [id, choice] = String(ev.data).split(':');
    const g = await loadGame(ctx, id);
    if (!g || !g.accepted) return say(ctx, ev, '⌛ This game is over.');
    if (ev.user.id !== g.user && ev.user.id !== g.opponent) return say(ctx, ev, '❌ This is not your game.');
    if (g.picks[ev.user.id]) return say(ctx, ev, 'ℹ️ You already picked.');
    g.picks[ev.user.id] = choice === 's' ? 's' : 'd';
    if (!g.picks[g.user] || !g.picks[g.opponent]) {
      await saveGame(ctx, g);
      return ctx.interaction.update(ev.handle, dosMessage(ctx, g, 'Waiting for the other pick…', false));
    }
    await endGame(ctx, g);
    const [pa, pb] = dosOutcome(g.picks[g.user], g.picks[g.opponent], g.bet);
    if (pa) await wallet(ctx).add(g.guild, g.user, pa);
    if (pb) await wallet(ctx).add(g.guild, g.opponent, pb);
    const name = (c) => (c === 's' ? '🗡️ Steal' : '💰 Double');
    const text = `<@${g.user}>: ${name(g.picks[g.user])}\n<@${g.opponent}>: ${name(g.picks[g.opponent])}\n\n` + (
      pa && pb ? `Both doubled: ${money(ctx, pa)} each!`
        : pa ? `<@${g.user}> steals the pot: ${money(ctx, pa)}!`
          : pb ? `<@${g.opponent}> steals the pot: ${money(ctx, pb)}!`
            : 'Both stole: the pot is gone!');
    await ctx.interaction.update(ev.handle, dosMessage(ctx, g, text, true));
  },
};
