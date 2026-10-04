// Service "game": the board (9 cells, "" / "X" / "O"), the winner and the
// bot's move: win if it can, else block, else centre, corner, any.
export const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

/** "X" or "O" when a line is full, "draw" when the board is full, else null. */
export function winner(b) {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? 'draw' : null;
}

export function botMove(b, me = 'O', them = 'X', rng = Math.random) {
  const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  const wins = (mark) => free.find((i) => winner(b.map((v, j) => (j === i ? mark : v))) === mark);
  const pick = wins(me) ?? wins(them);
  if (pick !== undefined) return pick;
  if (!b[4]) return 4;
  const corners = [0, 2, 6, 8].filter((i) => !b[i]);
  const list = corners.length ? corners : free;
  return list[Math.floor(rng() * list.length)];
}
