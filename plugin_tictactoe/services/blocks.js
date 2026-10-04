// /tictactoe: against the bot (no opponent) or a duel (opponent accepts
// first). A game lives in storage "g:<id>" = { id, guild, x, o (user or
// "bot"), bet, board, turn, accepted, at }; open games in "games".
import { betOf, money, take } from './econ.js';
import { readJson, writeJson } from './util.js';

const MARK = { X: '❌', O: '⭕' };

export function boardRows(g, done = false) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    rows.push([0, 1, 2].map((c) => {
      const i = r * 3 + c;
      const v = g.board[i];
      return { key: 'move', data: `${g.id}:${i}`, ...(v ? { emoji: MARK[v] } : { label: '·' }), style: v === 'X' ? 'danger' : v === 'O' ? 'primary' : 'secondary', disabled: done || Boolean(v) || !g.accepted };
    }));
  }
  return rows;
}

export function gameMessage(ctx, g, text, done = false) {
  const vs = g.o === 'bot' ? 'the bot' : `<@${g.o}>`;
  const bet = g.bet ? `\nBet: ${money(ctx, g.bet)}${g.o === 'bot' ? '' : ' each'}` : '';
  const rows = g.accepted ? boardRows(g, done) : [[{ key: 'accept', data: g.id, label: 'Accept', style: 'success' }, { key: 'decline', data: g.id, label: 'Decline', style: 'danger' }]];
  return { embeds: [{ color: done ? '#5865f2' : '#f0c040', title: '❌⭕ Tic Tac Toe', description: `<@${g.x}> ❌ vs ${vs} ⭕${bet}\n\n${text}` }], components: rows, mentionUsers: !g.accepted };
}

export async function saveGame(ctx, g) {
  await writeJson(ctx, `g:${g.id}`, g);
}

export async function endGame(ctx, g) {
  await ctx.storage.delete(`g:${g.id}`);
  await writeJson(ctx, 'games', (await readJson(ctx, 'games', [])).filter((x) => x !== g.id));
}

async function no(ctx, interaction, text) {
  if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
  return { port: 'failed', results: { '': text } };
}

export async function start(ctx, { config, vars, interaction }) {
  const guild = vars['server.id'];
  const user = vars['user.id'];
  if (!guild || !user || !interaction) return no(ctx, interaction, '❌ Only as a command on a server.');
  const opponent = String(config.opponent ?? '').replace(/\D/g, '');
  if (opponent === user) return no(ctx, interaction, '❌ You cannot play against yourself.');
  if (opponent) {
    const m = await ctx.member.get(guild, opponent).catch(() => null);
    if (!m || m.bot) return no(ctx, interaction, '❌ Choose a member (no bot), or nobody to play against the bot.');
  }
  const { bet, error } = betOf(ctx, config.bet, false);
  if (error) return no(ctx, interaction, error);
  const short = await take(ctx, guild, user, bet);
  if (short) return no(ctx, interaction, short);
  const g = { id: ctx.utils.uuid().replace(/-/g, '').slice(0, 12), guild, x: user, o: opponent || 'bot', bet, board: Array(9).fill(''), turn: 'X', accepted: !opponent, at: Date.now() };
  await saveGame(ctx, g);
  await writeJson(ctx, 'games', [...(await readJson(ctx, 'games', [])), g.id]);
  await ctx.interaction.reply(interaction, gameMessage(ctx, g, g.accepted ? `<@${g.x}>, your move.` : `<@${g.o}>, do you accept?`));
  return { port: 'replied', results: { '': g.id } };
}
