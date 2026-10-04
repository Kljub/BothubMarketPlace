// Service "game": 24 fields (Discord allows 5 rows of 5 buttons; the last
// row keeps a slot for 🔥 cash out). The multiplier is the fair odds of
// hitting k safe fields in a row (more mines = higher), scaled by the RTP
// setting (the house edge). A round lives in storage "ms:<id>"; one round
// per member and server ("open:<guild>:<user>").
export const GRID = 24;

export const clampMines = (m) => Math.max(1, Math.min(GRID - 1, Math.floor(Number(m) || 3)));

/** Multiplier after k safe fields (1 before the first). */
export function multiplierAt(mines, k, rtp) {
  if (k <= 0) return 1;
  let mult = 1;
  for (let i = 0; i < k; i++) mult *= (GRID - i) / (GRID - mines - i);
  return mult * (rtp / 100);
}

/** The mine positions (shuffled with the SDK's random). */
export function layMines(ctx, mines) {
  const cells = Array.from({ length: GRID }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = ctx.utils.random(0, i);
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, mines).sort((a, b) => a - b);
}

/** The board: 4 rows of 5, a 5th row of 4 plus 🔥. */
export function board(r, done = false) {
  const cell = (i) => {
    if (r.revealed.includes(i)) return { key: 'cell', data: `${r.id}:${i}`, label: '💎', style: 'success', disabled: true };
    if (done && r.mines.includes(i)) return { key: 'cell', data: `${r.id}:${i}`, label: '💣', style: 'danger', disabled: true };
    return { key: 'cell', data: `${r.id}:${i}`, label: '⬛', style: 'secondary', disabled: done };
  };
  const rows = [];
  for (let row = 0; row < 4; row++) rows.push([0, 1, 2, 3, 4].map((c) => cell(row * 5 + c)));
  rows.push([20, 21, 22, 23].map(cell).concat([{ key: 'cashout', data: r.id, label: 'Cash out', emoji: '🔥', style: 'danger', disabled: done || !r.revealed.length }]));
  return rows;
}
