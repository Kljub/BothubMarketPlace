// Service "engine": the rules of BotLife. A life is one JSON object (stored
// per member and server, see flow.js); every function changes it in place
// and writes what happened into its log in the life's language. r is the
// random source (0 <= r() < 1), so tests can fix it. No Discord, no storage.
import { ACTIVITIES, ASSETS, COUNTRIES, CRIMES, GRAD, ILLNESSES, JOBS, LEVEL_PAY, MAJORS, PER_YEAR, RETIRE_AGE, RIBBONS, UNI_COST, UNI_YEARS } from './data.js';
import { EVENTS } from './events.js';
import { t } from './i18n.js';

/** A rule says no: key of services/i18n.js. */
export class LifeError extends Error {
  constructor(key, params = {}) {
    super(key);
    this.key = key;
    this.params = params;
  }
}

export const MAX_LOG = 14;
export const MAX_REL = 24;
export const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
export const between = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
export const pick = (r, list) => list[Math.floor(r() * list.length)];
export const label = (L, pair) => pair[L.lang === 'de' ? 1 : 0];

/** Money as text with the life's currency: $1,234 / -$50. */
export function money(L, n) {
  const v = Math.round(Number(n) || 0);
  return `${v < 0 ? '-' : ''}${L.cur}${Math.abs(v).toLocaleString('en-US')}`;
}

/** Writes a line into this year's log. */
export function note(L, key, params = {}) {
  L.log.push([L.age, t(L.lang, key, { cur: L.cur, ...params })]);
  if (L.log.length > MAX_LOG) L.log.splice(0, L.log.length - MAX_LOG);
}

const stat = (L, key, delta) => {
  L[key] = clamp(L[key] + delta);
};
const randomStats = (r) => ({ h: between(r, 70, 100), hp: between(r, 60, 100), sm: between(r, 10, 100), lk: between(r, 10, 100) });

const person = (r, L, kind, { gender, age, last, close } = {}) => {
  const c = COUNTRIES[L.country] ?? COUNTRIES.us;
  const g = gender ?? (r() < 0.5 ? 'm' : 'f');
  return { n: `${pick(r, c[g])} ${last ?? pick(r, c.last)}`, g, a: age ?? 0, k: kind, c: close ?? between(r, 50, 100) };
};

/**
 * A new life: born now (or continued as a child: opts.from with the dead
 * parent's family). opts: lang, cur, gender, first, country.
 */
export function newLife(r, opts = {}) {
  const country = COUNTRIES[opts.country] ? opts.country : pick(r, Object.keys(COUNTRIES));
  const c = COUNTRIES[country];
  const gender = opts.gender === 'm' || opts.gender === 'f' ? opts.gender : r() < 0.5 ? 'm' : 'f';
  const last = opts.last ?? pick(r, c.last);
  const L = {
    v: 1, lang: opts.lang === 'de' ? 'de' : 'en', cur: opts.cur ?? '$', gen: opts.gen ?? 1,
    first: String(opts.first ?? pick(r, c[gender])).slice(0, 24), last, gender, country, age: opts.age ?? 0,
    ...randomStats(r), karma: 50, money: opts.money ?? 0, debt: 0, wealth: opts.wealth ?? between(r, 0, 100),
    school: null, degrees: [...(opts.degrees ?? [])], job: null, pension: 0, jail: null, record: 0, ill: [],
    rel: [], assets: [], used: {}, pending: null, log: [], lovers: 0, marriages: 0, peak: 0, expecting: false, dead: null,
  };
  if (opts.family) L.rel = opts.family;
  else {
    L.rel.push(person(r, L, 'mother', { gender: 'f', age: between(r, 18, 42), last }));
    L.rel.push(person(r, L, 'father', { gender: 'm', age: between(r, 18, 48), last }));
    const siblings = r() < 0.6 ? between(r, 1, 3) : 0;
    for (let i = 0; i < siblings; i++) L.rel.push(person(r, L, 'sibling', { age: between(r, 1, 14), last }));
  }
  note(L, opts.age ? 'log.continue' : 'log.born', { name: `${L.first} ${L.last}`, country: label(L, c.name), flag: c.flag, age: L.age });
  return L;
}

const alive = (p) => !p.d;
export const family = (L, ...kinds) => L.rel.filter((p) => alive(p) && kinds.includes(p.k));
export const partner = (L) => L.rel.find((p) => alive(p) && ['partner', 'fiance', 'spouse'].includes(p.k)) ?? null;
const inSchoolFullTime = (L) => Boolean(L.school);
export const hasDegree = (L, d) => L.degrees.some((x) => x === d || x.startsWith(`${d}:`));
const uniMajor = (L) => L.degrees.find((x) => x.startsWith('uni:'))?.slice(4) ?? null;
const ensureAlive = (L) => {
  if (L.dead) throw new LifeError('err.dead');
  if (L.pending) throw new LifeError('err.pending');
};
const use = (L, key) => {
  L.used[key] = (L.used[key] ?? 0) + 1;
  return L.used[key] <= PER_YEAR;
};
/** The net worth: money plus everything owned, minus loans. */
export const netWorth = (L) => L.money - L.debt + L.assets.reduce((s, a) => s + a.v, 0);

/** Chance to die this year by age and health. */
export function mortality(age, health) {
  if (health <= 0 || age >= 122) return 1;
  const base = age < 1 ? 0.003 : age < 40 ? 0.0008 : age < 60 ? 0.004 : age < 75 ? 0.02 + (age - 60) * 0.004 : 0.08 + (age - 75) * 0.014;
  return Math.min(0.95, base * (1 + Math.max(0, 50 - health) / 15));
}

// ── The year ───────────────────────────────────────────────────────────────

/** One year older: school, work, money, family, health, an event, maybe death. */
export function ageUp(L, r) {
  ensureAlive(L);
  L.age += 1;
  L.used = {};
  note(L, 'log.year', { age: L.age });

  // Family: everyone gets older, old relatives may die, a baby may come.
  for (const p of L.rel) {
    if (!alive(p)) continue;
    p.a += 1;
    if (p.y !== undefined) p.y += 1;
    if (!['child', 'spouse'].includes(p.k)) p.c = clamp(p.c - between(r, 0, 3));
    if (r() < mortality(p.a, 70)) {
      p.d = true;
      stat(L, 'hp', p.k === 'friend' || p.k === 'ex' ? -3 : -12);
      note(L, 'log.rel_died', { rel: t(L.lang, `rel.${p.k}`), name: p.n, age: p.a });
    }
  }
  if (L.expecting) {
    L.expecting = false;
    const other = partner(L);
    const baby = person(r, L, 'child', { age: 0, last: L.last, close: 100 });
    if (L.rel.length < MAX_REL) L.rel.push(baby);
    stat(L, 'hp', 10);
    note(L, 'log.baby', { name: baby.n, other: other?.n ?? '—' });
  }

  // Body and mind.
  if (L.age >= 50) stat(L, 'h', -between(r, 0, 2));
  if (L.age >= 30) stat(L, 'lk', -between(r, 0, 1));
  stat(L, 'hp', between(r, -3, 3));
  // A young body recovers; illnesses hurt until they pass or a doctor helps.
  if (L.age < 45) stat(L, 'h', between(r, 0, 3));
  for (const id of [...L.ill]) {
    const ill = ILLNESSES[id];
    stat(L, 'h', -ill.loss);
    if (ill.happy) stat(L, 'hp', -ill.happy);
    if (ill.heal && r() < ill.heal) {
      L.ill = L.ill.filter((x) => x !== id);
      note(L, 'log.healed', { ill: label(L, ill.name) });
    }
  }
  for (const [id, ill] of Object.entries(ILLNESSES)) {
    if (L.age >= ill.minAge && !L.ill.includes(id) && r() < ill.chance * (L.h < 40 ? 2 : 1)) {
      L.ill.push(id);
      note(L, 'log.ill', { ill: label(L, ill.name) });
    }
  }

  if (L.jail) yearInJail(L);
  else {
    yearAtSchool(L, r);
    yearAtWork(L, r);
  }
  yearOfMoney(L, r);

  // Something happens, maybe with a choice.
  if (!L.jail && r() < 0.55) randomEvent(L, r);
  if (!L.school && !L.jail && L.age === 18 && hasDegree(L, 'high') && !hasDegree(L, 'uni') && !L.pending) {
    L.pending = { e: 'uni' };
  }

  L.peak = Math.max(L.peak, netWorth(L));
  if (r() < mortality(L.age, L.h)) die(L, L.h <= 0 ? 'cause.health' : L.ill.length ? `cause.${L.ill[0]}` : L.age >= 70 ? 'cause.age' : 'cause.accident');
}

function yearAtSchool(L, r) {
  // Children start school by themselves.
  if (!L.school && L.age === 5) L.school = { kind: 'primary', year: 1, total: 6, grade: clamp(L.sm + between(r, -10, 10)) };
  if (!L.school) return;
  const s = L.school;
  s.grade = clamp(s.grade + Math.round((L.sm - s.grade) / 5) + between(r, -4, 4));
  if (['uni', 'med', 'law', 'grad'].includes(s.kind)) {
    const cost = s.kind === 'uni' ? UNI_COST : GRAD[s.kind].cost;
    if (s.paid) note(L, 'log.tuition_paid', { amount: money(L, cost) });
    else {
      L.debt += cost;
      note(L, 'log.tuition_loan', { amount: money(L, cost) });
    }
  }
  s.year += 1;
  if (s.year <= s.total) return;
  // Finished this school.
  const next = { primary: ['middle', 3], middle: ['high', 4] }[s.kind];
  if (next) {
    L.school = { kind: next[0], year: 1, total: next[1], grade: s.grade };
    note(L, `log.school_${next[0]}`);
    return;
  }
  L.school = null;
  if (s.kind === 'high' || s.kind === 'ged') {
    if (s.grade < 25 && r() < 0.5) {
      note(L, 'log.failed_high');
      return;
    }
    L.degrees.push('high');
    note(L, 'log.graduated_high');
    return;
  }
  const degree = s.kind === 'uni' ? `uni:${s.major}` : s.kind;
  L.degrees.push(degree);
  stat(L, 'hp', 10);
  note(L, 'log.graduated', { school: schoolName(L, s) });
}

export function schoolName(L, s) {
  if (s.kind === 'uni') return `${t(L.lang, 'school.uni')} (${label(L, MAJORS[s.major])})`;
  if (GRAD[s.kind]) return label(L, GRAD[s.kind].name);
  return t(L.lang, `school.${s.kind}`);
}

const jobSalary = (L) => (L.job ? Math.round(JOBS[L.job.id].salary * LEVEL_PAY[L.job.level - 1] * (1 + (L.job.bonus ?? 0))) : 0);
export { jobSalary };

function yearAtWork(L, r) {
  if (!L.job) return;
  const j = L.job;
  j.years += 1;
  j.perf = clamp(j.perf + between(r, -8, 6));
  if (j.perf < 15 && r() < 0.5) {
    note(L, 'log.fired', { job: jobName(L) });
    L.job = null;
    stat(L, 'hp', -10);
    return;
  }
  if (j.level < LEVEL_PAY.length && j.perf >= 70 && j.years >= 2 && r() < 0.45) {
    j.level += 1;
    j.perf = clamp(j.perf - 20);
    stat(L, 'hp', 8);
    note(L, 'log.promoted', { job: jobName(L), level: j.level });
  }
}

export const jobName = (L) => (L.job ? `${label(L, JOBS[L.job.id].name)} (${t(L.lang, 'job.level', { n: L.job.level })})` : '');

function yearInJail(L) {
  L.jail.left -= 1;
  stat(L, 'hp', -4);
  if (L.jail.left <= 0) {
    L.jail = null;
    note(L, 'log.released');
  } else note(L, 'log.in_jail', { years: L.jail.left });
}

function yearOfMoney(L, r) {
  let income = 0;
  if (L.job && !L.jail) income += Math.round(jobSalary(L) * 0.75);
  if (L.pension) income += L.pension;
  let costs = 0;
  if (L.age >= 18 && !L.jail && !(inSchoolFullTime(L) && L.age < 23)) costs += L.age >= 22 || !family(L, 'mother', 'father').length ? 9_000 : 4_000;
  for (const a of L.assets) {
    const def = ASSETS[a.id];
    costs += Math.round(a.v * (def.kind === 'house' ? 0.01 : 0.03));
    a.v = Math.max(100, Math.round(a.v * (def.kind === 'house' ? 1 + between(r, -5, 8) / 100 : 0.88)));
  }
  if (L.debt > 0 && !L.school) {
    const pay = Math.min(L.debt, Math.max(2_000, Math.round(income * 0.1)));
    L.debt -= pay;
    costs += pay;
  }
  L.money += income - costs;
  if (income || costs) note(L, 'log.money', { income: money(L, income), costs: money(L, costs) });
  if (L.money < 0) stat(L, 'hp', -5);
}

function randomEvent(L, r) {
  const list = Object.entries(EVENTS).filter(([, e]) => L.age >= e.age[0] && L.age <= e.age[1] && (!e.if || e.if(L)));
  if (!list.length) return;
  const total = list.reduce((s, [, e]) => s + (e.w ?? 1), 0);
  let x = r() * total;
  for (const [id, e] of list) {
    x -= e.w ?? 1;
    if (x > 0) continue;
    const params = e.start ? e.start(L, r) ?? {} : {};
    if (e.choices) L.pending = { e: id, p: params };
    else e.run(L, r, params);
    return;
  }
}

// ── Choices ────────────────────────────────────────────────────────────────

/** The pending choice: { id, text, choices: [[value, label]] } or null. */
export function pendingView(L) {
  const p = L.pending;
  if (!p) return null;
  if (p.e === 'uni') {
    return {
      id: 'uni', text: t(L.lang, 'ev.uni'),
      choices: [...Object.keys(MAJORS).map((m) => [m, label(L, MAJORS[m])]), ['no', t(L.lang, 'ev.uni.no')]],
    };
  }
  if (p.e === 'date') {
    return { id: 'date', text: t(L.lang, 'ev.date', { name: p.p.n, age: p.p.a, looks: p.p.lk }), choices: [['yes', t(L.lang, 'ev.date.yes')], ['no', t(L.lang, 'ev.date.no')]] };
  }
  const e = EVENTS[p.e];
  return { id: p.e, text: t(L.lang, `ev.${p.e}`, { cur: L.cur, ...p.p }), choices: e.choices.map((c) => [c, t(L.lang, `ev.${p.e}.${c}`)]) };
}

/** Answers the pending choice. */
export function choose(L, value, r) {
  const p = L.pending;
  if (!p) throw new LifeError('err.no_pending');
  if (p.e === 'uni') {
    L.pending = null;
    if (value !== 'no') {
      if (!MAJORS[value]) throw new LifeError('err.bad_choice');
      enroll(L, 'uni', value, r);
    } else note(L, 'log.no_uni');
    return;
  }
  if (p.e === 'date') {
    L.pending = null;
    if (value !== 'yes') {
      note(L, 'log.date_no', { name: p.p.n });
      return;
    }
    // They like you more when you look good.
    if (r() < 0.35 + (L.lk - p.p.lk) / 150 + 0.2) {
      L.rel.push({ n: p.p.n, g: p.p.g, a: p.p.a, k: 'partner', c: between(r, 55, 85), y: 0 });
      L.lovers += 1;
      stat(L, 'hp', 10);
      note(L, 'log.date_yes', { name: p.p.n });
    } else {
      stat(L, 'hp', -6);
      note(L, 'log.date_rejected', { name: p.p.n });
    }
    return;
  }
  const e = EVENTS[p.e];
  if (!e?.choices.includes(value)) throw new LifeError('err.bad_choice');
  L.pending = null;
  e.choose(L, r, value, p.p ?? {});
}

// ── School ─────────────────────────────────────────────────────────────────

/** What a grown-up can study now: [{ kind, major? }]. */
export function studyOptions(L) {
  if (L.school || L.jail || L.age < 18) return [];
  const out = [];
  if (!hasDegree(L, 'high')) out.push({ kind: 'ged' });
  else if (!hasDegree(L, 'uni')) for (const m of Object.keys(MAJORS)) out.push({ kind: 'uni', major: m });
  else {
    const major = uniMajor(L);
    for (const [kind, g] of Object.entries(GRAD)) if (!hasDegree(L, kind) && (!g.majors.length || g.majors.includes(major))) out.push({ kind });
  }
  return out;
}

/** Starts a school: ged (1 year), uni (a major, 4 years), med, law, grad. */
export function enroll(L, kind, major, r) {
  ensureAlive(L);
  const ok = studyOptions(L).some((o) => o.kind === kind && (kind !== 'uni' || o.major === major));
  if (!ok && !(kind === 'uni' && L.age === 18 && hasDegree(L, 'high') && !L.school)) throw new LifeError('err.cannot_study');
  if (L.job && !JOBS[L.job.id].part) {
    note(L, 'log.quit', { job: jobName(L) });
    L.job = null;
  }
  const total = kind === 'ged' ? 1 : kind === 'uni' ? UNI_YEARS : GRAD[kind].years;
  // Young students' parents may pay; others take a loan.
  const parents = family(L, 'mother', 'father').length > 0;
  const paid = kind !== 'ged' && parents && L.age <= 25 && r() < 0.25 + L.wealth / 150;
  L.school = { kind, year: 1, total, grade: clamp(L.sm + between(r, -10, 10)), ...(major ? { major } : {}), paid };
  note(L, paid ? 'log.enrolled_paid' : 'log.enrolled', { school: schoolName(L, L.school) });
}

/** Studies harder (grade and smarts up). */
export function study(L, r) {
  ensureAlive(L);
  if (!L.school) throw new LifeError('err.no_school');
  if (!use(L, 'study')) throw new LifeError('err.enough');
  L.school.grade = clamp(L.school.grade + between(r, 3, 8));
  stat(L, 'sm', between(r, 1, 3));
  stat(L, 'hp', -1);
  note(L, 'log.study', { grade: L.school.grade });
}

/** Leaves school (from age 16). */
export function dropOut(L) {
  ensureAlive(L);
  if (!L.school) throw new LifeError('err.no_school');
  if (L.age < 16) throw new LifeError('err.too_young_dropout');
  note(L, 'log.dropout', { school: schoolName(L, L.school) });
  L.school = null;
}

// ── Work ───────────────────────────────────────────────────────────────────

/** Why a job is out of reach, or null. */
export function jobProblem(L, id) {
  const j = JOBS[id];
  if (!j) return 'err.bad_choice';
  if (L.age < j.minAge) return 'job.no.age';
  if (j.maxAge && L.age > j.maxAge) return 'job.no.old';
  if (L.school && !j.part) return 'job.no.school';
  if (!L.school && j.part && L.age >= 18) return 'job.no.part';
  if (j.edu === 'high' && !hasDegree(L, 'high')) return 'job.no.edu';
  if (j.edu === 'uni' && !(j.majors ? j.majors.some((m) => L.degrees.includes(`uni:${m}`)) : hasDegree(L, 'uni'))) return 'job.no.edu';
  if (['med', 'law', 'grad'].includes(j.edu) && !hasDegree(L, j.edu)) return 'job.no.edu';
  if (j.edu === 'grad' && j.majors && !j.majors.includes(uniMajor(L))) return 'job.no.edu';
  if (j.clean && L.record > 0) return 'job.no.record';
  return null;
}

/** Jobs to apply for now. */
export const jobOffers = (L) => Object.keys(JOBS).filter((id) => !jobProblem(L, id) && L.job?.id !== id);

export function applyJob(L, id, r) {
  ensureAlive(L);
  if (L.jail) throw new LifeError('err.in_jail');
  const problem = jobProblem(L, id);
  if (problem) throw new LifeError(problem);
  if (!use(L, 'apply')) throw new LifeError('err.enough');
  const j = JOBS[id];
  let chance = 0.55 + (L.sm - 50) / 200;
  if (j.smarts) chance += (L.sm - j.smarts) / 60;
  if (j.looks) chance += (L.lk - j.looks) / 40;
  if (j.health) chance += (L.h - j.health) / 80;
  if (L.record) chance -= 0.15;
  if (r() < Math.max(0.05, Math.min(0.95, chance))) {
    if (L.job) note(L, 'log.quit', { job: jobName(L) });
    L.job = { id, level: 1, years: 0, perf: between(r, 40, 60) };
    stat(L, 'hp', 6);
    note(L, 'log.hired', { job: jobName(L), salary: money(L, jobSalary(L)) });
    return true;
  }
  stat(L, 'hp', -3);
  note(L, 'log.not_hired', { job: label(L, j.name) });
  return false;
}

export function workHarder(L, r) {
  ensureAlive(L);
  if (!L.job) throw new LifeError('err.no_job');
  if (!use(L, 'work')) throw new LifeError('err.enough');
  L.job.perf = clamp(L.job.perf + between(r, 5, 12));
  stat(L, 'hp', -2);
  note(L, 'log.work', { perf: L.job.perf });
}

export function askRaise(L, r) {
  ensureAlive(L);
  if (!L.job) throw new LifeError('err.no_job');
  if (!use(L, 'raise') || L.used.raise > 1) throw new LifeError('err.enough');
  if (r() < (L.job.perf - 30) / 70) {
    L.job.bonus = Math.round(((L.job.bonus ?? 0) + 0.08) * 100) / 100;
    note(L, 'log.raise', { salary: money(L, jobSalary(L)) });
  } else {
    L.job.perf = clamp(L.job.perf - 8);
    note(L, 'log.no_raise');
  }
}

export function quitJob(L) {
  ensureAlive(L);
  if (!L.job) throw new LifeError('err.no_job');
  note(L, 'log.quit', { job: jobName(L) });
  L.job = null;
}

export function retire(L) {
  ensureAlive(L);
  if (!L.job) throw new LifeError('err.no_job');
  if (L.age < RETIRE_AGE) throw new LifeError('err.too_young_retire', { age: RETIRE_AGE });
  L.pension = Math.round(jobSalary(L) * 0.45);
  note(L, 'log.retired', { pension: money(L, L.pension) });
  L.job = null;
}

// ── Activities ─────────────────────────────────────────────────────────────

/** Activities for this age. */
export const activityList = (L) => Object.keys(ACTIVITIES).filter((id) => L.age >= ACTIVITIES[id].minAge);

/** Does an activity. arg: casino bet ("100", "1000", "10000", "all"), love ("m"/"f"), emigrate (country). */
export function activity(L, id, r, arg) {
  ensureAlive(L);
  const a = ACTIVITIES[id];
  if (!a) throw new LifeError('err.bad_choice');
  if (L.jail) throw new LifeError('err.in_jail');
  if (L.age < a.minAge) throw new LifeError('err.too_young', { age: a.minAge });
  const parentsPay = L.age < 18;
  if (a.cost && !parentsPay && L.money < a.cost) throw new LifeError('err.money', { amount: money(L, a.cost) });
  if (!['casino', 'lottery'].includes(id) && !use(L, id)) throw new LifeError('err.enough');
  const pay = () => {
    if (!parentsPay) L.money -= a.cost;
  };
  switch (id) {
    case 'gym': {
      const h = between(r, 2, 6);
      stat(L, 'h', h);
      stat(L, 'lk', between(r, 0, 2));
      stat(L, 'hp', between(r, 1, 3));
      if (r() < 0.02) {
        stat(L, 'h', -10);
        note(L, 'log.gym_hurt');
      } else note(L, 'log.gym', { n: h });
      return;
    }
    case 'library': {
      const s = between(r, 2, 5);
      stat(L, 'sm', s);
      if (L.school) L.school.grade = clamp(L.school.grade + between(r, 1, 4));
      note(L, 'log.library', { n: s });
      return;
    }
    case 'meditate':
      stat(L, 'hp', between(r, 3, 8));
      stat(L, 'h', between(r, 0, 2));
      note(L, 'log.meditate');
      return;
    case 'doctor': {
      pay();
      stat(L, 'h', between(r, 3, 8));
      const id2 = L.ill[0];
      if (!id2) note(L, 'log.doctor_ok');
      else if (!ILLNESSES[id2].hard || r() < 0.4) {
        L.ill.shift();
        note(L, 'log.doctor_cured', { ill: label(L, ILLNESSES[id2].name) });
      } else note(L, 'log.doctor_failed', { ill: label(L, ILLNESSES[id2].name) });
      return;
    }
    case 'friend': {
      if (L.rel.length >= MAX_REL) throw new LifeError('err.full');
      const f = person(r, L, 'friend', { age: Math.max(4, L.age + between(r, -2, 2)), close: between(r, 40, 70) });
      L.rel.push(f);
      stat(L, 'hp', 4);
      note(L, 'log.friend', { name: f.n });
      return;
    }
    case 'love': {
      if (partner(L)) throw new LifeError('err.has_partner');
      if (L.rel.length >= MAX_REL) throw new LifeError('err.full');
      const g = arg === 'm' || arg === 'f' ? arg : L.gender === 'm' ? 'f' : 'm';
      const min = Math.max(16, Math.floor(L.age / 2) + 7);
      const p = person(r, L, 'partner', { gender: g, age: Math.max(min, L.age + between(r, -6, 6)) });
      L.pending = { e: 'date', p: { n: p.n, g, a: p.a, lk: between(r, 15, 100) } };
      return;
    }
    case 'vacation':
      pay();
      stat(L, 'hp', between(r, 10, 20));
      stat(L, 'h', 2);
      note(L, 'log.vacation', { amount: money(L, a.cost) });
      return;
    case 'surgery':
      pay();
      if (r() < 0.85) {
        const n = between(r, 8, 20);
        stat(L, 'lk', n);
        note(L, 'log.surgery', { n });
      } else {
        stat(L, 'lk', -between(r, 10, 20));
        stat(L, 'h', -5);
        stat(L, 'hp', -10);
        note(L, 'log.surgery_bad');
      }
      return;
    case 'casino': {
      const bet = arg === 'all' ? L.money : Number(arg);
      if (![100, 1_000, 10_000].includes(bet) && arg !== 'all') throw new LifeError('err.bad_choice');
      if (bet <= 0 || L.money < bet) throw new LifeError('err.money', { amount: money(L, Math.max(bet, 1)) });
      if (!use(L, 'casino') || L.used.casino > 5) throw new LifeError('err.enough');
      if (r() < 0.47) {
        L.money += bet;
        stat(L, 'hp', 6);
        note(L, 'log.casino_win', { amount: money(L, bet) });
      } else {
        L.money -= bet;
        stat(L, 'hp', -6);
        note(L, 'log.casino_lose', { amount: money(L, bet) });
      }
      return;
    }
    case 'lottery': {
      if (!use(L, 'lottery') || L.used.lottery > 5) throw new LifeError('err.enough');
      pay();
      const x = r();
      if (x < 1 / 200_000) {
        L.money += 10_000_000;
        stat(L, 'hp', 40);
        note(L, 'log.lottery_jackpot', { amount: money(L, 10_000_000) });
      } else if (x < 1 / 2_000) {
        L.money += 1_000;
        note(L, 'log.lottery_win', { amount: money(L, 1_000) });
      } else if (x < 1 / 50) {
        L.money += 20;
        note(L, 'log.lottery_win', { amount: money(L, 20) });
      } else note(L, 'log.lottery_lose');
      return;
    }
    case 'emigrate': {
      if (!COUNTRIES[arg] || arg === L.country) throw new LifeError('err.bad_choice');
      pay();
      L.country = arg;
      stat(L, 'hp', 5);
      note(L, 'log.emigrate', { country: label(L, COUNTRIES[arg].name), flag: COUNTRIES[arg].flag });
      return;
    }
    default:
      throw new LifeError('err.bad_choice');
  }
}

// ── Crime and prison ───────────────────────────────────────────────────────

export const crimeList = (L) => Object.keys(CRIMES).filter((id) => L.age >= CRIMES[id].minAge);

export function crime(L, id, r) {
  ensureAlive(L);
  const c = CRIMES[id];
  if (!c) throw new LifeError('err.bad_choice');
  if (L.jail) throw new LifeError('err.in_jail');
  if (L.age < c.minAge) throw new LifeError('err.too_young', { age: c.minAge });
  if (!use(L, 'crime') || L.used.crime > 2) throw new LifeError('err.enough');
  L.karma = clamp(L.karma - 8);
  if (r() < c.caught) {
    const years = L.age < 18 ? 0 : between(r, c.years[0], c.years[1]);
    L.record += 1;
    stat(L, 'hp', -15);
    if (years > 0) {
      if (L.job) note(L, 'log.fired', { job: jobName(L) });
      L.job = null;
      L.school = null;
      L.jail = { left: years, total: years };
      note(L, 'log.caught_jail', { crime: label(L, c.name), years });
    } else {
      const fine = Math.min(Math.max(0, L.money), between(r, 100, 1_000));
      L.money -= fine;
      note(L, 'log.caught_fine', { crime: label(L, c.name), amount: money(L, fine) });
    }
    return false;
  }
  const loot = between(r, c.loot[0], c.loot[1]);
  L.money += loot;
  stat(L, 'hp', 3);
  note(L, 'log.crime_ok', { crime: label(L, c.name), amount: money(L, loot) });
  return true;
}

/** In prison: workout, study, riot, escape. */
export function prison(L, what, r) {
  ensureAlive(L);
  if (!L.jail) throw new LifeError('err.not_in_jail');
  if (!use(L, `jail_${what}`)) throw new LifeError('err.enough');
  switch (what) {
    case 'workout':
      stat(L, 'h', between(r, 2, 5));
      note(L, 'log.jail_workout');
      return;
    case 'study':
      stat(L, 'sm', between(r, 1, 4));
      note(L, 'log.jail_study');
      return;
    case 'riot':
      L.karma = clamp(L.karma - 5);
      if (r() < 0.3) {
        L.jail.left += 1;
        stat(L, 'h', -8);
        note(L, 'log.jail_riot_bad');
      } else {
        stat(L, 'hp', 6);
        note(L, 'log.jail_riot');
      }
      return;
    case 'escape':
      if (r() < 0.15) {
        L.jail = null;
        stat(L, 'hp', 15);
        note(L, 'log.escaped');
      } else {
        L.jail.left += 2;
        note(L, 'log.escape_failed');
      }
      return;
    default:
      throw new LifeError('err.bad_choice');
  }
}

// ── People ─────────────────────────────────────────────────────────────────

/** What one can do with a person (by relation). */
export function relActions(L, p) {
  if (!p || p.d) return [];
  const out = ['time', 'talk', 'compliment', 'gift', 'argue'];
  if (['mother', 'father'].includes(p.k)) out.push('ask_money');
  if (p.k === 'partner') out.push('propose', 'breakup');
  if (p.k === 'fiance') out.push('marry', 'breakup');
  if (p.k === 'spouse') out.push('divorce');
  if (['partner', 'fiance', 'spouse'].includes(p.k)) out.push('baby');
  return out;
}

/** Does something with person i of the relationships. */
export function relation(L, i, action, r) {
  ensureAlive(L);
  const p = L.rel[i];
  if (!p || p.d) throw new LifeError('err.gone');
  if (!relActions(L, p).includes(action)) throw new LifeError('err.bad_choice');
  if (L.jail && !['talk', 'argue'].includes(action)) throw new LifeError('err.in_jail');
  if (!use(L, `rel_${i}_${action}`)) throw new LifeError('err.enough');
  const name = p.n;
  switch (action) {
    case 'time':
      p.c = clamp(p.c + between(r, 4, 10));
      stat(L, 'hp', 2);
      return note(L, 'log.rel_time', { name });
    case 'talk':
      p.c = clamp(p.c + between(r, 1, 5));
      return note(L, 'log.rel_talk', { name });
    case 'compliment':
      p.c = clamp(p.c + between(r, 2, 6));
      return note(L, 'log.rel_compliment', { name });
    case 'gift': {
      const cost = Math.min(500, Math.max(20, Math.round(Math.max(0, L.money) * 0.02)));
      if (L.money < cost) throw new LifeError('err.money', { amount: money(L, cost) });
      L.money -= cost;
      p.c = clamp(p.c + between(r, 5, 12));
      return note(L, 'log.rel_gift', { name, amount: money(L, cost) });
    }
    case 'argue':
      p.c = clamp(p.c - between(r, 5, 15));
      stat(L, 'hp', -3);
      return note(L, 'log.rel_argue', { name });
    case 'ask_money': {
      if (r() < p.c / 140) {
        const amount = Math.round(between(r, 50, 400) * (1 + L.wealth / 25));
        L.money += amount;
        p.c = clamp(p.c - 4);
        return note(L, 'log.rel_money_yes', { name, amount: money(L, amount) });
      }
      p.c = clamp(p.c - 2);
      return note(L, 'log.rel_money_no', { name });
    }
    case 'propose':
      if (p.y < 1 || r() > p.c / 110) {
        p.c = clamp(p.c - 15);
        stat(L, 'hp', -10);
        if (r() < 0.4) {
          p.k = 'ex';
          return note(L, 'log.propose_breakup', { name });
        }
        return note(L, 'log.propose_no', { name });
      }
      p.k = 'fiance';
      stat(L, 'hp', 12);
      return note(L, 'log.propose_yes', { name });
    case 'marry': {
      const cost = Math.min(Math.max(0, L.money), 15_000);
      L.money -= cost;
      p.k = 'spouse';
      L.marriages += 1;
      p.c = clamp(p.c + 10);
      stat(L, 'hp', 15);
      return note(L, 'log.married', { name, amount: money(L, cost) });
    }
    case 'breakup':
      p.k = 'ex';
      stat(L, 'hp', -8);
      return note(L, 'log.breakup', { name });
    case 'divorce': {
      const half = L.money > 0 ? Math.round(L.money / 2) : 0;
      L.money -= half;
      p.k = 'ex';
      stat(L, 'hp', -15);
      return note(L, 'log.divorce', { name, amount: money(L, half) });
    }
    case 'baby': {
      if (L.age < 18) throw new LifeError('err.too_young', { age: 18 });
      const mother = L.gender === 'f' ? L.age : p.g === 'f' ? p.a : null;
      if (L.expecting) throw new LifeError('err.expecting');
      if (mother === null || mother > 48) {
        return note(L, 'log.baby_no', { name });
      }
      if (r() < 0.45 - Math.max(0, mother - 35) / 40) {
        L.expecting = true;
        stat(L, 'hp', 8);
        return note(L, 'log.baby_yes', { name });
      }
      return note(L, 'log.baby_no', { name });
    }
    default:
      throw new LifeError('err.bad_choice');
  }
}

// ── Things ─────────────────────────────────────────────────────────────────

export function buy(L, id) {
  ensureAlive(L);
  const a = ASSETS[id];
  if (!a) throw new LifeError('err.bad_choice');
  if (L.jail) throw new LifeError('err.in_jail');
  if (L.age < 18) throw new LifeError('err.too_young', { age: 18 });
  if (L.money < a.price) throw new LifeError('err.money', { amount: money(L, a.price) });
  if (L.assets.length >= 10) throw new LifeError('err.full');
  L.money -= a.price;
  L.assets.push({ id, v: a.price });
  stat(L, 'hp', a.kind === 'house' ? 12 : 8);
  note(L, 'log.bought', { item: label(L, a.name), amount: money(L, a.price) });
}

export function sell(L, i) {
  ensureAlive(L);
  const a = L.assets[i];
  if (!a) throw new LifeError('err.gone');
  L.assets.splice(i, 1);
  L.money += a.v;
  note(L, 'log.sold', { item: label(L, ASSETS[a.id].name), amount: money(L, a.v) });
}

// ── Death and the next generation ──────────────────────────────────────────

export function die(L, cause) {
  const estate = netWorth(L);
  const kids = L.rel.filter((p) => p.k === 'child' && !p.d).length;
  const ribbon = RIBBONS.find(([id]) => {
    if (id === 'young') return L.age < 25;
    if (id === 'centenarian') return L.age >= 100;
    if (id === 'rich') return L.peak >= 5_000_000 || estate >= 5_000_000;
    if (id === 'criminal') return L.record >= 3;
    if (id === 'scholar') return ['med', 'law', 'grad'].some((d) => L.degrees.includes(d));
    if (id === 'family') return kids >= 4;
    if (id === 'lover') return L.lovers >= 6 || L.marriages >= 3;
    if (id === 'happy') return L.hp >= 85;
    if (id === 'healthy') return L.h >= 80 && L.age >= 60;
    return true;
  })[0];
  L.dead = { age: L.age, cause, ribbon, estate };
  L.pending = null;
  note(L, 'log.died', { age: L.age, cause: t(L.lang, cause) });
}

/** The children one can continue as. */
export const heirs = (L) => L.rel.map((p, i) => ({ p, i })).filter(({ p }) => p.k === 'child' && !p.d);

/** Continues as child i of a dead life: the estate is shared by the living children. */
export function continueAs(L, i, r) {
  if (!L.dead) throw new LifeError('err.alive');
  const kids = heirs(L);
  const kid = kids.find((k) => k.i === i)?.p;
  if (!kid) throw new LifeError('err.gone');
  const share = Math.max(0, Math.round(L.dead.estate / kids.length));
  const other = L.rel.find((p) => !p.d && ['spouse', 'partner', 'fiance', 'ex'].includes(p.k));
  const fam = [{ n: `${L.first} ${L.last}`, g: L.gender, a: L.age, k: L.gender === 'f' ? 'mother' : 'father', c: 80, d: true }];
  if (other) fam.push({ n: other.n, g: other.g, a: other.a, k: other.g === 'f' ? 'mother' : 'father', c: other.k === 'ex' ? 40 : 70 });
  for (const k of kids) if (k.p !== kid) fam.push({ n: k.p.n, g: k.p.g, a: k.p.a, k: 'sibling', c: k.p.c });
  const [first, ...rest] = kid.n.split(' ');
  const next = newLife(r, {
    lang: L.lang, cur: L.cur, gen: L.gen + 1, gender: kid.g, first, last: rest.join(' ') || L.last, country: L.country,
    age: kid.a, money: share, wealth: clamp(share / 50_000), family: fam, degrees: kid.a >= 18 ? ['high'] : [],
  });
  note(next, 'log.inherit', { amount: money(next, share), name: `${L.first} ${L.last}` });
  if (next.age >= 5 && next.age < 18) {
    const kind = next.age < 11 ? ['primary', 6, next.age - 4] : next.age < 14 ? ['middle', 3, next.age - 10] : ['high', 4, next.age - 13];
    next.school = { kind: kind[0], total: kind[1], year: kind[2], grade: clamp(next.sm) };
  }
  return next;
}
