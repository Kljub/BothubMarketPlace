// Buttons: accept / decline a duel, and moves. Against the bot the bot
// answers at once. Bets: vs bot a win pays 2x, a draw gives the bet back; in
// a duel the winner gets both bets, a draw pays both back.
import { endGame, gameMessage, saveGame } from './blocks.js';
import { money, take } from './econ.js';
import { botMove, winner } from './game.js';
import { readJson } from './util.js';

const say = (ctx, ev, text) => ctx.interaction.reply(ev.handle, text, { ephemeral: true });

export async function refund(ctx, g) {
  if (!g.bet) return;
  await ctx.economy.add(g.guild, g.x, g.bet);
  if (g.o !== 'bot' && g.accepted) await ctx.economy.add(g.guild, g.o, g.bet);
}

async function finish(ctx, ev, g, result) {
  await endGame(ctx, g);
  let text;
  if (result === 'draw') {
    await refund(ctx, g);
    text = `🤝 Draw!${g.bet ? ' Bets back.' : ''}`;
  } else {
    const who = result === 'X' ? g.x : g.o;
    const pot = g.bet * 2;
    if (who !== 'bot' && pot) await ctx.economy.add(g.guild, who, pot);
    text = who === 'bot' ? `🤖 The bot wins!${g.bet ? ' Bet lost.' : ''}` : `🏆 <@${who}> wins!${pot ? ` Prize: ${money(ctx, pot)}.` : ''}`;
  }
  await ctx.interaction.update(ev.handle, gameMessage(ctx, g, text, true));
}

export const components = {
  async accept(ctx, ev) {
    const g = await readJson(ctx, `g:${ev.data}`, null);
    if (!g) return say(ctx, ev, '⌛ This game is over.');
    if (ev.user.id !== g.o) return say(ctx, ev, '❌ Only the challenged member can answer.');
    if (g.accepted) return say(ctx, ev, 'ℹ️ Already accepted.');
    const short = await take(ctx, g.guild, g.o, g.bet);
    if (short) return say(ctx, ev, short);
    g.accepted = true;
    g.at = Date.now();
    await saveGame(ctx, g);
    await ctx.interaction.update(ev.handle, gameMessage(ctx, g, `<@${g.x}>, your move.`));
  },

  async decline(ctx, ev) {
    const g = await readJson(ctx, `g:${ev.data}`, null);
    if (!g) return say(ctx, ev, '⌛ This game is over.');
    if (ev.user.id !== g.o && ev.user.id !== g.x) return say(ctx, ev, '❌ This is not your game.');
    if (g.accepted) return say(ctx, ev, 'ℹ️ The game already runs.');
    await refund(ctx, g);
    await endGame(ctx, g);
    await ctx.interaction.update(ev.handle, gameMessage(ctx, { ...g, accepted: true }, `${ev.user.id === g.o ? 'Declined' : 'Taken back'}.${g.bet ? ' The bet is paid back.' : ''}`, true));
  },

  async move(ctx, ev) {
    const [id, at] = String(ev.data).split(':');
    const g = await readJson(ctx, `g:${id}`, null);
    if (!g || !g.accepted) return say(ctx, ev, '⌛ This game is over.');
    const player = g.turn === 'X' ? g.x : g.o;
    if (ev.user.id !== g.x && ev.user.id !== g.o) return say(ctx, ev, '❌ This is not your game.');
    if (ev.user.id !== player) return say(ctx, ev, '⏳ Not your turn.');
    const i = Number(at);
    if (!(i >= 0 && i < 9) || g.board[i]) return say(ctx, ev, '❌ This field is taken.');
    g.board[i] = g.turn;
    let result = winner(g.board);
    if (!result && g.o === 'bot') {
      g.board[botMove(g.board)] = 'O';
      result = winner(g.board);
    } else if (!result) {
      g.turn = g.turn === 'X' ? 'O' : 'X';
    }
    if (result) return finish(ctx, ev, g, result);
    g.at = Date.now();
    await saveGame(ctx, g);
    await ctx.interaction.update(ev.handle, gameMessage(ctx, g, `<@${g.turn === 'X' ? g.x : g.o}>, your move.`));
  },
};
