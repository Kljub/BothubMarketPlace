// Chess: /chess against a member or the bot, moves with /chess-move
// (e2e4, e7e8q or SAN like Nf3, O-O), "Resign" button. Full rules: castling,
// en passant, promotion, check, checkmate, stalemate, 50-move rule and bare
// kings. Square index = rank * 8 + file (a1 = 0, h8 = 63); white pieces are
// upper case. The bot plays one move deep: mate, then the best capture.
// Storage: the game "g:<id>" (kind "chess") and "chess:<guild>:<user>" = id.
import { endGame, loadGame, newGame, no, pick, saveGame, say, who } from './core.js';

const START = 'rnbqkbnrpppppppp' + '.'.repeat(32) + 'PPPPPPPPRNBQKBNR';
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const FILES = 'abcdefgh';

export function newBoard() {
  // START is written rank 8 first; turn it into a1 = 0.
  const rows = START.match(/.{8}/g).reverse();
  return { board: rows.join('').split('').map((c) => (c === '.' ? '' : c)), turn: 'w', castle: 'KQkq', ep: -1, half: 0 };
}

const colorOf = (p) => (!p ? '' : p === p.toUpperCase() ? 'w' : 'b');
const sq = (i) => `${FILES[i % 8]}${Math.floor(i / 8) + 1}`;
const at = (s) => (/^[a-h][1-8]$/.test(s) ? (Number(s[1]) - 1) * 8 + FILES.indexOf(s[0]) : -1);
const on = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

/** True when the square is attacked by the given color. */
export function attacked(board, i, by) {
  const f = i % 8;
  const r = Math.floor(i / 8);
  const is = (ff, rr, kinds) => on(ff, rr) && colorOf(board[rr * 8 + ff]) === by && kinds.includes(board[rr * 8 + ff].toLowerCase());
  const pr = by === 'w' ? r - 1 : r + 1;
  if (is(f - 1, pr, 'p') || is(f + 1, pr, 'p')) return true;
  for (const [df, dr] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) if (is(f + df, r + dr, 'n')) return true;
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) if ((df || dr) && is(f + df, r + dr, 'k')) return true;
  for (const [df, dr, kinds] of [[1, 0, 'rq'], [-1, 0, 'rq'], [0, 1, 'rq'], [0, -1, 'rq'], [1, 1, 'bq'], [1, -1, 'bq'], [-1, 1, 'bq'], [-1, -1, 'bq']]) {
    for (let ff = f + df, rr = r + dr; on(ff, rr); ff += df, rr += dr) {
      const p = board[rr * 8 + ff];
      if (!p) continue;
      if (colorOf(p) === by && kinds.includes(p.toLowerCase())) return true;
      break;
    }
  }
  return false;
}

const kingOf = (board, color) => board.findIndex((p) => p === (color === 'w' ? 'K' : 'k'));
export const inCheck = (s, color = s.turn) => attacked(s.board, kingOf(s.board, color), color === 'w' ? 'b' : 'w');

/** Moves without the check test: { from, to, promo?, castle?, ep? }. */
function pseudo(s) {
  const out = [];
  const me = s.turn;
  const them = me === 'w' ? 'b' : 'w';
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (colorOf(p) !== me) continue;
    const f = i % 8;
    const r = Math.floor(i / 8);
    const kind = p.toLowerCase();
    const add = (to) => {
      if (kind === 'p' && (Math.floor(to / 8) === 7 || Math.floor(to / 8) === 0)) for (const promo of 'qrbn') out.push({ from: i, to, promo });
      else out.push({ from: i, to });
    };
    if (kind === 'p') {
      const dir = me === 'w' ? 1 : -1;
      const one = (r + dir) * 8 + f;
      if (on(f, r + dir) && !s.board[one]) {
        add(one);
        const two = (r + 2 * dir) * 8 + f;
        if ((me === 'w' ? r === 1 : r === 6) && !s.board[two]) out.push({ from: i, to: two });
      }
      for (const df of [-1, 1]) {
        if (!on(f + df, r + dir)) continue;
        const to = (r + dir) * 8 + f + df;
        if (colorOf(s.board[to]) === them) add(to);
        else if (to === s.ep) out.push({ from: i, to, ep: true });
      }
    } else if (kind === 'n' || kind === 'k') {
      const steps = kind === 'n' ? [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [df, dr] of steps) if (on(f + df, r + dr) && colorOf(s.board[(r + dr) * 8 + f + df]) !== me) out.push({ from: i, to: (r + dr) * 8 + f + df });
      if (kind === 'k' && i === (me === 'w' ? 4 : 60) && !inCheck(s)) {
        const base = me === 'w' ? 0 : 56;
        const [kSide, qSide] = me === 'w' ? ['K', 'Q'] : ['k', 'q'];
        if (s.castle.includes(kSide) && !s.board[base + 5] && !s.board[base + 6] && !attacked(s.board, base + 5, them)) out.push({ from: i, to: base + 6, castle: true });
        if (s.castle.includes(qSide) && !s.board[base + 3] && !s.board[base + 2] && !s.board[base + 1] && !attacked(s.board, base + 3, them)) out.push({ from: i, to: base + 2, castle: true });
      }
    } else {
      const dirs = { b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], r: [[1, 0], [-1, 0], [0, 1], [0, -1]], q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]] }[kind];
      for (const [df, dr] of dirs) {
        for (let ff = f + df, rr = r + dr; on(ff, rr); ff += df, rr += dr) {
          const c = colorOf(s.board[rr * 8 + ff]);
          if (c === me) break;
          out.push({ from: i, to: rr * 8 + ff });
          if (c) break;
        }
      }
    }
  }
  return out;
}

/** The position after a move (a new object). */
export function play(s, m) {
  const board = [...s.board];
  const p = board[m.from];
  const kind = p.toLowerCase();
  const capture = board[m.to] || (m.ep ? 'x' : '');
  board[m.to] = m.promo ? (s.turn === 'w' ? m.promo.toUpperCase() : m.promo) : p;
  board[m.from] = '';
  if (m.ep) board[m.to + (s.turn === 'w' ? -8 : 8)] = '';
  if (m.castle) {
    const base = s.turn === 'w' ? 0 : 56;
    if (m.to === base + 6) [board[base + 5], board[base + 7]] = [board[base + 7], ''];
    else [board[base + 3], board[base]] = [board[base], ''];
  }
  let castle = s.castle;
  const drop = (chars) => {
    for (const c of chars) castle = castle.replace(c, '');
  };
  if (p === 'K') drop('KQ');
  if (p === 'k') drop('kq');
  for (const [i, c] of [[0, 'Q'], [7, 'K'], [56, 'q'], [63, 'k']]) if (m.from === i || m.to === i) drop(c);
  const ep = kind === 'p' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1;
  return { board, turn: s.turn === 'w' ? 'b' : 'w', castle, ep, half: kind === 'p' || capture ? 0 : s.half + 1 };
}

export function legalMoves(s) {
  return pseudo(s).filter((m) => !inCheck(play(s, m), s.turn));
}

/** Standard notation of a legal move, e.g. "Nbd7", "exd6", "e8=Q+", "O-O". */
export function san(s, m, legal = legalMoves(s)) {
  let out;
  const p = s.board[m.from].toLowerCase();
  if (m.castle) out = m.to % 8 === 6 ? 'O-O' : 'O-O-O';
  else {
    const capture = !!s.board[m.to] || m.ep;
    if (p === 'p') out = `${capture ? `${FILES[m.from % 8]}x` : ''}${sq(m.to)}${m.promo ? `=${m.promo.toUpperCase()}` : ''}`;
    else {
      const twins = legal.filter((o) => o.to === m.to && o.from !== m.from && s.board[o.from] === s.board[m.from]);
      let dis = '';
      if (twins.length) {
        if (!twins.some((o) => o.from % 8 === m.from % 8)) dis = FILES[m.from % 8];
        else if (!twins.some((o) => Math.floor(o.from / 8) === Math.floor(m.from / 8))) dis = String(Math.floor(m.from / 8) + 1);
        else dis = sq(m.from);
      }
      out = `${p.toUpperCase()}${dis}${capture ? 'x' : ''}${sq(m.to)}`;
    }
  }
  const next = play(s, m);
  if (inCheck(next)) out += legalMoves(next).length ? '+' : '#';
  return out;
}

/** A typed move (UCI "e2e4"/"e7e8q" or SAN "Nf3", "exd5", "O-O") as a legal move, or null. */
export function parseMove(s, text) {
  const legal = legalMoves(s);
  const t = String(text ?? '').trim().replace(/0/g, 'O');
  const uci = /^([a-h][1-8])\s*-?\s*([a-h][1-8])\s*=?([qrbnQRBN])?$/.exec(t);
  if (uci) {
    const from = at(uci[1]);
    const to = at(uci[2]);
    const promo = (uci[3] ?? '').toLowerCase();
    return legal.find((m) => m.from === from && m.to === to && (m.promo ?? '') === (m.promo ? promo || 'q' : '')) ?? null;
  }
  const clean = (x) => x.replace(/[+#!?]/g, '').replace(/=/g, '');
  return legal.find((m) => clean(san(s, m, legal)) === clean(t)) ?? null;
}

/** Bare kings or king plus one minor piece against a bare king. */
function bareKings(board) {
  const rest = board.filter((p) => p && p.toLowerCase() !== 'k');
  return rest.length === 0 || (rest.length === 1 && 'nb'.includes(rest[0].toLowerCase()));
}

/** "" while the game goes on, else "mate", "stalemate", "fifty" or "material". */
export function result(s) {
  if (!legalMoves(s).length) return inCheck(s) ? 'mate' : 'stalemate';
  if (s.half >= 100) return 'fifty';
  if (bareKings(s.board)) return 'material';
  return '';
}

/** The bot's move: mate if there is one, else the best capture (or a random move). */
export function botMove(s) {
  const legal = legalMoves(s);
  const mate = legal.find((m) => result(play(s, m)) === 'mate');
  if (mate) return mate;
  let best = -Infinity;
  let options = [];
  for (const m of legal) {
    const next = play(s, m);
    let v = (VALUE[(s.board[m.to] || (m.ep ? 'p' : '')).toLowerCase()] ?? 0) + (m.promo === 'q' ? 8 : 0);
    // a piece that can be taken right back counts as lost
    if (attacked(next.board, m.to, next.turn)) v -= VALUE[s.board[m.from].toLowerCase()];
    if (v > best) [best, options] = [v, [m]];
    else if (v === best) options.push(m);
  }
  return pick(options);
}

const GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

/** The board as text, white at the bottom. */
export function render(s, last) {
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let line = `${r + 1} `;
    for (let f = 0; f < 8; f++) {
      const i = r * 8 + f;
      const p = s.board[i];
      line += p ? GLYPH[p] : (r + f) % 2 ? '·' : ' ';
      line += last && (last.from === i || last.to === i) ? '<' : ' ';
    }
    rows.push(line.trimEnd());
  }
  rows.push('  a b c d e f g h');
  return '```\n' + rows.join('\n') + '\n```';
}

const ENDS = { mate: 'Checkmate', stalemate: 'Stalemate: draw', fifty: '50 moves without capture or pawn move: draw', material: 'Not enough material: draw' };

function message(g, text, done) {
  const s = g.state;
  const player = (c) => (c === 'w' ? g.user : g.opponent);
  const name = (c) => (player(c) ? `<@${player(c)}>` : '🤖 Bot');
  const head = `⬜ ${name('w')} vs ⬛ ${name('b')}${g.history.length ? `\nMoves: ${g.history.slice(-12).join(' ')}` : ''}`;
  const status = done ? text : `${text ? `${text}\n` : ''}${s.turn === 'w' ? '⬜' : '⬛'} ${name(s.turn)} to move${inCheck(s) ? ' (check!)' : ''} · \`/chess-move e2e4\` or \`Nf3\``;
  return {
    embeds: [{ color: done ? '#5865f2' : '#f0c040', title: '♟️ Chess', description: `${head}\n${render(s, g.last)}\n${status}` }],
    components: done ? [] : [[{ key: 'chess_resign', data: g.id, label: 'Resign', emoji: '🏳️', style: 'danger' }]],
    mentionUsers: g.history.length === 0,
  };
}

async function finish(ctx, g) {
  await endGame(ctx, g);
  for (const u of [g.user, g.opponent].filter(Boolean)) {
    if ((await ctx.storage.get(`chess:${g.guild}:${u}`)) === g.id) await ctx.storage.delete(`chess:${g.guild}:${u}`);
  }
}

/** After a move: the end of the game, or the bot's answer. Returns the text for the message. */
async function after(ctx, g, moved) {
  let text = moved;
  let end = result(g.state);
  if (!end && !g.opponent && g.state.turn === 'b') {
    const m = botMove(g.state);
    const n = san(g.state, m);
    g.state = play(g.state, m);
    g.history.push(n);
    g.last = m;
    text += `\n🤖 Bot plays **${n}**`;
    end = result(g.state);
  }
  if (end) {
    const winner = end === 'mate' ? (g.state.turn === 'w' ? g.opponent || 'bot' : g.user) : '';
    await finish(ctx, g);
    return { text: `${text}\n\n🏁 ${ENDS[end]}${winner ? ` · ${winner === 'bot' ? '🤖 The bot wins' : `🏆 <@${winner}> wins`}!` : ''}`, done: true };
  }
  await saveGame(ctx, g);
  return { text, done: false };
}

export async function chess(ctx, { config, vars, interaction }) {
  const { guild, user, error } = who(vars, interaction);
  if (error) return no(ctx, interaction, error);
  const opponent = String(config.opponent ?? '').replace(/\D/g, '');
  if (opponent === user) return no(ctx, interaction, '❌ You cannot play against yourself.');
  if (opponent) {
    const m = await ctx.member.get(guild, opponent).catch(() => null);
    if (!m || m.bot) return no(ctx, interaction, '❌ Choose a member (no bot).');
  }
  for (const u of [user, opponent].filter(Boolean)) {
    const running = await ctx.storage.get(`chess:${guild}:${u}`);
    if (running && (await loadGame(ctx, running))) return no(ctx, interaction, `❌ ${u === user ? 'You are' : `<@${u}> is`} in a chess game already (resign with its button).`);
  }
  const g = await newGame(ctx, 'chess', guild, user, { opponent, state: newBoard(), history: [], last: null });
  for (const u of [user, opponent].filter(Boolean)) await ctx.storage.set(`chess:${guild}:${u}`, g.id);
  await ctx.interaction.reply(interaction, message(g, opponent ? `<@${user}> plays white and starts.` : 'You play white and start.', false));
  return { port: 'replied', results: { '': g.id } };
}

export async function chessmove(ctx, { config, vars, interaction }) {
  const { guild, user, error } = who(vars, interaction);
  if (error) return no(ctx, interaction, error);
  const g = await loadGame(ctx, (await ctx.storage.get(`chess:${guild}:${user}`)) ?? '');
  if (!g || g.kind !== 'chess') return no(ctx, interaction, '❌ You have no chess game. Start one with /chess.');
  const mine = g.state.turn === 'w' ? g.user : g.opponent;
  if (mine !== user) return no(ctx, interaction, '⏳ It is not your turn.');
  const m = parseMove(g.state, config.move);
  if (!m) {
    const some = legalMoves(g.state).slice(0, 12).map((x) => san(g.state, x)).join(', ');
    return no(ctx, interaction, `❌ Not a legal move. Some legal ones: ${some}…`);
  }
  const n = san(g.state, m);
  g.state = play(g.state, m);
  g.history.push(n);
  g.last = m;
  const { text, done } = await after(ctx, g, `<@${user}> plays **${n}**`);
  await ctx.interaction.reply(interaction, message(g, text, done));
  return { port: 'replied', results: { '': n } };
}

export const chessComponents = {
  async chess_resign(ctx, ev) {
    const g = await loadGame(ctx, ev.data);
    if (!g || g.kind !== 'chess') return say(ctx, ev, '⌛ This game is over.');
    if (ev.user.id !== g.user && ev.user.id !== g.opponent) return say(ctx, ev, '❌ This is not your game.');
    await finish(ctx, g);
    const other = ev.user.id === g.user ? g.opponent : g.user;
    await ctx.interaction.update(ev.handle, message(g, `🏳️ <@${ev.user.id}> resigns · ${other ? `🏆 <@${other}> wins` : '🤖 The bot wins'}!`, true));
  },
};

/** For the expire task: chess games stay a day without a move. */
export const CHESS_IDLE_MS = 86_400_000;
