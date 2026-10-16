// Service "view": the private life panel (an ephemeral message) and the
// public cards. Buttons have the key "bl" with data "<verb>:<arg>", selects
// the key "bls" with data "<menu>"; services/interactions.js handles them.
import { ACTIVITIES, ASSETS, COUNTRIES, CRIMES, GRAD, ILLNESSES, JOBS, MAJORS, RIBBONS } from './data.js';
import { activityList, crimeList, family, hasDegree, heirs, jobName, jobOffers, jobSalary, label, money, netWorth, partner, pendingView, relActions, schoolName, studyOptions } from './engine.js';
import { t } from './i18n.js';

const COLOR = '#22c55e';
const btn = (verb, arg, text, emoji, style = 'secondary', disabled = false) => ({ key: 'bl', data: `${verb}:${arg ?? ''}`.slice(0, 64), label: text.slice(0, 80), emoji, style, disabled });
const select = (menu, placeholder, options) => ({ type: 'select', key: 'bls', data: menu, placeholder: placeholder.slice(0, 150), options: options.slice(0, 25) });
const back = (L) => btn('view', 'main', t(L.lang, 'ui.back'), '↩️');
const rows = (list, per = 5) => {
  const out = [];
  for (let i = 0; i < list.length; i += per) out.push(list.slice(i, i + per));
  return out;
};

const bar = (n) => `${'▰'.repeat(Math.round(n / 10))}${'▱'.repeat(10 - Math.round(n / 10))} ${n}%`;
const name = (L) => `${L.first} ${L.last}`;
const flag = (L) => COUNTRIES[L.country]?.flag ?? '🌍';
const genderEmoji = (L) => (L.age < 4 ? '👶' : L.age < 13 ? (L.gender === 'f' ? '👧' : '👦') : L.age < 60 ? (L.gender === 'f' ? '👩' : '👨') : L.gender === 'f' ? '👵' : '👴');

export function ribbonText(L, id) {
  const r = RIBBONS.find(([k]) => k === id);
  return r ? `${r[1]} ${label(L, r[2])}` : id;
}

/** What one does: job, school, prison, retirement. */
function doing(L) {
  if (L.jail) return t(L.lang, 'ui.prison', { years: L.jail.left });
  const parts = [];
  if (L.school) parts.push(`🎒 ${schoolName(L, L.school)} · ${t(L.lang, 'ui.grade', { n: L.school.grade })}`);
  if (L.job) parts.push(`💼 ${jobName(L)} · ${money(L, jobSalary(L))}`);
  if (!parts.length) parts.push(L.pension ? `🏖️ ${t(L.lang, 'ui.retired')} · ${money(L, L.pension)}` : L.age >= 16 ? t(L.lang, 'ui.unemployed') : t(L.lang, 'ui.none'));
  return parts.join('\n');
}

function education(L) {
  const list = L.degrees.map((d) => (d === 'high' ? t(L.lang, 'school.high') : d.startsWith('uni:') ? `${t(L.lang, 'school.uni')} (${label(L, MAJORS[d.slice(4)])})` : GRAD[d] ? label(L, GRAD[d].name) : d));
  return list.join(', ') || t(L.lang, 'ui.none');
}

/** The main card of a life (also used for the public profile). */
export function lifeEmbed(L, { log = true } = {}) {
  const p = partner(L);
  const fields = [
    { name: `💵 ${t(L.lang, 'ui.money')}`, value: `${money(L, L.money)}${L.debt > 0 ? `\n(${t(L.lang, 'ui.debt')} ${money(L, L.debt)})` : ''}`, inline: true },
    { name: `📋 ${t(L.lang, 'ui.job')}`, value: doing(L), inline: true },
    { name: `💑 ${t(L.lang, 'ui.relationship')}`, value: p ? `${p.n} (${t(L.lang, `rel.${p.k}`)})` : t(L.lang, 'ui.single'), inline: true },
    { name: `🎓 ${t(L.lang, 'ui.education')}`, value: education(L), inline: true },
  ];
  if (L.ill.length) fields.push({ name: '🤒', value: t(L.lang, 'ui.ill', { list: L.ill.map((id) => label(L, ILLNESSES[id].name)).join(', ') }), inline: true });
  if (log && L.log.length) fields.push({ name: `📜 ${t(L.lang, 'ui.story')}`, value: L.log.slice(-8).map(([, line]) => line).join('\n').slice(0, 1024) });
  return {
    color: L.dead ? '#6b7280' : COLOR,
    title: `${genderEmoji(L)} ${t(L.lang, 'ui.title', { name: name(L), age: L.age })} ${flag(L)}`,
    description: [
      `❤️ ${t(L.lang, 'ui.health')} ${bar(L.h)}`,
      `😊 ${t(L.lang, 'ui.happy')} ${bar(L.hp)}`,
      `🧠 ${t(L.lang, 'ui.smarts')} ${bar(L.sm)}`,
      `✨ ${t(L.lang, 'ui.looks')} ${bar(L.lk)}`,
    ].join('\n'),
    fields,
    footer: { text: `BotLife · ${t(L.lang, 'ui.gen', { n: L.gen })}` },
  };
}

function deadPanel(L) {
  const d = L.dead;
  const kids = heirs(L);
  const comps = [];
  if (kids.length) comps.push([select('heir', t(L.lang, 'ui.pick_heir'), kids.map(({ p, i }) => ({ label: `${p.n} (${p.a})`.slice(0, 100), value: String(i), emoji: '🧬' })))]);
  comps.push([btn('new', 'go', t(L.lang, 'ui.new_life'), '👶', 'primary')]);
  return {
    embeds: [{
      color: '#6b7280',
      title: t(L.lang, 'ui.rip', { name: name(L), from: 0, age: d.age }),
      description: t(L.lang, 'ui.rip_text', { age: d.age, cause: t(L.lang, d.cause), estate: money(L, d.estate), ribbon: ribbonText(L, d.ribbon) }) + (kids.length ? '' : `\n\n${t(L.lang, 'ui.no_heirs')}`),
      fields: [{ name: `📜 ${t(L.lang, 'ui.story')}`, value: L.log.slice(-8).map(([, line]) => line).join('\n').slice(0, 1024) || '—' }],
      footer: { text: `BotLife · ${t(L.lang, 'ui.gen', { n: L.gen })}` },
    }],
    components: comps,
  };
}

function pendingPanel(L) {
  const q = pendingView(L);
  const embed = { ...lifeEmbed(L), color: '#f59e0b' };
  embed.fields = [...embed.fields.filter((f) => !f.name.startsWith('📜')), { name: `❓ ${t(L.lang, 'ui.decide')}`, value: q.text }];
  const components = q.choices.length > 5
    ? [[select('choose', t(L.lang, 'ui.decide'), q.choices.map(([v, l]) => ({ label: l, value: v })))]]
    : [q.choices.map(([v, l], i) => btn('choose', v, l, undefined, i === 0 ? 'primary' : 'secondary'))];
  return { embeds: [embed], components };
}

function mainButtons(L, opts) {
  if (L.jail) {
    return [
      [btn('age', '', t(L.lang, 'ui.age_up'), '🎂', 'primary'), btn('jail', 'workout', t(L.lang, 'ui.workout'), '💪'), btn('jail', 'study', t(L.lang, 'ui.read'), '📖'), btn('jail', 'riot', t(L.lang, 'ui.riot'), '🔥', 'danger'), btn('jail', 'escape', t(L.lang, 'ui.escape'), '🏃', 'danger')],
      [btn('view', 'people', t(L.lang, 'ui.people'), '👪')],
    ];
  }
  const second = [];
  if (opts.crime && L.age >= 10) second.push(btn('view', 'crime', t(L.lang, 'ui.crime'), '🦹', 'danger'));
  second.push(btn('view', 'confirm_new', t(L.lang, 'ui.new_life'), '🔄'));
  return [
    [btn('age', '', t(L.lang, 'ui.age_up'), '🎂', 'success'), btn('view', 'job', t(L.lang, 'ui.occupation'), '💼', 'secondary', L.age < 5), btn('view', 'activities', t(L.lang, 'ui.activities'), '🎯'), btn('view', 'people', t(L.lang, 'ui.people'), '👪'), btn('view', 'assets', t(L.lang, 'ui.assets'), '🏠', 'secondary', L.age < 18)],
    second,
  ];
}

/**
 * The private panel. view: main | job | activities | casino | love | emigrate
 * | people | person:<i> | assets | crime | confirm_new. note: a line on top.
 * opts: { crime } (dashboard).
 */
export function panel(L, view = 'main', noteText = '', opts = {}) {
  let msg;
  if (L.dead) msg = deadPanel(L);
  else if (L.pending) msg = pendingPanel(L);
  else msg = { embeds: [lifeEmbed(L)], components: subview(L, view, opts) };
  return { content: noteText ? noteText.slice(0, 1900) : undefined, ...msg };
}

function subview(L, view, opts) {
  const lang = L.lang;
  if (view === 'job') {
    const out = [];
    const line = [];
    if (L.school) line.push(btn('school', 'study', t(lang, 'ui.study'), '📖', 'primary'), btn('school', 'dropout', t(lang, 'ui.dropout'), '🚪', 'danger', L.age < 16));
    if (L.job) {
      line.push(btn('job', 'work', t(lang, 'ui.work'), '💪', 'primary'), btn('job', 'raise', t(lang, 'ui.raise'), '💵'), btn('job', 'quit', t(lang, 'ui.quit'), '👋', 'danger'));
      if (L.age >= 60 && !JOBS[L.job.id].part) line.push(btn('job', 'retire', t(lang, 'ui.retire'), '🏖️'));
    }
    if (line.length) out.push(...rows(line));
    const offers = jobOffers(L);
    if (offers.length) out.push([select('apply', t(lang, 'ui.pick_job'), offers.map((id) => ({ label: label(L, JOBS[id].name), value: id, description: `${money(L, JOBS[id].salary)}${JOBS[id].part ? ' · part-time' : ''}`, emoji: '💼' })))]);
    const study = studyOptions(L);
    if (study.length) {
      out.push([select('enroll', t(lang, 'ui.pick_school'), study.map((o) => ({
        label: o.kind === 'uni' ? `${t(lang, 'school.uni')}: ${label(L, MAJORS[o.major])}` : o.kind === 'ged' ? t(lang, 'school.ged') : label(L, GRAD[o.kind].name),
        value: o.kind === 'uni' ? `uni:${o.major}` : o.kind, emoji: '🎓',
      })))]);
    }
    out.push([back(L)]);
    return out.slice(0, 5);
  }
  if (view === 'activities') {
    const list = activityList(L);
    return [
      [select('activity', t(lang, 'ui.pick_activity'), list.map((id) => ({ label: label(L, ACTIVITIES[id].name), value: id, emoji: ACTIVITIES[id].emoji, description: ACTIVITIES[id].cost ? money(L, ACTIVITIES[id].cost) : undefined })))],
      [back(L)],
    ];
  }
  if (view === 'casino') {
    return [
      [btn('act', 'casino|100', money(L, 100), '🎰'), btn('act', 'casino|1000', money(L, 1_000), '🎰'), btn('act', 'casino|10000', money(L, 10_000), '🎰'), btn('act', 'casino|all', t(lang, 'ui.all_in'), '🔥', 'danger')],
      [back(L)],
    ];
  }
  if (view === 'love') return [[btn('act', 'love|f', t(lang, 'ui.date_f'), '👩'), btn('act', 'love|m', t(lang, 'ui.date_m'), '👨')], [back(L)]];
  if (view === 'emigrate') {
    return [
      [select('emigrate', t(lang, 'ui.pick_country'), Object.entries(COUNTRIES).filter(([id]) => id !== L.country).map(([id, c]) => ({ label: label(L, c.name), value: id, emoji: c.flag })))],
      [back(L)],
    ];
  }
  if (view === 'people') {
    const list = L.rel.map((p, i) => ({ p, i })).filter(({ p }) => !p.d);
    const out = [];
    if (list.length) out.push([select('person', t(lang, 'ui.pick_person'), list.map(({ p, i }) => ({ label: `${p.n} (${p.a})`.slice(0, 100), value: String(i), description: `${t(lang, `rel.${p.k}`)} · ${t(lang, 'ui.closeness', { n: p.c })}` })))]);
    out.push([back(L)]);
    return out;
  }
  if (view.startsWith('person:')) {
    const i = Number(view.slice(7));
    const acts = relActions(L, L.rel[i]);
    return [...rows(acts.map((a) => btn('rel', `${i}|${a}`, t(lang, `act.${a}`), undefined, ['argue', 'breakup', 'divorce'].includes(a) ? 'danger' : 'secondary'))).slice(0, 3), [btn('view', 'people', t(lang, 'ui.back'), '↩️')]];
  }
  if (view === 'assets') {
    const out = [[select('buy', t(lang, 'ui.pick_buy'), Object.entries(ASSETS).map(([id, a]) => ({ label: label(L, a.name), value: id, emoji: a.emoji, description: money(L, a.price) })))]];
    if (L.assets.length) out.push([select('sell', t(lang, 'ui.pick_sell'), L.assets.map((a, i) => ({ label: label(L, ASSETS[a.id].name), value: String(i), emoji: ASSETS[a.id].emoji, description: t(lang, 'ui.value', { amount: money(L, a.v) }) })))]);
    out.push([back(L)]);
    return out;
  }
  if (view === 'crime') {
    return [
      [select('crime', t(lang, 'ui.pick_crime'), crimeList(L).map((id) => ({ label: label(L, CRIMES[id].name), value: id, emoji: CRIMES[id].emoji })))],
      [back(L)],
    ];
  }
  if (view === 'confirm_new') return [[btn('new', 'go', t(lang, 'ui.yes_new'), '👶', 'danger'), back(L)]];
  return mainButtons(L, opts);
}

/** Assets as text (for the assets view note). */
export function assetsText(L) {
  if (!L.assets.length) return t(L.lang, 'ui.no_assets');
  return L.assets.map((a) => `${ASSETS[a.id].emoji} ${label(L, ASSETS[a.id].name)} · ${t(L.lang, 'ui.value', { amount: money(L, a.v) })}`).join('\n');
}

/** People as text (for the people view note). */
export function peopleText(L) {
  const list = L.rel.filter((p) => !p.d);
  if (!list.length) return t(L.lang, 'ui.no_people');
  return list.map((p) => `${p.g === 'f' ? '👩' : '👨'} **${p.n}** (${p.a}) · ${t(L.lang, `rel.${p.k}`)} · ${t(L.lang, 'ui.closeness', { n: p.c })}`).join('\n').slice(0, 1900);
}

/** The public card of /botlife-profile. */
export function profileMessage(L, userId) {
  const e = lifeEmbed(L, { log: false });
  e.fields.push({ name: `🏦 ${t(L.lang, 'ui.net')}`, value: money(L, L.dead ? L.dead.estate : netWorth(L)), inline: true });
  if (L.dead) e.fields.push({ name: '🪦', value: t(L.lang, 'ui.rip_text', { age: L.dead.age, cause: t(L.lang, L.dead.cause), estate: money(L, L.dead.estate), ribbon: ribbonText(L, L.dead.ribbon) }) });
  return { content: `<@${userId}>`, embeds: [e] };
}

export { family, hasDegree };
