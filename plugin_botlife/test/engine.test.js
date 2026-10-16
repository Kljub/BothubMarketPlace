import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../services/engine.js';

/** A fixed random source: the same numbers every run. */
function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const always = (v) => () => v;
/** A grown-up without surprises: healthy, no events (r high), no family deaths. */
const adult = (patch = {}) => Object.assign(E.newLife(seeded(3), { lang: 'en', gender: 'f', first: 'Ann', country: 'de' }), { age: 22, h: 90, hp: 70, sm: 80, lk: 60, log: [] }, patch);

test('a new life: parents, a name, a log line; school starts at 5', () => {
  const L = E.newLife(seeded(1), { lang: 'de', cur: '€', gender: 'm', first: 'Max', country: 'de' });
  assert.equal(L.first, 'Max');
  assert.equal(L.cur, '€');
  assert.deepEqual(L.rel.slice(0, 2).map((p) => p.k), ['mother', 'father']);
  assert.match(L.log[0][1], /Max .* wurde in 🇩🇪 Deutschland geboren/);
  for (let i = 0; i < 5; i++) {
    L.pending = null;
    E.ageUp(L, always(0.99));
  }
  assert.equal(L.age, 5);
  assert.equal(L.school.kind, 'primary');
});

test('school to 18: diploma, then the university question; a major starts university', () => {
  const L = adult({ age: 17, school: { kind: 'high', year: 4, total: 4, grade: 80 }, degrees: [] });
  E.ageUp(L, always(0.99));
  assert.deepEqual(L.degrees, ['high']);
  assert.equal(L.pending.e, 'uni');
  assert.throws(() => E.ageUp(L, always(0.99)), /err.pending/);
  const q = E.pendingView(L);
  assert.equal(q.choices.length, 9, '8 majors and "no"');
  E.choose(L, 'cs', always(0));
  assert.equal(L.school.kind, 'uni');
  assert.equal(L.school.major, 'cs');
  for (let i = 0; i < 4; i++) E.ageUp(L, always(0.99));
  assert.ok(L.degrees.includes('uni:cs'));
  assert.equal(L.school, null);
});

test('jobs: requirements, hiring, salary after tax and living costs, promotion', () => {
  const L = adult({ age: 26, degrees: ['high', 'uni:cs'] });
  assert.equal(E.jobProblem(L, 'doctor'), 'job.no.edu');
  assert.equal(E.jobProblem(L, 'fastfood'), 'job.no.part');
  assert.ok(E.jobOffers(L).includes('software'));
  assert.equal(E.applyJob(L, 'software', always(0)), true);
  assert.equal(E.jobSalary(L), 95_000);
  const before = L.money;
  L.rel = [];
  E.ageUp(L, always(0.99));
  assert.equal(L.money - before, Math.round(95_000 * 0.75) - 9_000);
  L.job.perf = 90;
  L.job.years = 3;
  E.ageUp(L, always(0.1));
  assert.equal(L.job.level, 2);
});

test('crime: caught means prison; prison years pass; escape may fail', () => {
  const L = adult({ job: { id: 'janitor', level: 1, years: 1, perf: 50 } });
  E.crime(L, 'burglary', always(0));
  assert.ok(L.jail?.left >= 1);
  assert.equal(L.job, null, 'fired');
  assert.equal(L.record, 1);
  assert.throws(() => E.activity(L, 'gym', always(0)), /err.in_jail/);
  const left = L.jail.left;
  E.prison(L, 'escape', always(0.9));
  assert.equal(L.jail.left, left + 2);
  L.jail.left = 1;
  E.ageUp(L, always(0.99));
  assert.equal(L.jail, null);
  assert.equal(E.jobProblem(L, 'police'), 'job.no.edu');
  L.degrees.push('high');
  assert.equal(E.jobProblem(L, 'police'), 'job.no.record');
});

test('love: a date, a proposal, a wedding, a baby, then the next generation', () => {
  const L = adult({ money: 50_000, rel: [] });
  E.activity(L, 'love', always(0.5), 'm');
  assert.equal(L.pending.e, 'date');
  E.choose(L, 'yes', always(0));
  const i = L.rel.findIndex((p) => p.k === 'partner');
  assert.ok(i >= 0);
  L.rel[i].y = 2;
  L.rel[i].c = 100;
  E.relation(L, i, 'propose', always(0));
  assert.equal(L.rel[i].k, 'fiance');
  E.relation(L, i, 'marry', always(0));
  assert.equal(L.rel[i].k, 'spouse');
  assert.equal(L.money, 35_000, 'the wedding cost 15,000');
  E.relation(L, i, 'baby', always(0));
  assert.equal(L.expecting, true);
  E.ageUp(L, always(0.99));
  const kid = L.rel.find((p) => p.k === 'child');
  assert.ok(kid);
  E.die(L, 'cause.age');
  assert.equal(L.dead.age, 23);
  assert.throws(() => E.ageUp(L, always(0.99)), /err.dead/);
  const next = E.continueAs(L, E.heirs(L)[0].i, always(0.5));
  assert.equal(next.gen, 2);
  assert.equal(`${next.first} ${next.last}`, kid.n);
  assert.ok(next.money > 0, 'inherits the estate');
  assert.ok(next.rel.some((p) => p.k === 'mother' && p.d), 'the parent who died');
});

test('activities: limits per year, money, casino, doctor', () => {
  const L = adult({ money: 1_000, ill: ['flu'] });
  E.activity(L, 'doctor', always(0));
  assert.deepEqual(L.ill, []);
  assert.equal(L.money, 700);
  for (let i = 0; i < 3; i++) E.activity(L, 'gym', always(0.5));
  assert.throws(() => E.activity(L, 'gym', always(0.5)), /err.enough/);
  assert.throws(() => E.activity(L, 'vacation', always(0.5)), /err.money/);
  E.activity(L, 'casino', always(0), '100');
  assert.equal(L.money, 800);
  E.activity(L, 'casino', always(0.9), 'all');
  assert.equal(L.money, 0);
  const kid = adult({ age: 8, money: 0, ill: ['flu'] });
  E.activity(kid, 'doctor', always(0));
  assert.equal(kid.money, 0, 'parents pay for children');
  assert.throws(() => E.activity(kid, 'casino', always(0), '100'), /err.too_young/);
});

test('assets: buy, value changes each year, sell', () => {
  const L = adult({ money: 200_000, rel: [] });
  E.buy(L, 'studio');
  E.buy(L, 'compact');
  assert.equal(L.money, 28_000);
  assert.throws(() => E.buy(L, 'mansion'), /err.money/);
  E.ageUp(L, always(0.99));
  assert.equal(L.assets[1].v, Math.round(22_000 * 0.88), 'cars lose value');
  E.sell(L, 1);
  assert.equal(L.assets.length, 1);
});

test('mortality grows with age and bad health', () => {
  assert.ok(E.mortality(20, 90) < 0.002);
  assert.ok(E.mortality(85, 90) > E.mortality(70, 90));
  assert.ok(E.mortality(70, 10) > E.mortality(70, 90) * 2);
  assert.equal(E.mortality(40, 0), 1);
});
