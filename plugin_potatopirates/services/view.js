// Service "view": builds the Discord messages. The table is one public
// message everybody sees; the hand is an ephemeral panel per player.
// Component data is "<gameId>:<args>" (max. 64 characters).
import { CARDS, ORDER, cost, isBuildable, isIf } from './cards.js';
import { canAttack, capacity, handCount, potatoes, preview, saluteWaiting, slots, spare, waitingFor } from './engine.js';
import { RULES, t } from './i18n.js';

const COLOR = { lobby: '#c8a165', play: '#e8a33d', over: '#5865f2', closed: '#808080', pending: '#7c4dff' };
const BOT = '🤖';

export const cardName = (lang, c) => `${CARDS[c]?.emoji ?? ''} ${t(lang, `card.${c}`)}`.trim();
const pname = (g, i) => {
  const p = g.players[i];
  if (!p) return '?';
  return p.bot ? `${BOT} ${p.name}` : `**${p.name}**`;
};
const plain = (g, i) => {
  const p = g.players[i];
  return p ? (p.bot ? `${BOT} ${p.name}` : p.name) : '?';
};

/** "🔁 For 2 › 🔥 Roast" or "🔀 If < 5, else: 🍟 Fry ┃ 🔥 Roast". */
export function progText(lang, prog) {
  const list = (cards) => cards.map((c) => cardName(lang, c)).join(' › ') || '—';
  if (prog.i) return `${cardName(lang, prog.i)}: ${list(prog.a)} ┃ ${list(prog.b)}`;
  return prog.a.length ? list(prog.a) : t(lang, 'ship.empty');
}

/** The program as Python-like code: what the cards mean in a real language. */
export function progCode(prog) {
  const lines = [];
  const vars = ['i', 'j', 'k', 'l', 'm'];
  const stack = (cards, depth, target) => {
    const pad = '    '.repeat(depth);
    if (!cards.length) {
      lines.push(`${pad}pass`);
      return;
    }
    const [c, ...rest] = cards;
    const card = CARDS[c];
    if (card.kind === 'action') {
      lines.push(`${pad}${t('en', `card.${c}`).toLowerCase()}(${target})  # -${card.dmg}`);
      if (rest.length) stack(rest, depth, target);
      return;
    }
    const v = vars[depth % vars.length];
    if (card.loop === 'for') {
      const n = card.n === 'x' ? `len(${target}.owner.hand)` : card.n === 'y' ? 'len(my_ships)' : card.n;
      lines.push(`${pad}for ${v} in range(${n}):`);
    } else lines.push(`${pad}while ${target}.potatoes > ${card.n}:`);
    stack(rest, depth + 1, target);
  };
  if (prog.i) {
    lines.push('for ship in enemy_ships:');
    lines.push(`    if ship.potatoes < ${CARDS[prog.i].cond}:`);
    stack(prog.a, 2, 'ship');
    lines.push('    else:');
    stack(prog.b, 2, 'ship');
  } else if (prog.a.length) stack(prog.a, 0, 'target');
  return lines.join('\n');
}

function shipLine(g, p, s, n) {
  const mode = s.mode === 'battle' ? t(g.lang, 'ship.battle') : t(g.lang, 'ship.anchor');
  const extra = `${s.dp ? ' 👻' : ''}${s.mc ? ' 🚢' : ''}`;
  return `⛵${n} 🥔 **${s.p}** ${mode}${extra} · ${progText(g.lang, s.prog)}`;
}

function logLine(g, e) {
  const p = e.p !== undefined ? plain(g, e.p) : '';
  const tt = e.t !== undefined && e.t !== null ? plain(g, e.t) : '';
  if (e.k === 'log.attack') {
    const hits = e.hits.length ? e.hits.map((h) => `${plain(g, h.t)} -${h.d}`).join(', ') : t(g.lang, 'log.attack_none');
    return t(g.lang, e.k, { p, hits });
  }
  if (e.k === 'log.out') return t(g.lang, e.k, { p, by: e.by !== null && e.by !== undefined ? t(g.lang, 'log.out_by', { by: plain(g, e.by) }) : '' });
  if (e.k === 'log.denied') return t(g.lang, e.k, { p, kind: t(g.lang, `kind.${e.kind}`) });
  return t(g.lang, e.k, { p, t: tt, n: e.n, total: e.total });
}

function pendingText(g) {
  const a = g.pending.a;
  const p = g.players[a.by];
  let what = logLine(g, { k: `log.declare_${a.kind}`, p: a.by, t: a.kind === 'loot' ? a.target : undefined });
  if (a.kind === 'attack') {
    const s = p.ships.find((x) => x.id === a.ship);
    if (s) {
      let target = '';
      if (!s.prog.i) {
        for (const q of g.players) {
          const k = q.ships.findIndex((x) => x.id === Number(a.target));
          if (k >= 0) target = ` → ${plain(g, g.players.indexOf(q))} ⛵${k + 1}`;
        }
      }
      what += `${target}\n\`\`\`py\n${progCode(s.prog)}\n\`\`\``;
    }
  }
  if (g.pending.denies) what += `\n🦑 × ${g.pending.denies}`;
  const wait = waitingFor(g);
  if (wait.length) what += `\n${t(g.lang, 'table.waiting', { names: wait.map((i) => plain(g, i)).join(', '), until: Math.floor(g.pending.deadline / 1000) })}`;
  return what.slice(0, 1024);
}

/** The public table message. */
export function tableMessage(g, now = Date.now()) {
  const L = g.lang;
  const e = { color: COLOR[g.phase], title: t(L, 'title') };
  const rows = [];
  if (g.phase === 'closed') {
    e.description = t(L, 'how.cancel');
    return { embeds: [e], components: [] };
  }
  if (g.phase === 'lobby') {
    const host = g.players.find((p) => p.id === g.host);
    e.description = `${t(L, 'lobby.text', { n: g.players.length, max: g.cfg.maxPlayers, host: host ? host.name : '?' })}\n\n${g.players.map((p, i) => `${i + 1}. ${pname(g, i)}${p.bot ? ` (${t(L, `level.${p.bot}`)})` : ''}`).join('\n') || t(L, 'lobby.none')}`;
    rows.push([
      { key: 'join', data: g.id, label: t(L, 'btn.join'), emoji: '🙋', style: 'success' },
      { key: 'leave', data: g.id, label: t(L, 'btn.leave'), style: 'secondary' },
      { key: 'start', data: g.id, label: t(L, 'btn.start'), emoji: '⛵', style: 'primary', disabled: g.players.length < 2 },
      { key: 'cancel', data: g.id, label: t(L, 'btn.cancel'), style: 'danger' },
    ]);
    rows.push(['easy', 'medium', 'hard'].map((lv) => ({ key: 'addbot', data: `${g.id}:${lv}`, label: t(L, `btn.bot_${lv}`), emoji: BOT, style: 'secondary', disabled: g.players.length >= g.cfg.maxPlayers })));
    rows.push([{ key: 'rules', data: g.id, label: t(L, 'btn.rules'), emoji: '📖', style: 'secondary' }]);
    return { embeds: [e], components: rows };
  }
  const lines = [];
  if (g.phase === 'over') lines.push(t(L, 'table.win', { name: plain(g, g.winner), how: t(L, `how.${g.how ?? 'last'}`) }));
  else lines.push(t(L, 'table.turn', { round: g.round, name: plain(g, g.turn) }));
  if (g.salute) lines.push('', t(L, 'table.salute', { name: plain(g, g.salute.finder), n: 2 * g.salute.count }));
  e.description = lines.join('\n');
  e.fields = g.players.map((p, i) => {
    const head = `${g.phase === 'play' && g.turn === i ? '➡️ ' : ''}${p.bot ? `${BOT} ` : ''}${p.name}${p.out ? ` · ${t(L, 'table.out')}` : ''}`;
    if (p.out) return { name: head.slice(0, 256), value: '​', inline: false };
    const stats = t(L, g.cfg.crystals ? 'table.stats' : 'table.stats_nocrystal', { kings: p.kings, need: g.cfg.kingsToWin, potatoes: potatoes(p), crystals: p.crystals, hand: handCount(p) - p.kings });
    const ships = p.ships.map((s, k) => shipLine(g, p, s, k + 1));
    if (p.reserve) ships.push(t(L, 'table.reserve', { n: p.reserve }));
    return { name: head.slice(0, 256), value: [stats, ...ships].join('\n').slice(0, 1024), inline: false };
  });
  if (g.pending) {
    e.color = COLOR.pending;
    e.fields.push({ name: t(L, 'table.pending'), value: pendingText(g), inline: false });
  }
  e.fields.push({ name: t(L, 'table.log'), value: g.log.slice(-6).map((x) => logLine(g, x)).join('\n').slice(0, 1024) || '—', inline: false });
  e.footer = { text: t(L, 'table.deck', { deck: g.deck.length, discard: g.discard.length }) };
  if (g.phase === 'play') {
    rows.push([
      { key: 'hand', data: g.id, label: t(L, 'btn.hand'), emoji: '🃏', style: 'primary' },
      { key: 'rules', data: g.id, label: t(L, 'btn.rules'), emoji: '📖', style: 'secondary' },
    ]);
    if (g.pending) {
      rows.push([
        { key: 'deny', data: g.id, label: t(L, 'btn.deny'), emoji: '🦑', style: 'danger' },
        { key: 'pass', data: g.id, label: t(L, 'btn.pass'), emoji: '✅', style: 'secondary' },
        { key: 'resolve', data: g.id, label: t(L, 'btn.resolve'), emoji: '⏩', style: 'secondary', disabled: now < g.pending.deadline },
      ]);
    }
    if (g.salute && saluteWaiting(g).length) rows.push([{ key: 'salute', data: g.id, label: t(L, 'btn.salute'), emoji: '🫡', style: 'success' }]);
  }
  return { embeds: [e], components: rows };
}

export function rulesMessage(lang) {
  const cards = ORDER.filter((c) => c !== 'DP' && c !== 'MC').map((c) => `${cardName(lang, c)} ×${CARDS[c].count}${cost(c) ? ` · ${cost(c)}💎` : ''} — ${t(lang, `help.${c}`)}`);
  return {
    embeds: [
      { color: COLOR.play, title: `📖 ${t(lang, 'title')}`, description: (RULES[lang] ?? RULES.en).join('\n\n') },
      { color: COLOR.lobby, description: [...cards, `${cardName(lang, 'DP')} — ${t(lang, 'help.DP')}`, `${cardName(lang, 'MC')} — ${t(lang, 'help.MC')}`].join('\n').slice(0, 4096) },
    ],
  };
}

// ---------- the private hand panel ----------

const cardOptions = (lang, codes, hand) => codes.map((c) => ({ label: `${t(lang, `card.${c}`)} ×${hand.filter((x) => x === c).length}`.slice(0, 100), value: c, emoji: CARDS[c].emoji, description: `${cost(c) ? `${cost(c)}💎 · ` : ''}${t(lang, `help.${c}`)}`.slice(0, 100) }));

function enemyShipOptions(g, pi, filter = () => true) {
  const out = [];
  g.players.forEach((q, i) => {
    if (i === pi || q.out) return;
    q.ships.forEach((s, k) => {
      if (filter(s)) out.push({ label: t(g.lang, 'opt.ship', { n: k + 1, name: plain(g, i), p: s.p }).slice(0, 100), value: String(s.id), description: progText(g.lang, s.prog).slice(0, 100) });
    });
  });
  return out.slice(0, 25);
}

const ownShipOptions = (g, p, filter = () => true) => p.ships.map((s, k) => ({ s, k })).filter(({ s }) => filter(s))
  .map(({ s, k }) => ({ label: t(g.lang, 'opt.ship_own', { n: k + 1, p: s.p }), value: String(s.id), description: progText(g.lang, s.prog).slice(0, 100) }));

/**
 * The hand panel of player pi. view: { name: main|place|target|loot|hijack|manage|amount|surrender, ... }.
 * note: a line on top (the answer to the last click).
 */
export function handPanel(g, pi, view = { name: 'main' }, note = '') {
  const L = g.lang;
  const p = g.players[pi];
  const id = g.id;
  if (!p) return { embeds: [{ color: COLOR.over, description: t(L, 'hand.not_player') }], components: [] };
  const mine = g.phase === 'play' && g.turn === pi && !g.pending;
  const lines = [];
  if (note) lines.push(note, '');
  if (g.phase === 'over') lines.push(t(L, 'table.win', { name: plain(g, g.winner), how: t(L, `how.${g.how ?? 'last'}`) }));
  else if (p.out) lines.push(t(L, 'hand.out'));
  else lines.push(mine ? t(L, 'hand.your_turn') : t(L, 'hand.wait', { name: plain(g, g.turn) }));
  lines.push(t(L, 'hand.potatoes', { n: potatoes(p), ships: p.ships.length, max: g.cfg.maxShips, kings: p.kings, need: g.cfg.kingsToWin }));
  if (g.cfg.crystals) lines.push(t(L, 'hand.crystals', { n: p.crystals, max: g.cfg.crystalsMax, turn: g.cfg.crystalsTurn }));
  const hand = ORDER.filter((c) => p.hand.includes(c)).map((c) => `${cardName(L, c)} ×${p.hand.filter((x) => x === c).length}`);
  const fields = [{ name: `${t(L, 'hand.cards')} (${p.hand.length})`, value: (hand.join('\n') || t(L, 'hand.none')).slice(0, 1024) }];
  p.ships.forEach((s, k) => {
    const ready = canAttack(s) ? ` · ✅ ${t(L, 'hand.ready')} · ${t(L, 'hand.preview', { n: preview(g, p, s) })}` : '';
    const code = progCode(s.prog);
    fields.push({ name: `⛵${k + 1} · 🥔 ${s.p} · ${s.mode === 'battle' ? '⚔️' : '⚓'} · ${slots(s)}/${capacity(s)}${s.dp ? ' 👻' : ''}${s.mc ? ' 🚢' : ''}${ready}`.slice(0, 256), value: (code ? `\`\`\`py\n${code}\n\`\`\`` : t(L, 'ship.empty')).slice(0, 1024) });
  });
  if (p.reserve) fields.push({ name: '🛟', value: t(L, 'table.reserve', { n: p.reserve }) });
  const embed = { color: mine ? '#3ba55d' : COLOR.play, title: t(L, 'hand.title'), description: lines.join('\n'), fields: fields.slice(0, 25) };
  const rows = [];
  const back = { key: 'view', data: `${id}:main`, label: t(L, 'btn.back'), emoji: '⬅️', style: 'secondary' };
  if (g.phase !== 'play' || p.out) return { embeds: [embed], components: [] };

  if (view.name === 'place') {
    embed.description += `\n\n${t(L, 'place.where', { card: cardName(L, view.code) })}`;
    const buttons = [];
    p.ships.forEach((s, k) => {
      if (s.mode !== 'anchor' || s.shot) return;
      if (s.prog.i && !isIf(view.code) && view.code !== 'DP' && view.code !== 'MC') {
        buttons.push({ key: 'place', data: `${id}:${view.code}:${s.id}:a`, label: t(L, 'place.if', { n: k + 1 }), style: 'primary' });
        buttons.push({ key: 'place', data: `${id}:${view.code}:${s.id}:b`, label: t(L, 'place.else', { n: k + 1 }), style: 'primary' });
      } else buttons.push({ key: 'place', data: `${id}:${view.code}:${s.id}:a`, label: t(L, 'place.ship', { n: k + 1 }), style: 'primary' });
    });
    for (let k = 0; k < buttons.length; k += 5) rows.push(buttons.slice(k, k + 5));
    rows.push([back]);
    return { embeds: [embed], components: rows.slice(0, 5) };
  }
  if (view.name === 'target') {
    const options = enemyShipOptions(g, pi);
    if (options.length) rows.push([{ type: 'select', key: 'fire', data: `${id}:${view.ship}`, placeholder: t(L, 'pick.target_ship'), options }]);
    rows.push([back]);
    return { embeds: [embed], components: rows };
  }
  if (view.name === 'loot') {
    const options = g.players.map((q, i) => ({ q, i })).filter(({ q, i }) => i !== pi && !q.out && handCount(q) > 0)
      .map(({ q, i }) => ({ label: t(L, 'opt.player', { name: plain(g, i), hand: handCount(q) }).slice(0, 100), value: String(i) }));
    if (options.length) rows.push([{ type: 'select', key: 'loot', data: id, placeholder: t(L, 'pick.target_player'), options }]);
    rows.push([back]);
    return { embeds: [embed], components: rows };
  }
  if (view.name === 'hijack') {
    const options = enemyShipOptions(g, pi, (s) => s.mode === 'anchor');
    if (options.length) rows.push([{ type: 'select', key: 'hijack', data: id, placeholder: t(L, 'pick.target_ship'), options }]);
    rows.push([back]);
    return { embeds: [embed], components: rows };
  }
  if (view.name === 'amount') {
    const fromLabel = view.from === 'r' ? t(L, 'crew.reserve') : `⛵${p.ships.findIndex((s) => s.id === Number(view.from)) + 1}`;
    const toLabel = `⛵${p.ships.findIndex((s) => s.id === Number(view.to)) + 1}`;
    embed.description += `\n\n${t(L, 'crew.amount', { from: fromLabel, to: toLabel })}`;
    const max = view.from === 'r' ? p.reserve : (p.ships.find((s) => s.id === Number(view.from))?.p ?? 1) - 1;
    const amounts = [...new Set([1, 2, 3, 5, Math.floor(max / 2), max])].filter((n) => n >= 1 && n <= max).sort((a, b) => a - b).slice(0, 5);
    if (amounts.length) rows.push(amounts.map((n) => ({ key: 'crew', data: `${id}:${view.from}:${view.to}:${n}`, label: String(n), emoji: '🥔', style: 'primary' })));
    rows.push([{ ...back, data: `${id}:manage` }]);
    return { embeds: [embed], components: rows };
  }
  if (view.name === 'surrender') {
    rows.push([{ key: 'surr', data: id, label: t(L, 'btn.surrender'), emoji: '🏳️', style: 'danger' }, { ...back }]);
    return { embeds: [embed], components: rows };
  }
  if (view.name === 'manage') {
    const anchoredShips = p.ships.filter((s) => s.mode === 'anchor');
    const routes = [];
    const sources = [...(p.reserve ? [{ id: 'r', label: t(L, 'crew.reserve'), p: p.reserve + 1 }] : []), ...anchoredShips.map((s) => ({ id: String(s.id), label: `⛵${p.ships.indexOf(s) + 1}`, p: s.p }))];
    for (const a of sources) {
      for (const b of anchoredShips) {
        if (a.id === String(b.id) || a.p < 2) continue;
        routes.push({ label: `${a.label} → ⛵${p.ships.indexOf(b) + 1}`, value: `${a.id}>${b.id}`, emoji: '🔀' });
      }
    }
    if (mine && routes.length) rows.push([{ type: 'select', key: 'route', data: id, placeholder: t(L, 'pick.crew'), options: routes.slice(0, 25) }]);
    const prog = ownShipOptions(g, p, (s) => s.mode === 'anchor' && slots(s) > 0);
    if (mine && prog.length) rows.push([{ type: 'select', key: 'unbuild', data: id, placeholder: t(L, 'pick.unbuild'), options: prog }]);
    const aband = ownShipOptions(g, p, (s) => s.mode === 'anchor');
    if (mine && aband.length && anchoredShips.length >= 2) rows.push([{ type: 'select', key: 'abandon', data: id, placeholder: t(L, 'pick.abandon'), options: aband }]);
    const buttons = [back];
    p.ships.forEach((s, k) => {
      if (mine && s.mode === 'battle' && s.dp) buttons.push({ key: 'anchor', data: `${id}:${s.id}`, label: t(L, 'btn.anchor', { n: k + 1 }), emoji: '⚓', style: 'secondary' });
    });
    buttons.push({ key: 'view', data: `${id}:surrender`, label: t(L, 'btn.surrender'), emoji: '🏳️', style: 'danger' });
    rows.push(buttons.slice(0, 5));
    return { embeds: [embed], components: rows.slice(0, 5) };
  }

  // main
  if (p.pick) {
    const codes = ORDER.filter((c) => c !== 'K' && g.discard.includes(c));
    if (codes.length) rows.push([{ type: 'select', key: 'pick', data: id, placeholder: t(L, 'pick.discard'), options: cardOptions(L, codes, g.discard) }]);
  }
  if (mine) {
    const buildable = ORDER.filter((c) => isBuildable(c) && p.hand.includes(c));
    if (buildable.length && p.ships.some((s) => s.mode === 'anchor' && !s.shot)) rows.push([{ type: 'select', key: 'build', data: id, placeholder: t(L, 'pick.build'), options: cardOptions(L, buildable, p.hand) }]);
    const ready = ownShipOptions(g, p, canAttack);
    if (ready.length) rows.push([{ type: 'select', key: 'attack', data: id, placeholder: t(L, 'pick.attack'), options: ready }]);
  }
  const surprises = ['L', 'H', 'S'].filter((c) => p.hand.includes(c));
  if (surprises.length && !g.pending) rows.push([{ type: 'select', key: 'surprise', data: id, placeholder: t(L, 'pick.surprise'), options: cardOptions(L, surprises, p.hand) }]);
  const buttons = [{ key: 'view', data: `${id}:main`, label: t(L, 'btn.refresh'), emoji: '🔄', style: 'secondary' }];
  if (mine) {
    buttons.push({ key: 'buy', data: id, label: t(L, 'btn.buy'), emoji: '🛒', style: 'secondary', disabled: p.ships.length >= g.cfg.maxShips || spare(p) < 5 });
    buttons.push({ key: 'view', data: `${id}:manage`, label: t(L, 'btn.manage'), emoji: '🔧', style: 'secondary' });
    buttons.push({ key: 'end', data: id, label: t(L, 'btn.end'), emoji: '⏭️', style: 'success' });
  } else {
    buttons.push({ key: 'view', data: `${id}:manage`, label: t(L, 'btn.manage'), emoji: '🔧', style: 'secondary' });
  }
  rows.push(buttons);
  return { embeds: [embed], components: rows.slice(0, 5) };
}

