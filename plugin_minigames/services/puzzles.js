// Puzzles without a bet; solving one pays "puzzle_reward" (once per
// cooldown, core.puzzleReward). /mastermind (crack a code of 4 colours in
// 10 tries), /hangman (guess the word letter by letter, 6 mistakes),
// /matchpairs (find the 10 pairs of 20 cards), /lightsout (switch off all
// 25 lights; a light toggles itself and its neighbours).
import { endGame, loadGame, newGame, no, pick, puzzleReward, roll, saveGame, say, shuffle, who } from './core.js';
import { setting } from './util.js';

// ---------- mastermind ----------

export const COLOURS = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣'];
const TRIES = 10;

/** Black pegs (right colour, right place) and white pegs (right colour, wrong place). */
export function score(code, guess) {
  let black = 0;
  const restCode = [];
  const restGuess = [];
  code.forEach((c, i) => (c === guess[i] ? black++ : (restCode.push(c), restGuess.push(guess[i]))));
  let white = 0;
  for (const g of restGuess) {
    const i = restCode.indexOf(g);
    if (i >= 0) { white++; restCode.splice(i, 1); }
  }
  return { black, white };
}

function mmMessage(g, text = '', done = false) {
  const rows = g.history.map((h, i) => `\`${String(i + 1).padStart(2)}\` ${h.guess.map((c) => COLOURS[c]).join('')}  ${'⚫'.repeat(h.black)}${'⚪'.repeat(h.white)}`);
  const current = done ? '' : `\nNow: ${g.guess.map((c) => COLOURS[c]).join('')}${'▫️'.repeat(4 - g.guess.length)}`;
  const components = done ? [] : [
    COLOURS.slice(0, 5).map((c, i) => ({ key: 'mm', data: `${g.id}:${i}`, emoji: c, style: 'secondary', disabled: g.guess.length >= 4 })),
    [
      { key: 'mm', data: `${g.id}:5`, emoji: COLOURS[5], style: 'secondary', disabled: g.guess.length >= 4 },
      { key: 'mm', data: `${g.id}:back`, label: '⌫', style: 'secondary', disabled: !g.guess.length },
      { key: 'mm', data: `${g.id}:go`, label: 'Guess', style: 'success', disabled: g.guess.length < 4 },
      { key: 'mm', data: `${g.id}:quit`, label: 'Give up', style: 'danger' },
    ],
  ];
  return { embeds: [{ color: done ? '#5865f2' : '#f0c040', title: '🧠 Mastermind', description: `Crack the code: 4 colours, ${TRIES} tries. ⚫ right place · ⚪ right colour\n\n${rows.join('\n') || '—'}${current}${text ? `\n\n${text}` : ''}` }], components };
}

export async function mastermind(ctx, { vars, interaction }) {
  const { guild, user, error } = who(vars, interaction);
  if (error) return no(ctx, interaction, error);
  const g = await newGame(ctx, 'mastermind', guild, user, { code: Array.from({ length: 4 }, () => roll(6) - 1), guess: [], history: [] });
  await ctx.interaction.reply(interaction, mmMessage(g));
  return { port: 'replied', results: { '': g.id } };
}

// ---------- hangman ----------

const WORDS = ['discord', 'server', 'channel', 'message', 'keyboard', 'monitor', 'pizza', 'rocket', 'dragon', 'castle', 'guitar', 'planet', 'jungle', 'wizard', 'puzzle',
  'banana', 'window', 'coffee', 'garden', 'pirate', 'thunder', 'blanket', 'cookie', 'penguin', 'volcano', 'treasure', 'library', 'compass', 'lantern', 'mirror'];
const LIVES = 6;
const GALLOWS = ['😀', '🙂', '😐', '😕', '😟', '😨', '💀'];

export function wordsOf(ctx) {
  const own = String(setting(ctx, 'hangman_words', '') || '').split(/[\n,]+/).map((w) => w.trim().toLowerCase()).filter((w) => /^[a-zäöüß]{3,20}$/.test(w));
  return own.length ? own : WORDS;
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const solved = (g) => [...g.word].every((ch) => !LETTERS.includes(ch) || g.letters.includes(ch));

function hmMessage(g, text = '', done = false) {
  const shown = [...g.word].map((ch) => (!LETTERS.includes(ch) || g.letters.includes(ch) || done ? ch.toUpperCase() : '＿')).join(' ');
  const wrong = g.letters.filter((l) => !g.word.includes(l));
  const select = (from, to) => {
    const options = LETTERS.slice(from, to).filter((l) => !g.letters.includes(l)).map((l) => ({ label: l.toUpperCase(), value: l }));
    return [{ type: 'select', key: 'hm', data: g.id, placeholder: `Letter ${LETTERS[from].toUpperCase()}–${LETTERS[to - 1].toUpperCase()}`, options: options.length ? options : [{ label: '—', value: '-' }], disabled: !options.length }];
  };
  const components = done ? [] : [select(0, 13), select(13, 26), [{ key: 'hm_quit', data: g.id, label: 'Give up', style: 'danger' }]];
  return { embeds: [{ color: done ? '#5865f2' : '#f0c040', title: '🪢 Hangman', description: `${GALLOWS[wrong.length]}  Lives: ${'❤️'.repeat(LIVES - wrong.length)}${'🖤'.repeat(wrong.length)}\n\n**${shown}**\n\nWrong: ${wrong.map((l) => l.toUpperCase()).join(' ') || '—'}${text ? `\n\n${text}` : ''}` }], components };
}

export async function hangman(ctx, { vars, interaction }) {
  const { guild, user, error } = who(vars, interaction);
  if (error) return no(ctx, interaction, error);
  const g = await newGame(ctx, 'hangman', guild, user, { word: pick(wordsOf(ctx)), letters: [] });
  await ctx.interaction.reply(interaction, hmMessage(g, 'Pick letters from the lists.'));
  return { port: 'replied', results: { '': g.id } };
}

// ---------- match pairs ----------

const PAIRS = ['🍎', '🍌', '🍇', '🍓', '🍒', '🥝', '🍍', '🥥', '🍉', '🍑'];

function mpMessage(g, text = '', done = false) {
  const rows = [0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4].map((c) => {
    const i = r * 5 + c;
    const up = g.matched[i] || g.open.includes(i);
    return { key: 'mp', data: `${g.id}:${i}`, ...(up ? { emoji: g.cards[i] } : { label: '❔' }), style: g.matched[i] ? 'success' : up ? 'primary' : 'secondary', disabled: done || g.matched[i] };
  }));
  const found = g.matched.filter(Boolean).length / 2;
  return { embeds: [{ color: done ? '#5865f2' : '#f0c040', title: '🃏 Match Pairs', description: `Pairs: **${found}/10** · moves: **${g.moves}**${text ? `\n\n${text}` : ''}` }], components: rows };
}

export async function matchpairs(ctx, { vars, interaction }) {
  const { guild, user, error } = who(vars, interaction);
  if (error) return no(ctx, interaction, error);
  const g = await newGame(ctx, 'matchpairs', guild, user, { cards: shuffle([...PAIRS, ...PAIRS]), matched: Array(20).fill(false), open: [], moves: 0 });
  await ctx.interaction.reply(interaction, mpMessage(g, 'Turn two cards; a pair stays open.'));
  return { port: 'replied', results: { '': g.id } };
}

// ---------- lights out ----------

/** Toggles a light and its neighbours (5×5). */
export function press(lights, i) {
  const r = Math.floor(i / 5);
  const c = i % 5;
  for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr >= 0 && rr < 5 && cc >= 0 && cc < 5) lights[rr * 5 + cc] = !lights[rr * 5 + cc];
  }
  return lights;
}

/** A solvable board: random presses from all off. */
export function lightsBoard() {
  let lights = Array(25).fill(false);
  while (!lights.some(Boolean)) for (let k = 0; k < 6 + roll(6); k++) lights = press(lights, roll(25) - 1);
  return lights;
}

function loMessage(g, text = '', done = false) {
  const rows = [0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => {
    const i = r * 5 + c;
    return { key: 'lo', data: `${g.id}:${i}`, emoji: g.lights[i] ? '💡' : '⚫', style: g.lights[i] ? 'success' : 'secondary', disabled: done };
  }));
  return { embeds: [{ color: done ? '#5865f2' : '#f0c040', title: '💡 Lights Out', description: `Switch off every light. A light toggles itself and its neighbours.\nMoves: **${g.moves}**${text ? `\n\n${text}` : ''}` }], components: rows };
}

export async function lightsout(ctx, { vars, interaction }) {
  const { guild, user, error } = who(vars, interaction);
  if (error) return no(ctx, interaction, error);
  const g = await newGame(ctx, 'lightsout', guild, user, { lights: lightsBoard(), moves: 0 });
  await ctx.interaction.reply(interaction, loMessage(g));
  return { port: 'replied', results: { '': g.id } };
}

// ---------- buttons and selects ----------

async function mine(ctx, ev, id) {
  const g = await loadGame(ctx, id);
  if (!g) {
    await say(ctx, ev, '⌛ This game is over.');
    return null;
  }
  if (ev.user.id !== g.user) {
    await say(ctx, ev, '❌ This is not your game; start your own.');
    return null;
  }
  return g;
}

export const puzzleComponents = {
  async mm(ctx, ev) {
    const [id, what] = String(ev.data).split(':');
    const g = await mine(ctx, ev, id);
    if (!g) return;
    if (what === 'quit') {
      await endGame(ctx, g);
      return ctx.interaction.update(ev.handle, mmMessage(g, `Given up. The code was ${g.code.map((c) => COLOURS[c]).join('')}.`, true));
    }
    if (what === 'back') g.guess.pop();
    else if (what === 'go' && g.guess.length === 4) {
      const s = score(g.code, g.guess);
      g.history.push({ guess: g.guess, ...s });
      g.guess = [];
      if (s.black === 4 || g.history.length >= TRIES) {
        await endGame(ctx, g);
        const text = s.black === 4 ? `🎉 Cracked in ${g.history.length} ${g.history.length === 1 ? 'try' : 'tries'}!${await puzzleReward(ctx, g.guild, g.user)}` : `No tries left. The code was ${g.code.map((c) => COLOURS[c]).join('')}.`;
        return ctx.interaction.update(ev.handle, mmMessage(g, text, true));
      }
    } else if (/^[0-5]$/.test(what) && g.guess.length < 4) g.guess.push(Number(what));
    await saveGame(ctx, g);
    await ctx.interaction.update(ev.handle, mmMessage(g));
  },

  async hm(ctx, ev) {
    const g = await mine(ctx, ev, ev.data);
    if (!g) return;
    const l = String(ev.values?.[0] ?? '');
    if (LETTERS.includes(l) && !g.letters.includes(l)) g.letters.push(l);
    const wrong = g.letters.filter((x) => !g.word.includes(x)).length;
    if (solved(g)) {
      await endGame(ctx, g);
      return ctx.interaction.update(ev.handle, hmMessage(g, `🎉 Solved!${await puzzleReward(ctx, g.guild, g.user)}`, true));
    }
    if (wrong >= LIVES) {
      await endGame(ctx, g);
      return ctx.interaction.update(ev.handle, hmMessage(g, '💀 Hanged!', true));
    }
    await saveGame(ctx, g);
    await ctx.interaction.update(ev.handle, hmMessage(g, g.word.includes(l) ? `✅ ${l.toUpperCase()} is in the word.` : `❌ No ${l.toUpperCase()}.`));
  },

  async hm_quit(ctx, ev) {
    const g = await mine(ctx, ev, ev.data);
    if (!g) return;
    await endGame(ctx, g);
    await ctx.interaction.update(ev.handle, hmMessage(g, 'Given up.', true));
  },

  async mp(ctx, ev) {
    const [id, at] = String(ev.data).split(':');
    const g = await mine(ctx, ev, id);
    if (!g) return;
    const i = Number(at);
    if (!(i >= 0 && i < 20) || g.matched[i] || g.open.includes(i)) return say(ctx, ev, 'ℹ️ Pick a closed card.');
    if (g.open.length === 2) g.open = [];
    g.open.push(i);
    let text = '';
    if (g.open.length === 2) {
      g.moves += 1;
      const [a, b] = g.open;
      if (g.cards[a] === g.cards[b]) {
        g.matched[a] = g.matched[b] = true;
        g.open = [];
        text = `✅ ${g.cards[a]} pair!`;
      } else text = 'No pair: pick the next card.';
    }
    if (g.matched.every(Boolean)) {
      await endGame(ctx, g);
      return ctx.interaction.update(ev.handle, mpMessage(g, `🎉 All pairs in ${g.moves} moves!${await puzzleReward(ctx, g.guild, g.user)}`, true));
    }
    await saveGame(ctx, g);
    await ctx.interaction.update(ev.handle, mpMessage(g, text));
  },

  async lo(ctx, ev) {
    const [id, at] = String(ev.data).split(':');
    const g = await mine(ctx, ev, id);
    if (!g) return;
    const i = Number(at);
    if (!(i >= 0 && i < 25)) return;
    press(g.lights, i);
    g.moves += 1;
    if (!g.lights.some(Boolean)) {
      await endGame(ctx, g);
      return ctx.interaction.update(ev.handle, loMessage(g, `🎉 All lights off in ${g.moves} moves!${await puzzleReward(ctx, g.guild, g.user)}`, true));
    }
    await saveGame(ctx, g);
    await ctx.interaction.update(ev.handle, loMessage(g));
  },
};
