// Board games with buttons: /2048 (slide the tiles, reach 2048) and
// /connect4 (four in a row against a member, with an optional bet, or
// against the bot). Games are stored like the others (core.js).
import { betOf, money, take, wallet } from './econ.js';
import { endGame, loadGame, newGame, no, pick, puzzleReward, rng, saveGame, say, who } from './core.js';
import { refundDuel } from './duel.js';

// ---------- 2048 ----------

/** Puts a 2 (90 %) or 4 on a random free cell. */
export function spawn(cells) {
  const free = cells.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (free.length) cells[pick(free)] = rng.next() < 0.9 ? 2 : 4;
  return cells;
}

/** One line slid to the left: merged values and the points. */
export function slideLine(line) {
  const vals = line.filter(Boolean);
  const out = [];
  let points = 0;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] === vals[i + 1]) {
      out.push(vals[i] * 2);
      points += vals[i] * 2;
      i++;
    } else out.push(vals[i]);
  }
  while (out.length < 4) out.push(0);
  return { line: out, points };
}

const LINES = {
  l: [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => r * 4 + c)),
  r: [0, 1, 2, 3].map((r) => [3, 2, 1, 0].map((c) => r * 4 + c)),
  u: [0, 1, 2, 3].map((c) => [0, 1, 2, 3].map((r) => r * 4 + c)),
  d: [0, 1, 2, 3].map((c) => [3, 2, 1, 0].map((r) => r * 4 + c)),
};

/** The board after a move: { cells, points, moved }. */
export function slide(cells, dir) {
  const out = [...cells];
  let points = 0;
  for (const idx of LINES[dir]) {
    const res = slideLine(idx.map((i) => cells[i]));
    idx.forEach((i, k) => {
      out[i] = res.line[k];
    });
    points += res.points;
  }
  return { cells: out, points, moved: out.some((v, i) => v !== cells[i]) };
}

export const canMove = (cells) => Object.keys(LINES).some((d) => slide(cells, d).moved);

function grid(cells) {
  const rows = [0, 1, 2, 3].map((r) => cells.slice(r * 4, r * 4 + 4).map((v) => String(v || '·').padStart(5)).join(''));
  return '```\n' + rows.join('\n') + '\n```';
}

function message2048(g, text = '', done = false) {
  const arrows = [['u', '⬆️'], ['l', '⬅️'], ['d', '⬇️'], ['r', '➡️']].map(([d, emoji]) => ({ key: 'g2048', data: `${g.id}:${d}`, emoji, style: 'primary', disabled: done }));
  return {
    embeds: [{ color: done ? '#5865f2' : '#edc22e', title: '🔢 2048', description: `Slide the tiles; equal ones merge. Reach **2048**!\nScore: **${g.score}** · Moves: **${g.moves}**\n${grid(g.cells)}${text ? `\n${text}` : ''}` }],
    components: [[...arrows, { key: 'g2048', data: `${g.id}:q`, emoji: '🛑', style: 'danger', disabled: done }]],
  };
}

export async function game2048(ctx, { vars, interaction }) {
  const { guild, user, error } = who(vars, interaction);
  if (error) return no(ctx, interaction, error);
  const g = await newGame(ctx, '2048', guild, user, { cells: spawn(spawn(Array(16).fill(0))), score: 0, moves: 0 });
  await ctx.interaction.reply(interaction, message2048(g));
  return { port: 'replied', results: { '': g.id } };
}

// ---------- Connect 4 ----------

const ROWS = 6;
const COLS = 7;

/** Drops a disc: the cell index, or -1 when the column is full. */
export function drop(cells, col, disc) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (!cells[r * COLS + col]) {
      cells[r * COLS + col] = disc;
      return r * COLS + col;
    }
  }
  return -1;
}

/** True when the disc at i makes four in a row. */
export function fourAt(cells, i) {
  const disc = cells[i];
  const r = Math.floor(i / COLS);
  const c = i % COLS;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let n = 1;
    for (const s of [1, -1]) {
      for (let k = 1; k < 4; k++) {
        const rr = r + dr * k * s;
        const cc = c + dc * k * s;
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || cells[rr * COLS + cc] !== disc) break;
        n++;
      }
    }
    if (n >= 4) return true;
  }
  return false;
}

const open = (cells) => [0, 1, 2, 3, 4, 5, 6].filter((c) => !cells[c]);

/** The bot's column: win, else block, else near the middle. */
export function botColumn(cells) {
  for (const disc of [2, 1]) {
    for (const c of open(cells)) {
      const test = [...cells];
      if (fourAt(test, drop(test, c, disc))) return c;
    }
  }
  const safe = open(cells).filter((c) => {
    const test = [...cells];
    drop(test, c, 2);
    return !open(test).some((c2) => {
      const t2 = [...test];
      return fourAt(t2, drop(t2, c2, 1));
    });
  });
  const list = safe.length ? safe : open(cells);
  const best = Math.min(...list.map((c) => Math.abs(3 - c)));
  return pick(list.filter((c) => Math.abs(3 - c) === best || rng.next() < 0.25));
}

const DISC = ['⚫', '🔴', '🟡'];

function c4Message(ctx, g, text, done) {
  const board = [0, 1, 2, 3, 4, 5].map((r) => g.cells.slice(r * COLS, r * COLS + COLS).map((v) => DISC[v]).join('')).join('\n');
  const vs = g.opponent ? `<@${g.opponent}>` : '🤖 Bot';
  const bet = g.bet ? `\nPot: ${money(ctx, g.bet * 2)}` : '';
  let components = [];
  if (!done && !g.accepted) components = [[{ key: 'c4_accept', data: g.id, label: 'Accept', style: 'success' }, { key: 'c4_quit', data: g.id, label: 'Decline', style: 'danger' }]];
  else if (!done) {
    const btn = (c) => ({ key: 'c4', data: `${g.id}:${c}`, label: String(c + 1), style: 'secondary', disabled: !!g.cells[c] });
    components = [[0, 1, 2, 3].map(btn), [...[4, 5, 6].map(btn), { key: 'c4_quit', data: g.id, label: 'Give up', emoji: '🏳️', style: 'danger' }]];
  }
  return {
    embeds: [{ color: done ? '#5865f2' : '#3b82f6', title: '🔴 Connect 4', description: `🔴 <@${g.user}> vs 🟡 ${vs}${bet}\n\n${board}\n1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣\n\n${text}` }],
    components,
    mentionUsers: !g.accepted,
  };
}

const turnText = (g) => `${g.turn === 1 ? '🔴' : '🟡'} <@${g.turn === 1 ? g.user : g.opponent}>, your move.`;

export async function connect4(ctx, { config, vars, interaction }) {
  const { guild, user, error } = who(vars, interaction);
  if (error) return no(ctx, interaction, error);
  const opponent = String(config.opponent ?? '').replace(/\D/g, '');
  if (opponent === user) return no(ctx, interaction, '❌ You cannot play against yourself.');
  if (opponent) {
    const m = await ctx.member.get(guild, opponent).catch(() => null);
    if (!m || m.bot) return no(ctx, interaction, '❌ Choose a member (no bot).');
  }
  const { bet, error: betError } = betOf(ctx, opponent ? config.bet : '', false);
  if (betError) return no(ctx, interaction, betError);
  const short = await take(ctx, guild, user, bet);
  if (short) return no(ctx, interaction, short);
  const g = await newGame(ctx, 'connect4', guild, user, { opponent, bet, accepted: !opponent, cells: Array(ROWS * COLS).fill(0), turn: 1 });
  await ctx.interaction.reply(interaction, c4Message(ctx, g, opponent ? `<@${opponent}>, do you accept?` : '🔴 Your move.', false));
  return { port: 'replied', results: { '': g.id } };
}

async function c4End(ctx, g, winner) {
  await endGame(ctx, g);
  if (!g.bet) return '';
  if (!winner) {
    await refundDuel(ctx, g);
    return ' Bets back.';
  }
  await wallet(ctx).add(g.guild, winner, g.bet * 2);
  return ` Wins ${money(ctx, g.bet * 2)}.`;
}

// ---------- buttons ----------

export const boardComponents = {
  async g2048(ctx, ev) {
    const [id, dir] = String(ev.data).split(':');
    const g = await loadGame(ctx, id);
    if (!g || g.kind !== '2048') return say(ctx, ev, '⌛ This game is over.');
    if (ev.user.id !== g.user) return say(ctx, ev, '❌ This is not your game; start your own.');
    if (dir === 'q') {
      await endGame(ctx, g);
      return ctx.interaction.update(ev.handle, message2048(g, `🛑 Stopped with **${g.score}** points.`, true));
    }
    if (!LINES[dir]) return;
    const res = slide(g.cells, dir);
    if (!res.moved) return say(ctx, ev, 'ℹ️ Nothing moves that way.');
    g.cells = spawn(res.cells);
    g.score += res.points;
    g.moves += 1;
    if (g.cells.includes(2048)) {
      await endGame(ctx, g);
      return ctx.interaction.update(ev.handle, message2048(g, `🎉 **2048**! Score ${g.score}.${await puzzleReward(ctx, g.guild, g.user)}`, true));
    }
    if (!canMove(g.cells)) {
      await endGame(ctx, g);
      return ctx.interaction.update(ev.handle, message2048(g, `💀 No moves left. Score **${g.score}**, best tile **${Math.max(...g.cells)}**.`, true));
    }
    await saveGame(ctx, g);
    await ctx.interaction.update(ev.handle, message2048(g));
  },

  async c4_accept(ctx, ev) {
    const g = await loadGame(ctx, ev.data);
    if (!g || g.kind !== 'connect4' || g.accepted) return say(ctx, ev, '⌛ This game is over.');
    if (ev.user.id !== g.opponent) return say(ctx, ev, '❌ Only the challenged member can answer.');
    const short = await take(ctx, g.guild, g.opponent, g.bet);
    if (short) return say(ctx, ev, short);
    g.accepted = true;
    await saveGame(ctx, g);
    await ctx.interaction.update(ev.handle, c4Message(ctx, g, turnText(g), false));
  },

  async c4_quit(ctx, ev) {
    const g = await loadGame(ctx, ev.data);
    if (!g || g.kind !== 'connect4') return say(ctx, ev, '⌛ This game is over.');
    if (ev.user.id !== g.user && ev.user.id !== g.opponent) return say(ctx, ev, '❌ This is not your game.');
    if (!g.accepted) {
      await refundDuel(ctx, g);
      await endGame(ctx, g);
      return ctx.interaction.update(ev.handle, c4Message(ctx, g, `${ev.user.id === g.opponent ? 'Declined' : 'Taken back'}.${g.bet ? ' The bet is paid back.' : ''}`, true));
    }
    const winner = ev.user.id === g.user ? g.opponent : g.user;
    const paid = await c4End(ctx, g, winner || null);
    await ctx.interaction.update(ev.handle, c4Message(ctx, g, `🏳️ <@${ev.user.id}> gives up · ${winner ? `🏆 <@${winner}> wins!${paid}` : '🤖 The bot wins!'}`, true));
  },

  async c4(ctx, ev) {
    const [id, col] = String(ev.data).split(':');
    const g = await loadGame(ctx, id);
    if (!g || g.kind !== 'connect4' || !g.accepted) return say(ctx, ev, '⌛ This game is over.');
    const player = g.turn === 1 ? g.user : g.opponent;
    if (ev.user.id !== g.user && ev.user.id !== g.opponent) return say(ctx, ev, '❌ This is not your game.');
    if (ev.user.id !== player) return say(ctx, ev, '⏳ It is not your turn.');
    const c = Number(col);
    if (!(c >= 0 && c < COLS)) return;
    const i = drop(g.cells, c, g.turn);
    if (i < 0) return say(ctx, ev, 'ℹ️ This column is full.');
    if (fourAt(g.cells, i)) {
      const paid = await c4End(ctx, g, ev.user.id);
      return ctx.interaction.update(ev.handle, c4Message(ctx, g, `🏆 <@${ev.user.id}> wins!${paid}`, true));
    }
    if (!open(g.cells).length) {
      const paid = await c4End(ctx, g, null);
      return ctx.interaction.update(ev.handle, c4Message(ctx, g, `🤝 Draw!${paid}`, true));
    }
    g.turn = g.turn === 1 ? 2 : 1;
    if (!g.opponent) {
      const j = drop(g.cells, botColumn(g.cells), 2);
      if (fourAt(g.cells, j)) {
        await c4End(ctx, g, null);
        return ctx.interaction.update(ev.handle, c4Message(ctx, g, '🤖 The bot wins!', true));
      }
      if (!open(g.cells).length) {
        await c4End(ctx, g, null);
        return ctx.interaction.update(ev.handle, c4Message(ctx, g, '🤝 Draw!', true));
      }
      g.turn = 1;
    }
    await saveGame(ctx, g);
    await ctx.interaction.update(ev.handle, c4Message(ctx, g, g.opponent ? turnText(g) : '🔴 Your move.', false));
  },
};
