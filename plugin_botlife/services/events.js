// Service "events": what may happen in a year. age: [from, to]; w: weight;
// if(L): only when it fits. Events with choices wait for the member
// (pending): start(L, r) picks the details, choose(L, r, choice, params)
// plays them out. Others just run(L, r). Texts: "ev.<id>" (question),
// "ev.<id>.<choice>" (button) and "log.ev_*" in services/i18n.js.
import { between, clamp, money, note, partner } from './engine.js';

const stat = (L, key, delta) => {
  L[key] = clamp(L[key] + delta);
};
const hasKind = (L, ...kinds) => L.rel.some((p) => !p.d && kinds.includes(p.k));

export const EVENTS = {
  found_money: {
    age: [6, 90], w: 1, choices: ['keep', 'return'],
    start: (L, r) => ({ amount: between(r, 5, 200) }),
    choose(L, r, c, p) {
      if (c === 'keep') {
        L.money += p.amount;
        L.karma = clamp(L.karma - 5);
        note(L, 'log.ev_found_keep', { amount: money(L, p.amount) });
      } else {
        L.karma = clamp(L.karma + 8);
        stat(L, 'hp', 3);
        note(L, 'log.ev_found_return');
      }
    },
  },
  bully: {
    age: [6, 17], w: 1.2, choices: ['fight', 'report', 'ignore'],
    choose(L, r, c) {
      if (c === 'fight') {
        if (r() < 0.5) {
          stat(L, 'hp', 8);
          note(L, 'log.ev_bully_won');
        } else {
          stat(L, 'h', -8);
          stat(L, 'hp', -5);
          note(L, 'log.ev_bully_lost');
        }
      } else if (c === 'report') {
        stat(L, 'hp', r() < 0.6 ? 4 : -4);
        note(L, 'log.ev_bully_report');
      } else {
        stat(L, 'hp', -6);
        note(L, 'log.ev_bully_ignore');
      }
    },
  },
  cigarette: {
    age: [13, 30], w: 0.8, choices: ['yes', 'no'],
    choose(L, r, c) {
      if (c === 'yes') {
        stat(L, 'h', -6);
        stat(L, 'hp', 3);
        note(L, 'log.ev_smoke_yes');
      } else {
        stat(L, 'h', 1);
        note(L, 'log.ev_smoke_no');
      }
    },
  },
  party: {
    age: [14, 35], w: 1, choices: ['go', 'stay'],
    choose(L, r, c) {
      if (c === 'go') {
        stat(L, 'hp', 8);
        if (r() < 0.25) {
          stat(L, 'h', -4);
          note(L, 'log.ev_party_hangover');
        } else note(L, 'log.ev_party_fun');
      } else {
        stat(L, 'sm', 2);
        note(L, 'log.ev_party_stay');
      }
    },
  },
  cheat_test: {
    age: [8, 30], w: 1, if: (L) => Boolean(L.school), choices: ['cheat', 'honest'],
    choose(L, r, c) {
      if (c === 'cheat') {
        L.karma = clamp(L.karma - 4);
        if (r() < 0.25) {
          L.school.grade = clamp(L.school.grade - 20);
          note(L, 'log.ev_cheat_caught');
        } else {
          L.school.grade = clamp(L.school.grade + 12);
          note(L, 'log.ev_cheat_ok');
        }
      } else {
        stat(L, 'sm', 2);
        note(L, 'log.ev_cheat_honest');
      }
    },
  },
  stranger: {
    age: [18, 90], w: 0.8, choices: ['give', 'refuse'], if: (L) => L.money >= 50,
    choose(L, r, c) {
      if (c === 'give') {
        L.money -= 50;
        L.karma = clamp(L.karma + 6);
        stat(L, 'hp', 3);
        note(L, 'log.ev_stranger_give', { amount: money(L, 50) });
      } else note(L, 'log.ev_stranger_refuse');
    },
  },
  wallet: {
    age: [12, 90], w: 0.8, choices: ['return', 'keep'],
    start: (L, r) => ({ amount: between(r, 20, 600) }),
    choose(L, r, c, p) {
      if (c === 'keep') {
        L.money += p.amount;
        L.karma = clamp(L.karma - 8);
        note(L, 'log.ev_wallet_keep', { amount: money(L, p.amount) });
      } else {
        L.karma = clamp(L.karma + 10);
        stat(L, 'hp', 5);
        note(L, 'log.ev_wallet_return');
      }
    },
  },
  pet: {
    age: [8, 75], w: 0.6, choices: ['adopt', 'no'],
    choose(L, r, c) {
      if (c === 'adopt') {
        L.money -= 200;
        stat(L, 'hp', 10);
        note(L, 'log.ev_pet_adopt');
      } else note(L, 'log.ev_pet_no');
    },
  },
  invest: {
    age: [25, 70], w: 0.6, choices: ['invest', 'no'], if: (L) => L.money >= 5_000,
    start: (L) => ({ amount: Math.max(5_000, Math.round(L.money * 0.1)) }),
    choose(L, r, c, p) {
      if (c !== 'invest') return note(L, 'log.ev_invest_no');
      if (r() < 0.4) {
        L.money += p.amount;
        stat(L, 'hp', 8);
        note(L, 'log.ev_invest_win', { amount: money(L, p.amount) });
      } else {
        L.money -= p.amount;
        stat(L, 'hp', -8);
        note(L, 'log.ev_invest_lose', { amount: money(L, p.amount) });
      }
    },
  },
  coworker: {
    age: [16, 70], w: 0.8, if: (L) => Boolean(L.job), choices: ['confront', 'ignore'],
    choose(L, r, c) {
      if (c === 'confront') {
        const ok = r() < 0.5;
        L.job.perf = clamp(L.job.perf + (ok ? 10 : -10));
        note(L, ok ? 'log.ev_coworker_won' : 'log.ev_coworker_lost');
      } else {
        stat(L, 'hp', -5);
        note(L, 'log.ev_coworker_ignore');
      }
    },
  },
  mugged: {
    age: [16, 90], w: 0.5, choices: ['fight', 'give'],
    choose(L, r, c) {
      if (c === 'fight') {
        if (r() < 0.4) {
          stat(L, 'hp', 8);
          note(L, 'log.ev_mugged_won');
        } else {
          stat(L, 'h', -15);
          note(L, 'log.ev_mugged_hurt');
        }
      } else {
        const lost = Math.min(2_000, Math.max(0, Math.round(L.money * 0.05)));
        L.money -= lost;
        stat(L, 'hp', -5);
        note(L, 'log.ev_mugged_gave', { amount: money(L, lost) });
      }
    },
  },
  sibling: {
    age: [6, 17], w: 0.6, if: (L) => hasKind(L, 'sibling'), choices: ['forgive', 'yell'],
    start: (L) => ({ name: L.rel.find((p) => !p.d && p.k === 'sibling').n }),
    choose(L, r, c, p) {
      const s = L.rel.find((x) => x.n === p.name);
      if (s) s.c = clamp(s.c + (c === 'forgive' ? 8 : -12));
      note(L, c === 'forgive' ? 'log.ev_sibling_forgive' : 'log.ev_sibling_yell', { name: p.name });
    },
  },
  cheated: {
    age: [18, 80], w: 0.4, if: (L) => Boolean(partner(L)), choices: ['forgive', 'leave'],
    start: (L) => ({ name: partner(L).n }),
    choose(L, r, c, p) {
      const q = partner(L);
      if (!q) return;
      if (c === 'forgive') {
        q.c = clamp(q.c - 15);
        stat(L, 'hp', -8);
        note(L, 'log.ev_cheated_forgive', { name: p.name });
      } else {
        q.k = 'ex';
        stat(L, 'hp', -10);
        note(L, 'log.ev_cheated_leave', { name: p.name });
      }
    },
  },
  midlife: {
    age: [40, 55], w: 0.5, choices: ['splurge', 'no'], if: (L) => L.money >= 20_000,
    choose(L, r, c) {
      if (c === 'splurge') {
        L.money -= 20_000;
        stat(L, 'hp', 12);
        note(L, 'log.ev_midlife_yes', { amount: money(L, 20_000) });
      } else {
        stat(L, 'hp', -4);
        note(L, 'log.ev_midlife_no');
      }
    },
  },
  // Things that just happen.
  lucky: {
    age: [4, 99], w: 0.5,
    run(L, r) {
      const amount = between(r, 1, 50);
      L.money += amount;
      note(L, 'log.ev_lucky', { amount: money(L, amount) });
    },
  },
  dog_bite: {
    age: [3, 80], w: 0.4,
    run(L) {
      stat(L, 'h', -6);
      note(L, 'log.ev_dog');
    },
  },
  talent: {
    age: [7, 20], w: 0.5,
    run(L, r) {
      const smart = r() < 0.5;
      stat(L, smart ? 'sm' : 'lk', between(r, 4, 9));
      note(L, smart ? 'log.ev_talent_smart' : 'log.ev_talent_looks');
    },
  },
  inheritance: {
    age: [25, 85], w: 0.15,
    run(L, r) {
      const amount = between(r, 2, 80) * 1_000;
      L.money += amount;
      stat(L, 'hp', 6);
      note(L, 'log.ev_inheritance', { amount: money(L, amount) });
    },
  },
  car_accident: {
    age: [18, 90], w: 0.3, if: (L) => L.assets.some((a) => ['used_car', 'compact', 'sedan', 'suv', 'sports', 'supercar'].includes(a.id)),
    run(L, r) {
      const car = L.assets.find((a) => ['used_car', 'compact', 'sedan', 'suv', 'sports', 'supercar'].includes(a.id));
      car.v = Math.round(car.v / 2);
      stat(L, 'h', -between(r, 8, 25));
      note(L, 'log.ev_car_accident');
    },
  },
  grandkids: {
    age: [55, 110], w: 0.6, if: (L) => L.rel.some((p) => !p.d && p.k === 'child' && p.a >= 20),
    run(L) {
      stat(L, 'hp', 8);
      note(L, 'log.ev_grandkids');
    },
  },
  scholarship: {
    age: [17, 17], w: 0.6, if: (L) => L.school?.kind === 'high' && L.school.grade >= 80,
    run(L) {
      L.wealth = 100;
      note(L, 'log.ev_scholarship');
    },
  },
};
