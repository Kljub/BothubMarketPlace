// Service "wichteln": the state of a Wichteln round, the draw and the texts.
// A round lives in storage "event:<id>" = { id, guild, host, title, budget,
// date, members: [id], names: {id: name}, wishes: {id: text}, drawn,
// cancelled, pairs: {giver: receiver}, pending: [giver], failed: [giver], at }
// and in the list "events" (task "cleanup" removes old rounds).
import { readJson, setting, writeJson } from './util.js';

export const MIN_MEMBERS = 3;
export const MAX_MEMBERS = 100;
export const MAX_WISH = 300;
// Rounds are kept this long after the start (then the task removes them).
export const KEEP_MS = 90 * 24 * 60 * 60 * 1000;

const TEXT = {
  de: {
    title: '🎁 Wichteln',
    intro: 'Mach mit beim Wichteln! Klick auf **Teilnehmen**. Wenn alle dabei sind, lost {host} aus und jeder bekommt per DM, wen er beschenkt.',
    budget: 'Budget',
    date: 'Bescherung',
    members: 'Teilnehmer ({count})',
    nobody: 'Noch niemand.',
    more: '… und {count} weitere',
    drawn: 'Die Namen sind gezogen! Jeder hat per DM bekommen, wen er beschenkt. Keine DM bekommen? Klick auf **Wen beschenke ich?**.',
    cancelled: 'Dieses Wichteln wurde abgebrochen.',
    join: 'Teilnehmen',
    leave: 'Austreten',
    wish: 'Wunschzettel',
    draw: 'Auslosen',
    cancel: 'Abbrechen',
    reveal: 'Wen beschenke ich?',
    over: '⌛ Dieses Wichteln gibt es nicht mehr.',
    closed: '🔒 Die Namen sind schon gezogen.',
    full: '❌ Das Wichteln ist voll ({max} Teilnehmer).',
    already: 'ℹ️ Du bist schon dabei.',
    not_member: 'ℹ️ Du machst nicht mit.',
    host_only: '❌ Nur {host} kann das.',
    host_stays: '❌ Du hast das Wichteln gestartet und kannst nicht austreten. Brich es ab, wenn es nicht stattfindet.',
    too_few: '❌ Zum Auslosen braucht es mindestens {min} Teilnehmer.',
    wish_title: 'Dein Wunschzettel',
    wish_label: 'Was wünschst du dir?',
    wish_placeholder: 'Ideen für deinen Wichtel (optional)',
    wish_saved: '✅ Wunschzettel gespeichert. Dein Wichtel bekommt ihn mit der Auslosung.',
    wish_removed: '✅ Wunschzettel gelöscht.',
    wish_too_late: '🔒 Die Namen sind schon gezogen, der Wunschzettel ist schon verschickt.',
    dm_title: '🎁 Wichteln: {title}',
    dm_text: 'Du beschenkst **{name}**!',
    dm_wish: 'Wunschzettel',
    dm_no_wish: '{name} hat keinen Wunschzettel geschrieben.',
    dm_secret: 'Psst – nicht verraten!',
    you_give: '🎁 Du beschenkst **{name}**.',
    no_dm: '⚠️ Diese Teilnehmer haben keine DM bekommen (DMs geschlossen): {list}. Sie sehen ihren Namen über **Wen beschenke ich?**.',
    started: 'Wichteln gestartet.',
    only_server: '❌ Nur als Befehl auf einem Server.',
  },
  en: {
    title: '🎁 Secret Santa',
    intro: 'Join the Secret Santa! Click **Join**. When everyone is in, {host} draws the names and everybody gets a DM with whom they give a present.',
    budget: 'Budget',
    date: 'Gift exchange',
    members: 'Members ({count})',
    nobody: 'Nobody yet.',
    more: '… and {count} more',
    drawn: 'The names are drawn! Everybody got a DM with whom they give a present. No DM? Click **Who do I give to?**.',
    cancelled: 'This Secret Santa was cancelled.',
    join: 'Join',
    leave: 'Leave',
    wish: 'Wish list',
    draw: 'Draw names',
    cancel: 'Cancel',
    reveal: 'Who do I give to?',
    over: '⌛ This Secret Santa no longer exists.',
    closed: '🔒 The names are already drawn.',
    full: '❌ The Secret Santa is full ({max} members).',
    already: 'ℹ️ You are already in.',
    not_member: 'ℹ️ You are not in.',
    host_only: '❌ Only {host} can do this.',
    host_stays: '❌ You started the Secret Santa and cannot leave. Cancel it if it does not take place.',
    too_few: '❌ Drawing needs at least {min} members.',
    wish_title: 'Your wish list',
    wish_label: 'What would you like?',
    wish_placeholder: 'Ideas for your Secret Santa (optional)',
    wish_saved: '✅ Wish list saved. Your Secret Santa gets it with the draw.',
    wish_removed: '✅ Wish list removed.',
    wish_too_late: '🔒 The names are already drawn, the wish list was already sent.',
    dm_title: '🎁 Secret Santa: {title}',
    dm_text: 'You give a present to **{name}**!',
    dm_wish: 'Wish list',
    dm_no_wish: '{name} wrote no wish list.',
    dm_secret: 'Psst – keep it secret!',
    you_give: '🎁 You give a present to **{name}**.',
    no_dm: '⚠️ These members got no DM (DMs closed): {list}. They see their name with **Who do I give to?**.',
    started: 'Secret Santa started.',
    only_server: '❌ Only as a command on a server.',
  },
};

export function lang(ctx) {
  return setting(ctx, 'language', 'de') === 'en' ? 'en' : 'de';
}

export function t(ctx, key, params = {}) {
  const L = lang(ctx);
  const text = TEXT[L][key] ?? TEXT.en[key] ?? key;
  return String(text).replace(/\{(\w+)\}/g, (all, k) => (k in params ? String(params[k]) : all));
}

const color = (ctx) => setting(ctx, 'color', '#c0392b') || '#c0392b';

// One change at a time per round: clicks of several members arrive together,
// each reads, changes and writes the round.
const queues = new Map();
export function locked(id, fn) {
  const before = queues.get(id) ?? Promise.resolve();
  const run = before.then(fn, fn);
  const tail = run.catch(() => undefined);
  queues.set(id, tail);
  void tail.then(() => {
    if (queues.get(id) === tail) queues.delete(id);
  });
  return run;
}

const cleanId = (id) => String(id ?? '').replace(/[^a-z0-9]/g, '').slice(0, 16);

export const getEvent = (ctx, id) => readJson(ctx, `event:${cleanId(id)}`, null);
export const saveEvent = (ctx, e) => writeJson(ctx, `event:${e.id}`, e);

export async function newEvent(ctx, e) {
  await saveEvent(ctx, e);
  await writeJson(ctx, 'events', [...(await readJson(ctx, 'events', [])), e.id]);
}

export async function removeEvent(ctx, id) {
  await ctx.storage.delete(`event:${cleanId(id)}`);
  await writeJson(ctx, 'events', (await readJson(ctx, 'events', [])).filter((x) => x !== id));
}

/**
 * Gives each member another member: a shuffled circle, everybody gives to the
 * next one. Nobody draws themselves, and nobody is left without a present.
 */
export function drawPairs(members, random) {
  const order = [...members];
  for (let i = order.length - 1; i > 0; i--) {
    const j = random(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const pairs = {};
  order.forEach((giver, i) => {
    pairs[giver] = order[(i + 1) % order.length];
  });
  return pairs;
}

/** The round's message: embed plus the buttons of its state. */
export function eventMessage(ctx, e) {
  const fields = [];
  if (e.budget) fields.push({ name: t(ctx, 'budget'), value: e.budget, inline: true });
  if (e.date) fields.push({ name: t(ctx, 'date'), value: e.date, inline: true });
  const shown = e.members.slice(0, 40).map((id) => `<@${id}>`).join(', ');
  const rest = e.members.length > 40 ? `\n${t(ctx, 'more', { count: e.members.length - 40 })}` : '';
  fields.push({ name: t(ctx, 'members', { count: e.members.length }), value: e.members.length ? shown + rest : t(ctx, 'nobody') });
  const text = e.cancelled ? t(ctx, 'cancelled') : e.drawn ? t(ctx, 'drawn') : t(ctx, 'intro', { host: `<@${e.host}>` });
  const rows = e.cancelled
    ? []
    : e.drawn
      ? [[{ key: 'reveal', data: e.id, label: t(ctx, 'reveal'), emoji: '🎁', style: 'primary' }]]
      : [
          [
            { key: 'join', data: e.id, label: t(ctx, 'join'), emoji: '✅', style: 'success' },
            { key: 'leave', data: e.id, label: t(ctx, 'leave'), style: 'secondary' },
            { key: 'wish', data: e.id, label: t(ctx, 'wish'), emoji: '📝', style: 'secondary' },
          ],
          [
            { key: 'draw', data: e.id, label: t(ctx, 'draw'), emoji: '🎲', style: 'primary', disabled: e.members.length < MIN_MEMBERS },
            { key: 'cancel', data: e.id, label: t(ctx, 'cancel'), style: 'danger' },
          ],
        ];
  return {
    embeds: [{ color: e.cancelled ? '#6b7280' : color(ctx), title: e.title ? `${t(ctx, 'title')}: ${e.title}` : t(ctx, 'title'), description: text, fields }],
    components: rows,
  };
}

/** The DM of one giver: whom they give to, with the wish list. */
export function giftMessage(ctx, e, giver) {
  const receiver = e.pairs[giver];
  const name = e.names[receiver] ?? receiver;
  const fields = [];
  if (e.budget) fields.push({ name: t(ctx, 'budget'), value: e.budget, inline: true });
  if (e.date) fields.push({ name: t(ctx, 'date'), value: e.date, inline: true });
  fields.push({ name: t(ctx, 'dm_wish'), value: e.wishes[receiver] || t(ctx, 'dm_no_wish', { name }) });
  return {
    embeds: [{
      color: color(ctx),
      title: e.title ? t(ctx, 'dm_title', { title: e.title }) : t(ctx, 'title'),
      description: `${t(ctx, 'dm_text', { name: `${name} (<@${receiver}>)` })}\n\n${t(ctx, 'dm_secret')}`,
      fields,
    }],
  };
}

/**
 * Sends the DMs still pending, until the time budget is used (the rest goes
 * out with the task "deliver"). A closed DM is noted in failed.
 */
export async function deliver(ctx, e, budgetMs = 6000) {
  const until = Date.now() + budgetMs;
  while (e.pending.length && Date.now() < until) {
    const giver = e.pending[0];
    try {
      await ctx.message.dm(giver, giftMessage(ctx, e, giver));
    } catch (err) {
      const code = String(err?.code ?? err?.message ?? err);
      if (code.includes('rate_limited')) break;
      if (!e.failed.includes(giver)) e.failed.push(giver);
    }
    e.pending.shift();
  }
  await saveEvent(ctx, e);
  return e;
}
