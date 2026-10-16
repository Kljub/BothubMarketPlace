// Service "game": one music quiz per server. Each round puts a 30 second
// Deezer preview into the Music module's queue (ctx.music.enqueue) and posts
// a message with four answers. One guess per member; the first right answer
// wins the round (1 point). The round ends then, when every player guessed
// wrong, on "Reveal", or at the latest when the "tick" task finds it older
// than the round time. The round message then shows the answer and the next
// round starts. After the last round the final standings are posted and the
// leaderboard is updated.
//
// Storage: "g:<guild>" the running game (JSON), "ix" the servers with a
// game (for the tick), "st:<guild>" the leaderboard, "lk:<guild>" / "lt:…"
// the lock of a game.
import { loadTracks, norm, SourceError } from './deezer.js';
import { sourceName, t } from './i18n.js';
import { readJson, writeJson } from './storage.js';
import { setting } from './util.js';

export const MAX_ROUNDS = 15;
const LOCK_MS = 8000;
const STALE_MS = 20 * 60_000;
const HOST_ONLY_MS = 3 * 60_000;
const MAX_BOARD = 500;
const COLORS = { round: '#a855f7', ok: '#22c55e', none: '#64748b', final: '#eab308' };
const LETTERS = ['🇦', '🇧', '🇨', '🇩'];

export class QuizError extends Error {
  constructor(key, params = {}) {
    super(key);
    this.key = key;
    this.params = params;
  }
}

export const lang = (ctx) => (setting(ctx, 'language', 'en') === 'de' ? 'de' : 'en');

function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The rounds of a game: songs of different artists where possible, each
 * with four answers (song titles or artists, mode "title", "artist" or
 * "mixed"). Round: { t, a, p (preview), l (link), c (cover), q, o, k }.
 */
export function buildRounds(tracks, count, mode, rng = Math.random) {
  const pool = shuffle(tracks, rng);
  const artists = [...new Map(pool.map((x) => [norm(x.artist), x.artist])).values()];
  const picked = [];
  const used = new Set();
  for (const x of pool) {
    if (picked.length >= count) break;
    if (used.has(norm(x.artist))) continue;
    used.add(norm(x.artist));
    picked.push(x);
  }
  for (const x of pool) {
    if (picked.length >= count) break;
    if (!picked.includes(x)) picked.push(x);
  }
  return picked.map((song) => {
    let kind = mode === 'mixed' ? (rng() < 0.5 ? 'title' : 'artist') : mode === 'artist' ? 'artist' : 'title';
    const others = (k) => {
      const answer = norm(k === 'artist' ? song.artist : song.title);
      const seen = new Set([answer]);
      const out = [];
      for (const v of k === 'artist' ? shuffle(artists, rng) : shuffle(pool.map((x) => x.title), rng)) {
        const n = norm(v);
        if (!n || seen.has(n)) continue;
        seen.add(n);
        out.push(v);
        if (out.length === 3) break;
      }
      return out;
    };
    let wrong = others(kind);
    if (wrong.length < 3 && kind === 'artist') {
      kind = 'title';
      wrong = others(kind);
    }
    const right = kind === 'artist' ? song.artist : song.title;
    const options = shuffle([right, ...wrong], rng).map((v) => String(v).slice(0, 75));
    return { t: song.title, a: song.artist, p: song.preview, l: song.link, c: song.cover, q: kind, o: options, k: options.indexOf(String(right).slice(0, 75)) };
  });
}

// --- lock and state -------------------------------------------------------

async function lock(ctx, guild) {
  for (let i = 0; i < 25; i++) {
    const n = await ctx.storage.increment(`lk:${guild}`);
    if (n === 1) {
      await ctx.storage.set(`lt:${guild}`, String(Date.now()));
      return true;
    }
    const since = Number(await ctx.storage.get(`lt:${guild}`)) || 0;
    if (since && Date.now() - since > LOCK_MS) {
      await ctx.storage.set(`lt:${guild}`, String(Date.now()));
      return true;
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  return false;
}

async function unlock(ctx, guild) {
  await ctx.storage.delete(`lk:${guild}`);
  await ctx.storage.delete(`lt:${guild}`);
}

/** Runs fn(game) under the server's lock; fn returns the game to save, or null to delete it. */
async function withGame(ctx, guild, fn) {
  if (!(await lock(ctx, guild))) throw new QuizError('ans.busy');
  try {
    const game = await readJson(ctx, `g:${guild}`, null);
    const next = await fn(game);
    if (next === undefined) return game;
    if (next) await writeJson(ctx, `g:${guild}`, next);
    else await ctx.storage.delete(`g:${guild}`);
    return next;
  } finally {
    await unlock(ctx, guild);
  }
}

async function setIndex(ctx, guild, on) {
  const ix = await readJson(ctx, 'ix', []);
  const next = on ? [...new Set([...ix, guild])] : ix.filter((g) => g !== guild);
  if (next.length !== ix.length) await writeJson(ctx, 'ix', next);
}

// --- messages -------------------------------------------------------------

const userList = (ids) => ids.map((id) => `<@${id}>`).join(', ');

function standings(game, L, max = 3) {
  const top = Object.entries(game.s).sort((a, b) => b[1] - a[1]).slice(0, max);
  return top.length ? t(L, 'reveal.standings', { list: top.map(([id, p]) => `<@${id}> ${p}`).join(' · ') }) : '';
}

/** The message of a running round: question and four answer buttons. */
export function roundMessage(game, L) {
  const r = game.r[game.n];
  const lines = [t(L, `round.q.${r.q}`), '', ...r.o.map((o, i) => `${LETTERS[i]} ${o}`), '', `-# ${t(L, 'round.hint')}`];
  const st = standings(game, L);
  if (st) lines.push(st);
  return {
    embeds: [{ title: t(L, 'round.title', { n: game.n + 1, total: game.r.length }), description: lines.join('\n'), color: COLORS.round, footer: { text: t(L, 'round.footer', { source: game.src }) } }],
    components: [
      r.o.map((o, i) => ({ key: 'mq', data: `a:${game.id}:${game.n}:${i}`, emoji: LETTERS[i], label: o.slice(0, 80), style: 'secondary' })),
      [
        { key: 'mq', data: `s:${game.id}:${game.n}`, label: t(L, 'btn.skip'), emoji: '⏭️', style: 'primary' },
        { key: 'mq', data: `x:${game.id}`, label: t(L, 'btn.stop'), emoji: '⏹️', style: 'danger' },
      ],
    ],
  };
}

/** The round message after the round: the answer, who got it, standings. */
export function revealMessage(game, L) {
  const r = game.r[game.n];
  const wrong = Object.keys(game.ans).filter((id) => id !== game.w);
  const lines = [t(L, 'reveal.answer', { title: r.t, artist: r.a }), '', game.w ? t(L, 'reveal.winner', { user: `<@${game.w}>` }) : t(L, 'reveal.nobody')];
  if (wrong.length) lines.push(t(L, 'reveal.wrong', { users: userList(wrong) }));
  const st = standings(game, L);
  if (st) lines.push('', st);
  const embed = { title: t(L, 'reveal.title', { n: game.n + 1, total: game.r.length }), description: lines.join('\n'), color: game.w ? COLORS.ok : COLORS.none };
  if (r.c) embed.thumbnail_url = r.c;
  return { embeds: [embed], components: r.l ? [[{ type: 'link', url: r.l, label: t(L, 'btn.deezer'), emoji: '🎧' }]] : [] };
}

function finalMessage(game, L, stopped) {
  const medals = ['🥇', '🥈', '🥉'];
  const ranking = Object.entries(game.s).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]);
  const lines = ranking.slice(0, 15).map(([id, p], i) => `${medals[i] ?? `**${i + 1}.**`} <@${id}>: ${t(L, 'final.points', { n: p })}`);
  if (!lines.length) lines.push(t(L, 'final.none'));
  if (stopped) lines.push('', t(L, 'final.stopped'));
  return { embeds: [{ title: t(L, 'final.title'), description: lines.join('\n'), color: COLORS.final, timestamp: true }] };
}

// --- game flow --------------------------------------------------------------

/** Puts the clip of the current round into the music queue (the bot joins the host's voice channel when it is in none). */
async function playRound(ctx, game) {
  const r = game.r[game.n];
  try {
    await ctx.music.enqueue(game.g, { title: `🎵 Music Quiz · ${game.n + 1}/${game.r.length}`, duration: 30, source: { url: r.p } }, { joinUser: game.h, textChannelId: game.ch, requester: game.h, position: 'next' });
  } catch (err) {
    const key = err?.key ?? err?.message;
    if (key === 'sdk.music.no_voice') throw new QuizError('err.voice');
    if (key === 'sdk.music.unavailable' || key === 'sdk.call.denied') throw new QuizError('err.music');
    throw new QuizError('err.play', { reason: String(key ?? 'error').slice(0, 100) });
  }
}

/** Starts the round game.n: clip, then its message. */
async function startRound(ctx, game, L) {
  await playRound(ctx, game);
  game.ans = {};
  game.w = null;
  game.at = Date.now();
  game.msg = await ctx.message.send(game.ch, roundMessage(game, L));
}

/** Adds the game's points to the server leaderboard. */
async function saveBoard(ctx, game) {
  const board = await readJson(ctx, `st:${game.g}`, {});
  const best = Math.max(0, ...Object.values(game.s));
  for (const [id, points] of Object.entries(game.s)) {
    const e = board[id] ?? { p: 0, c: 0, g: 0, w: 0 };
    e.p += points;
    e.c += game.c[id] ?? 0;
    e.g += 1;
    if (best > 0 && points === best) e.w += 1;
    board[id] = e;
  }
  const kept = Object.entries(board).sort((a, b) => b[1].p - a[1].p).slice(0, MAX_BOARD);
  await writeJson(ctx, `st:${game.g}`, Object.fromEntries(kept));
}

/**
 * Ends the current round: shows the answer (on the clicked message when
 * handle is given), then the next round or the end. Returns the game to
 * save, or null when it is over.
 */
async function endRound(ctx, game, L, handle) {
  const reveal = revealMessage(game, L);
  if (handle) await ctx.interaction.update(handle, reveal).catch(() => undefined);
  else await ctx.message.edit(game.ch, game.msg, reveal).catch(() => undefined);
  if (game.n + 1 >= game.r.length) return finish(ctx, game, L, false);
  game.n += 1;
  try {
    await startRound(ctx, game, L);
  } catch (err) {
    if (!(err instanceof QuizError)) throw err;
    await ctx.message.send(game.ch, `❌ ${t(L, err.key, err.params)}`).catch(() => undefined);
    return finish(ctx, game, L, true);
  }
  return game;
}

async function finish(ctx, game, L, stopped) {
  await ctx.message.send(game.ch, finalMessage(game, L, stopped)).catch(() => undefined);
  if (Object.keys(game.s).length) await saveBoard(ctx, game);
  await setIndex(ctx, game.g, false);
  return null;
}

/**
 * /musicquiz: loads the songs and starts round 1 in the channel. Throws
 * QuizError for the member (no server, running quiz, no voice, source).
 */
export async function startGame(ctx, { guild, channel, host, source, playlist, rounds, mode }) {
  const L = lang(ctx);
  if (!guild || !channel) throw new QuizError('err.server');
  const running = await readJson(ctx, `g:${guild}`, null);
  if (running && Date.now() - running.at < STALE_MS) throw new QuizError('err.running', { channel: running.ch });
  let tracks;
  try {
    tracks = await loadTracks(ctx, { source, playlist });
  } catch (err) {
    if (err instanceof SourceError) throw new QuizError(err.key);
    throw err;
  }
  const count = Math.min(MAX_ROUNDS, Math.max(1, Math.round(Number(rounds) || 10)));
  if (tracks.length < Math.max(4, count)) throw new QuizError('err.few', { n: tracks.length });
  const game = {
    id: Date.now().toString(36),
    g: guild,
    ch: channel,
    h: host,
    src: playlist ? sourceName(L, 'playlist') : sourceName(L, source),
    r: buildRounds(tracks, count, mode),
    n: 0,
    s: {},
    c: {},
    ans: {},
    w: null,
    at: Date.now(),
    msg: null,
  };
  return withGame(ctx, guild, async () => {
    await startRound(ctx, game, L);
    await setIndex(ctx, guild, true);
    return game;
  });
}

/** Players: who guessed in this game, and the host. */
const players = (game) => new Set([game.h, ...Object.keys(game.s)]);

/** A click on an answer, "Reveal" or "Stop" (button key "mq"). */
export async function click(ctx, ev) {
  const L = lang(ctx);
  const [verb, id, round, choice] = String(ev.data ?? '').split(':');
  const user = ev.user.id;
  const say = (key, params) => ctx.interaction.reply(ev.handle, t(L, key, params), { ephemeral: true });
  if (!ev.guildId) return say('err.server');
  let answer = null;
  try {
    await withGame(ctx, ev.guildId, async (game) => {
      if (!game || game.id !== id || (verb !== 'x' && Number(round) !== game.n)) {
        answer = ['ans.late'];
        return undefined;
      }
      if (verb === 'x') {
        if (user !== game.h && Date.now() - game.at < HOST_ONLY_MS) {
          answer = ['stop.denied', { user: `<@${game.h}>`, min: Math.ceil(HOST_ONLY_MS / 60_000) }];
          return undefined;
        }
        await ctx.interaction.update(ev.handle, revealMessage(game, L)).catch(() => undefined);
        return finish(ctx, game, L, true);
      }
      if (verb === 's') {
        if (!players(game).has(user)) {
          answer = ['skip.denied'];
          return undefined;
        }
        return endRound(ctx, game, L, ev.handle);
      }
      // An answer.
      if (user in game.ans) {
        answer = ['ans.again'];
        return undefined;
      }
      game.ans[user] = Number(choice);
      game.s[user] ??= 0;
      if (Number(choice) === game.r[game.n].k) {
        game.w = user;
        game.s[user] += 1;
        game.c[user] = (game.c[user] ?? 0) + 1;
        return endRound(ctx, game, L, ev.handle);
      }
      // Everyone who plays guessed wrong: no need to wait.
      if ([...players(game)].every((p) => p in game.ans)) return endRound(ctx, game, L, ev.handle);
      answer = ['ans.wrong'];
      return game;
    });
  } catch (err) {
    if (!(err instanceof QuizError)) throw err;
    answer = [err.key, err.params];
  }
  if (answer) await say(...answer);
}

/** /musicquiz-stop: the host, or anyone a few minutes after the last round started. */
export async function stopGame(ctx, guild, user) {
  const L = lang(ctx);
  let result = 'stop.none';
  let params = {};
  await withGame(ctx, guild, async (game) => {
    if (!game) return undefined;
    if (user !== game.h && Date.now() - game.at < HOST_ONLY_MS) {
      result = 'stop.denied';
      params = { user: `<@${game.h}>`, min: Math.ceil(HOST_ONLY_MS / 60_000) };
      return undefined;
    }
    await ctx.message.edit(game.ch, game.msg, revealMessage(game, L)).catch(() => undefined);
    result = 'stop.ok';
    return finish(ctx, game, L, true);
  });
  return t(L, result, params);
}

/** Task "tick": ends rounds older than the round time, drops forgotten games. */
export async function tick(ctx, now = Date.now()) {
  const L = lang(ctx);
  const roundMs = (Number(setting(ctx, 'round_time', '45')) || 45) * 1000;
  for (const guild of await readJson(ctx, 'ix', [])) {
    await withGame(ctx, guild, async (game) => {
      if (!game) {
        await setIndex(ctx, guild, false);
        return undefined;
      }
      if (now - game.at > STALE_MS) return finish(ctx, game, L, true);
      if (now - game.at >= roundMs) return endRound(ctx, game, L, null);
      return undefined;
    }).catch((err) => ctx.logger.warn(`tick ${guild}: ${err?.message ?? err}`));
  }
}

/** The server leaderboard, best first: [{ id, p, c, g, w }]. */
export async function leaderboard(ctx, guild, by = 'points') {
  const board = await readJson(ctx, `st:${guild}`, {});
  const key = by === 'wins' ? 'w' : by === 'correct' ? 'c' : 'p';
  return Object.entries(board).map(([id, e]) => ({ id, ...e })).sort((a, b) => b[key] - a[key] || b.p - a.p);
}
