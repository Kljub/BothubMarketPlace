// Service "interactions": the buttons ("bl", data "<verb>:<arg>") and selects
// ("bls", data "<menu>") of the private panel. The panel is ephemeral, so
// only its owner clicks; the life is the clicker's on this server.
import * as E from './engine.js';
import { LifeError } from './engine.js';
import { lang, loadLife, options, rng, withLife } from './flow.js';
import { t } from './i18n.js';
import { assetsText, panel, peopleText } from './view.js';

/** The text above the panel for a view (people and assets lists, one person). */
function noteFor(L, view) {
  if (L.dead || L.pending) return '';
  if (view === 'people') return peopleText(L);
  if (view === 'assets') return assetsText(L);
  if (view.startsWith('person:')) {
    const p = L.rel[Number(view.slice(7))];
    return p && !p.d ? `${p.g === 'f' ? '👩' : '👨'} **${p.n}** (${p.a}) · ${t(L.lang, `rel.${p.k}`)} · ${t(L.lang, 'ui.closeness', { n: p.c })}` : '';
  }
  return '';
}

async function run(ctx, ev, act) {
  const guild = ev.guildId;
  const user = ev.user.id;
  const opts = options(ctx);
  if (!guild) return ctx.interaction.reply(ev.handle, `❌ ${t(opts.lang, 'err.server')}`, { ephemeral: true });
  let view = 'main';
  let life = null;
  try {
    life = await withLife(ctx, guild, user, async (L) => {
      if (!L) throw new LifeError('err.no_life', { who: t(opts.lang, 'ui.none') });
      const out = await act(L, opts);
      view = out?.view ?? view;
      return out?.life ?? L;
    });
  } catch (err) {
    if (!(err instanceof LifeError)) throw err;
    const L = await loadLife(ctx, guild, user);
    const text = `❌ ${t(L?.lang ?? opts.lang, err.key, { cur: L?.cur ?? opts.cur, ...err.params })}`;
    if (!L) return ctx.interaction.update(ev.handle, { content: text, embeds: [], components: [] });
    const keep = err.keepView ?? 'main';
    return ctx.interaction.update(ev.handle, panel(L, keep, [text, noteFor(L, keep)].filter(Boolean).join('\n'), opts));
  }
  return ctx.interaction.update(ev.handle, panel(life, view, noteFor(life, view), opts));
}

/** A LifeError that keeps the panel on the current view. */
const stay = (fn, view) => async (L, opts) => {
  try {
    return await fn(L, opts);
  } catch (err) {
    if (err instanceof LifeError) err.keepView = view;
    throw err;
  }
};

function ageUp(L, opts) {
  const now = Date.now();
  if (opts.cooldown && L.lastAge && now - L.lastAge < opts.cooldown * 1000) {
    throw new LifeError('err.cooldown', { s: Math.ceil((opts.cooldown * 1000 - (now - L.lastAge)) / 1000) });
  }
  E.ageUp(L, rng());
  L.lastAge = now;
}

export const components = {
  async bl(ctx, ev) {
    const [verb, arg = ''] = String(ev.data ?? '').split(':');
    const r = rng();
    switch (verb) {
      case 'view':
        return run(ctx, ev, (L) => ({ view: arg || 'main' }));
      case 'age':
        return run(ctx, ev, (L, opts) => ageUp(L, opts));
      case 'choose':
        return run(ctx, ev, (L) => E.choose(L, arg, r));
      case 'school':
        return run(ctx, ev, stay((L) => {
          if (arg === 'study') E.study(L, r);
          else E.dropOut(L);
          return { view: 'job' };
        }, 'job'));
      case 'job':
        return run(ctx, ev, stay((L) => {
          if (arg === 'work') E.workHarder(L, r);
          else if (arg === 'raise') E.askRaise(L, r);
          else if (arg === 'quit') E.quitJob(L);
          else if (arg === 'retire') E.retire(L);
          return { view: 'job' };
        }, 'job'));
      case 'jail':
        return run(ctx, ev, (L) => E.prison(L, arg, r));
      case 'act': {
        const [id, extra] = arg.split('|');
        return run(ctx, ev, stay((L) => {
          E.activity(L, id, r, extra);
          return { view: id === 'casino' ? 'casino' : 'main' };
        }, id === 'casino' ? 'casino' : 'activities'));
      }
      case 'rel': {
        const [i, action] = arg.split('|');
        return run(ctx, ev, stay((L) => {
          E.relation(L, Number(i), action, r);
          return { view: L.rel[Number(i)]?.d || ['breakup', 'divorce'].includes(action) ? 'people' : `person:${i}` };
        }, `person:${i}`));
      }
      case 'new':
        return run(ctx, ev, (L, opts) => ({ life: E.newLife(r, { lang: opts.lang, cur: opts.cur }) }));
      default:
        return ctx.interaction.reply(ev.handle, `❌ ${t(lang(ctx), 'err.bad_choice')}`, { ephemeral: true });
    }
  },

  async bls(ctx, ev) {
    const menu = String(ev.data ?? '');
    const value = String(ev.values?.[0] ?? '');
    const r = rng();
    switch (menu) {
      case 'choose':
        return run(ctx, ev, (L) => E.choose(L, value, r));
      case 'apply':
        return run(ctx, ev, stay((L) => {
          E.applyJob(L, value, r);
          return { view: 'job' };
        }, 'job'));
      case 'enroll': {
        const [kind, major] = value.split(':');
        return run(ctx, ev, stay((L) => {
          E.enroll(L, kind, major, r);
          return { view: 'job' };
        }, 'job'));
      }
      case 'activity':
        if (['casino', 'love', 'emigrate'].includes(value)) {
          return run(ctx, ev, stay((L) => {
            if (L.age < (value === 'love' ? 16 : 18)) throw new LifeError('err.too_young', { age: value === 'love' ? 16 : 18 });
            return { view: value };
          }, 'activities'));
        }
        return run(ctx, ev, stay((L) => {
          E.activity(L, value, r);
          return { view: 'activities' };
        }, 'activities'));
      case 'emigrate':
        return run(ctx, ev, stay((L) => E.activity(L, 'emigrate', r, value), 'emigrate'));
      case 'person':
        return run(ctx, ev, () => ({ view: `person:${value}` }));
      case 'buy':
        return run(ctx, ev, stay((L) => {
          E.buy(L, value);
          return { view: 'assets' };
        }, 'assets'));
      case 'sell':
        return run(ctx, ev, stay((L) => {
          E.sell(L, Number(value));
          return { view: 'assets' };
        }, 'assets'));
      case 'crime':
        return run(ctx, ev, stay((L, opts) => {
          if (!opts.crime) throw new LifeError('err.bad_choice');
          E.crime(L, value, r);
        }, 'crime'));
      case 'heir':
        return run(ctx, ev, (L) => ({ life: E.continueAs(L, Number(value), r) }));
      default:
        return ctx.interaction.reply(ev.handle, `❌ ${t(lang(ctx), 'err.bad_choice')}`, { ephemeral: true });
    }
  },
};
