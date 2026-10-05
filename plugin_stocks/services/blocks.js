// Stock Market: fictional shares per server. Prices move once per interval
// (setting update_minutes) by a random step within the volatility of the
// stock; the steps come from a seeded random number of server, symbol and
// interval, so every member sees the same price. Members buy and sell with
// the Economy currency (setting currencyKey), a fee in percent goes away.
// Storage: "market:<guild>" = { SYMBOL: { price, prev, step } },
// "pf:<guild>:<user>" = { SYMBOL: { shares, invested } }.
import { money, wallet } from './econ.js';
import { readJson, setting, writeJson } from './util.js';

export const DEFAULT_STOCKS = [
  { symbol: 'BHUB', name: 'BotHub Inc.', price: '100', volatility: 5 },
  { symbol: 'PIXL', name: 'Pixel Foods', price: '40', volatility: 3 },
  { symbol: 'ROCK', name: 'Rocket Labs', price: '250', volatility: 8 },
  { symbol: 'SHNY', name: 'Shiny Coin', price: '10', volatility: 12 },
  { symbol: 'MEME', name: 'Meme Corp', price: '5', volatility: 20 },
];

const int = (v, min, max, fb) => Math.max(min, Math.min(max, Math.floor(Number(v)) || fb));
const sym = (v) => String(v ?? '').trim().toUpperCase();

export function stockList(ctx) {
  const own = setting(ctx, 'stocks', []).filter((s) => /^[A-Z0-9]{1,6}$/.test(sym(s?.symbol)) && String(s?.name ?? '').trim());
  return (own.length ? own : DEFAULT_STOCKS).map((s) => ({ symbol: sym(s.symbol), name: String(s.name).trim(), start: int(s.price, 1, 1e9, 100), volatility: int(s.volatility, 1, 50, 5) }));
}

/** Small seeded generator (mulberry32 of a string hash), 0 <= x < 1. */
export function seeded(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 3432918353), h = (h << 13) | (h >>> 19);
  let a = h >>> 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** The price after one interval: up or down by at most the volatility, never below 1. */
export function nextPrice(price, volatility, r) {
  return Math.max(1, Math.round(price * (1 + (volatility / 100) * (r * 2 - 1))));
}

const stepNow = (ctx, now) => Math.floor(now / (int(setting(ctx, 'update_minutes', 60), 5, 1440, 60) * 60_000));

/** Brings the market of a server up to now (at most 500 intervals at once). */
export async function market(ctx, guild, now = Date.now()) {
  const step = stepNow(ctx, now);
  const state = await readJson(ctx, `market:${guild}`, {});
  const out = {};
  for (const s of stockList(ctx)) {
    const st = state[s.symbol] ?? { price: s.start, prev: s.start, step };
    let { price, prev } = st;
    for (let i = Math.max(st.step, step - 500) + 1; i <= step; i++) {
      prev = price;
      price = nextPrice(price, s.volatility, seeded(`${guild}:${s.symbol}:${i}`));
    }
    out[s.symbol] = { price, prev, step };
  }
  await writeJson(ctx, `market:${guild}`, out);
  return out;
}

const change = (m) => {
  const pct = ((m.price - m.prev) / m.prev) * 100;
  return `${pct > 0 ? '📈 +' : pct < 0 ? '📉 ' : '➖ '}${pct.toFixed(1)}%`;
};

async function answer(ctx, interaction, ok, message, result = '') {
  if (interaction) {
    await ctx.interaction.reply(interaction, message, { ephemeral: !ok || typeof message === 'string' });
    return { port: ok ? 'replied' : 'failed', results: { '': result } };
  }
  return { port: ok ? 'next' : 'failed', results: { '': result } };
}

const who = (vars) => (vars['server.id'] && vars['user.id'] ? [vars['server.id'], vars['user.id']] : null);
const feeOf = (ctx, n) => Math.ceil((n * int(setting(ctx, 'fee_percent', 1), 0, 50, 0)) / 100);

export async function stocks(ctx, { vars, interaction }) {
  const id = who(vars);
  if (!id) return answer(ctx, interaction, false, '❌ Only on a server.');
  const m = await market(ctx, id[0]);
  await wallet(ctx).get(...id); // loads the currency name
  const next = (stepNow(ctx, Date.now()) + 1) * int(setting(ctx, 'update_minutes', 60), 5, 1440, 60) * 60;
  const lines = stockList(ctx).map((s) => `\`${s.symbol.padEnd(6)}\` **${s.name}** · ${money(ctx, m[s.symbol].price)} · ${change(m[s.symbol])}`);
  return answer(ctx, interaction, true, { embeds: [{ color: '#0ea5e9', title: '🏦 Stock market', description: `${lines.join('\n')}\n\nNext prices <t:${next}:R> · /stock-buy · /stock-sell · /portfolio` }] }, String(lines.length));
}

export async function buy(ctx, { config, vars, interaction }) {
  const id = who(vars);
  if (!id) return answer(ctx, interaction, false, '❌ Only on a server.');
  const s = stockList(ctx).find((x) => x.symbol === sym(config.symbol));
  if (!s) return answer(ctx, interaction, false, '❌ Unknown stock. See /stocks.');
  const shares = int(config.shares, 1, 1e6, 0);
  if (!shares) return answer(ctx, interaction, false, '❌ Name a number of shares from 1.');
  const price = (await market(ctx, id[0]))[s.symbol].price;
  const cost = price * shares;
  const total = cost + feeOf(ctx, cost);
  try {
    await wallet(ctx).remove(...id, total);
  } catch (err) {
    if (String(err?.message ?? err).includes('not_enough')) return answer(ctx, interaction, false, `❌ That costs ${money(ctx, total)}; you have ${money(ctx, await wallet(ctx).get(...id))}.`);
    throw err;
  }
  const pf = await readJson(ctx, `pf:${id[0]}:${id[1]}`, {});
  const h = pf[s.symbol] ?? { shares: 0, invested: 0 };
  pf[s.symbol] = { shares: h.shares + shares, invested: h.invested + total };
  await writeJson(ctx, `pf:${id[0]}:${id[1]}`, pf);
  return answer(ctx, interaction, true, { embeds: [{ color: '#22c55e', title: `🛒 Bought ${shares}× ${s.symbol}`, description: `${s.name} at ${money(ctx, price)} each\nPaid: ${money(ctx, total)}${total > cost ? ` (fee ${money(ctx, total - cost)})` : ''}\nYou hold ${pf[s.symbol].shares} shares.` }] }, String(total));
}

export async function sell(ctx, { config, vars, interaction }) {
  const id = who(vars);
  if (!id) return answer(ctx, interaction, false, '❌ Only on a server.');
  const s = stockList(ctx).find((x) => x.symbol === sym(config.symbol));
  if (!s) return answer(ctx, interaction, false, '❌ Unknown stock. See /stocks.');
  const pf = await readJson(ctx, `pf:${id[0]}:${id[1]}`, {});
  const h = pf[s.symbol];
  if (!h?.shares) return answer(ctx, interaction, false, `❌ You hold no ${s.symbol} shares.`);
  const shares = String(config.shares ?? '').trim().toLowerCase() === 'all' || !String(config.shares ?? '').trim() ? h.shares : int(config.shares, 1, 1e6, 0);
  if (!shares || shares > h.shares) return answer(ctx, interaction, false, `❌ You hold only ${h.shares} ${s.symbol} shares.`);
  const price = (await market(ctx, id[0]))[s.symbol].price;
  const gross = price * shares;
  const got = gross - feeOf(ctx, gross);
  const basis = Math.round((h.invested * shares) / h.shares);
  if (shares === h.shares) delete pf[s.symbol];
  else pf[s.symbol] = { shares: h.shares - shares, invested: h.invested - basis };
  await writeJson(ctx, `pf:${id[0]}:${id[1]}`, pf);
  const balance = await wallet(ctx).add(...id, got);
  const profit = got - basis;
  return answer(ctx, interaction, true, { embeds: [{ color: profit >= 0 ? '#22c55e' : '#ef4444', title: `💸 Sold ${shares}× ${s.symbol}`, description: `${s.name} at ${money(ctx, price)} each\nYou got: ${money(ctx, got)} (${profit >= 0 ? 'profit' : 'loss'} ${money(ctx, Math.abs(profit))})\nBalance: ${money(ctx, balance)}` }] }, String(got));
}

export async function portfolio(ctx, { vars, interaction }) {
  const id = who(vars);
  if (!id) return answer(ctx, interaction, false, '❌ Only on a server.');
  const pf = await readJson(ctx, `pf:${id[0]}:${id[1]}`, {});
  const m = await market(ctx, id[0]);
  await wallet(ctx).get(...id);
  const rows = Object.entries(pf).filter(([k, h]) => m[k] && h.shares > 0);
  if (!rows.length) return answer(ctx, interaction, true, '💼 You hold no shares. See /stocks.', '0');
  let worth = 0;
  let invested = 0;
  const lines = rows.map(([k, h]) => {
    const value = m[k].price * h.shares;
    worth += value;
    invested += h.invested;
    return `\`${k.padEnd(6)}\` ${h.shares}× · ${money(ctx, value)} · ${value >= h.invested ? '+' : ''}${(((value - h.invested) / h.invested) * 100).toFixed(1)}%`;
  });
  return answer(ctx, interaction, true, { embeds: [{ color: '#0ea5e9', title: '💼 Portfolio', description: `${lines.join('\n')}\n\nWorth: ${money(ctx, worth)} · paid: ${money(ctx, invested)}` }] }, String(worth));
}
