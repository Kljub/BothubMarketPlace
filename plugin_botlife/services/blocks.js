// Logic of the BotLife blocks (nodes/<name>.js hand it to the SDK):
//   start   (/botlife): opens the private panel, a new life when there is none
//   profile (/botlife-profile): a member's life as a public card
//   top     (/botlife-top): the server ranking
import { COUNTRIES } from './data.js';
import { LifeError, newLife, money, netWorth } from './engine.js';
import { lang, loadLife, options, rng, serverLives, withLife } from './flow.js';
import { t } from './i18n.js';
import { panel, profileMessage } from './view.js';

const userId = (v) => /^<?@?!?(\d{15,22})>?$/.exec(String(v ?? '').trim())?.[1] ?? '';
const results = (L) => ({ '': `${L.first} ${L.last}`, '.age': String(L.age), '.money': String(Math.round(L.money)), '.alive': L.dead ? 'no' : 'yes', '.generation': String(L.gen) });

async function fail(ctx, interaction, L, key, params = {}) {
  const text = `❌ ${t(L, key, params)}`;
  if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
  return { port: interaction ? 'replied' : 'failed', results: { '.error': text } };
}

export async function start(ctx, { config, vars, interaction }) {
  const opts = options(ctx);
  const guild = vars['server.id'];
  const user = vars['user.id'];
  if (!guild || !user) return fail(ctx, interaction, opts.lang, 'err.server');
  const gender = { male: 'm', female: 'f', m: 'm', f: 'f' }[String(config.gender ?? '').toLowerCase()];
  const first = String(config.name ?? '').replace(/[`*_~|<>@#]/g, '').trim().slice(0, 24) || undefined;
  let L;
  try {
    L = await withLife(ctx, guild, user, (old) => old ?? newLife(rng(), { lang: opts.lang, cur: opts.cur, gender, first }));
  } catch (err) {
    if (err instanceof LifeError) return fail(ctx, interaction, opts.lang, err.key, err.params);
    throw err;
  }
  if (interaction) await ctx.interaction.reply(interaction, panel(L, 'main', '', opts), { ephemeral: true });
  return { port: interaction ? 'replied' : 'next', results: results(L) };
}

export async function profile(ctx, { config, vars, interaction }) {
  const L0 = lang(ctx);
  const guild = vars['server.id'];
  const who = userId(config.member) || vars['user.id'];
  if (!guild || !who) return fail(ctx, interaction, L0, 'err.server');
  const L = await loadLife(ctx, guild, who);
  if (!L) {
    const text = `❌ ${t(L0, 'err.no_life', { who: `<@${who}>` })}`;
    if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
    return { port: interaction ? 'replied' : 'not_found', results: { '.error': text } };
  }
  if (interaction) await ctx.interaction.reply(interaction, profileMessage(L, who));
  return { port: interaction ? 'replied' : 'next', results: results(L) };
}

const BY = {
  money: { value: (L) => (L.dead ? L.dead.estate : netWorth(L)), show: (L, v) => money(L, v) },
  age: { value: (L) => L.age, show: (L, v) => String(v) },
  gen: { value: (L) => L.gen, show: (L, v) => String(v) },
};

export async function top(ctx, { config, vars, interaction }) {
  const L0 = lang(ctx);
  const guild = vars['server.id'];
  if (!guild) return fail(ctx, interaction, L0, 'err.server');
  const by = BY[config.by] ? config.by : 'money';
  const list = (await serverLives(ctx, guild)).map((x) => ({ ...x, v: BY[by].value(x.L) })).sort((a, b) => b.v - a.v).slice(0, 10);
  const medals = ['🥇', '🥈', '🥉'];
  const text = list.map(({ user, L, v }, i) => `${medals[i] ?? `${i + 1}.`} <@${user}> · ${COUNTRIES[L.country]?.flag ?? ''} ${L.first} ${L.last}${L.dead ? ' 🪦' : ''} — **${BY[by].show(L, v)}**`).join('\n') || t(L0, 'ui.top_none');
  if (interaction) {
    await ctx.interaction.reply(interaction, { embeds: [{ color: '#22c55e', title: `🏆 ${t(L0, 'ui.top_title', { by: t(L0, `ui.top.${by}`) })}`, description: text }] });
  }
  return { port: interaction ? 'replied' : 'next', results: { '': text, '.count': String(list.length) } };
}
