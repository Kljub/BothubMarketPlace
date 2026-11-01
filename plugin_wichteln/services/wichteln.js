// Service "wichteln": the state of a Wichteln round, the draw and the texts.
// A round lives in storage "event:<id>" = { id, guild, host, title, budget,
// date, members: [id], names: {id: name}, wishes: {id: text},
// addresses: {id: text}, drawn, cancelled, pairs: {giver: receiver},
// pending: [giver], failed: [giver], updated: [giver], rerolled: [giver],
// drawnAt, ui, at }
// "updated": givers whose next DM is a change (new address or wish list).
// "rerolled": givers whose next DM is the name of a new draw.
// "ui": the version of the buttons in the round's message.
// and in the list "events" (task "cleanup" removes old rounds).
import { readJson, setting, writeJson } from './util.js';

export const MIN_MEMBERS = 3;
export const MAX_MEMBERS = 100;
export const MAX_WISH = 300;
export const MAX_ADDRESS = 300;
// A new draw sends a DM to everybody, so it waits this long after the last draw.
export const REROLL_WAIT_MS = 60 * 1000;
// Raise this when the buttons after the draw change: a drawn round gets the
// new buttons with the next click on "Who do I give to?".
export const UI = 2;
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
    drawn: 'Die Namen sind gezogen! Jeder hat per DM bekommen, wen er beschenkt. Keine DM bekommen? Klick auf **Wen beschenke ich?**. Adresse oder Wunschzettel geändert? Dein Wichtel bekommt die Änderung per DM.',
    cancelled: 'Dieses Wichteln wurde abgebrochen.',
    join: 'Teilnehmen',
    leave: 'Austreten',
    wish: 'Wunschzettel',
    address: 'Adresse',
    draw: 'Auslosen',
    reroll: 'Neu auslosen',
    reroll_ask: '⚠️ Wirklich neu auslosen? Alle {count} Teilnehmer bekommen per DM einen neuen Namen, der alte gilt nicht mehr. Wunschzettel und Adressen bleiben.',
    reroll_yes: 'Ja, neu auslosen',
    reroll_done: '🎲 Neu ausgelost. Alle bekommen ihren neuen Namen per DM.',
    reroll_wait: '⏳ Die Namen wurden gerade erst gezogen. Versuch es in einer Minute noch einmal.',
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
    wish_sent: '✅ Wunschzettel geändert. Dein Wichtel bekommt die Änderung per DM.',
    address_title: 'Deine Adresse',
    address_label: 'Wohin soll das Geschenk?',
    address_placeholder: 'Name, Straße, PLZ, Ort (nur dein Wichtel sieht sie)',
    address_saved: '✅ Adresse gespeichert. Nur dein Wichtel bekommt sie, mit der Auslosung.',
    address_sent: '✅ Adresse geändert. Dein Wichtel bekommt die neue Adresse per DM.',
    address_removed: '✅ Adresse gelöscht.',
    dm_title: '🎁 Wichteln: {title}',
    dm_text: 'Du beschenkst **{name}**!',
    dm_wish: 'Wunschzettel',
    dm_no_wish: '{name} hat keinen Wunschzettel geschrieben.',
    dm_address: 'Adresse',
    dm_rerolled: '🎲 **Es wurde neu ausgelost!** Dein alter Name gilt nicht mehr.',
    dm_updated: '✏️ **{name}** hat Adresse oder Wunschzettel geändert. Hier der aktuelle Stand:',
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
    drawn: 'The names are drawn! Everybody got a DM with whom they give a present. No DM? Click **Who do I give to?**. Changed your address or wish list? Your Secret Santa gets the change by DM.',
    cancelled: 'This Secret Santa was cancelled.',
    join: 'Join',
    leave: 'Leave',
    wish: 'Wish list',
    address: 'Address',
    draw: 'Draw names',
    reroll: 'Draw again',
    reroll_ask: '⚠️ Really draw again? All {count} members get a new name by DM, the old one no longer counts. Wish lists and addresses stay.',
    reroll_yes: 'Yes, draw again',
    reroll_done: '🎲 Drawn again. Everybody gets their new name by DM.',
    reroll_wait: '⏳ The names were drawn just now. Try again in a minute.',
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
    wish_sent: '✅ Wish list changed. Your Secret Santa gets the change by DM.',
    address_title: 'Your address',
    address_label: 'Where should the present go?',
    address_placeholder: 'Name, street, postcode, city (only your Secret Santa sees it)',
    address_saved: '✅ Address saved. Only your Secret Santa gets it, with the draw.',
    address_sent: '✅ Address changed. Your Secret Santa gets the new address by DM.',
    address_removed: '✅ Address removed.',
    dm_title: '🎁 Secret Santa: {title}',
    dm_text: 'You give a present to **{name}**!',
    dm_wish: 'Wish list',
    dm_no_wish: '{name} wrote no wish list.',
    dm_address: 'Address',
    dm_rerolled: '🎲 **The names were drawn again!** Your old name no longer counts.',
    dm_updated: '✏️ **{name}** changed their address or wish list. This is the current state:',
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

const shuffled = (items, random) => {
  const order = [...items];
  for (let i = order.length - 1; i > 0; i--) {
    const j = random(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
};

// Shuffles until a result fits, so every allowed result is equally likely.
// From 3 members at least 1 in 12 fits; the search below is only a safety net.
const DRAW_TRIES = 1000;

function assign(members, banned, random) {
  const allowed = (giver, receiver) => giver !== receiver && banned[giver] !== receiver;
  for (let i = 0; i < DRAW_TRIES; i++) {
    const order = shuffled(members, random);
    if (members.every((giver, k) => allowed(giver, order[k]))) {
      return Object.fromEntries(members.map((giver, k) => [giver, order[k]]));
    }
  }
  const pairs = {};
  const used = new Set();
  const place = (k) => {
    if (k === members.length) return true;
    for (const receiver of shuffled(members, random)) {
      if (used.has(receiver) || !allowed(members[k], receiver)) continue;
      used.add(receiver);
      pairs[members[k]] = receiver;
      if (place(k + 1)) return true;
      used.delete(receiver);
    }
    return false;
  };
  place(0);
  return pairs;
}

/**
 * Gives each member another member: nobody draws themselves, and everybody
 * gets exactly one present. Any such result is equally likely, so two members
 * can draw each other and knowing one pair tells nothing about the others.
 */
export function drawPairs(members, random) {
  return assign(members, {}, random);
}

/** A new draw where nobody keeps their old receiver either. */
export function rerollPairs(members, old, random) {
  return assign(members, old, random);
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
      ? [[
          { key: 'reveal', data: e.id, label: t(ctx, 'reveal'), emoji: '🎁', style: 'primary' },
          { key: 'address', data: e.id, label: t(ctx, 'address'), emoji: '📮', style: 'secondary' },
          { key: 'wish', data: e.id, label: t(ctx, 'wish'), emoji: '📝', style: 'secondary' },
          { key: 'reroll', data: e.id, label: t(ctx, 'reroll'), emoji: '🎲', style: 'danger' },
        ]]
      : [
          [
            { key: 'join', data: e.id, label: t(ctx, 'join'), emoji: '✅', style: 'success' },
            { key: 'leave', data: e.id, label: t(ctx, 'leave'), style: 'secondary' },
            { key: 'wish', data: e.id, label: t(ctx, 'wish'), emoji: '📝', style: 'secondary' },
            { key: 'address', data: e.id, label: t(ctx, 'address'), emoji: '📮', style: 'secondary' },
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
  const address = e.addresses?.[receiver];
  if (address) fields.push({ name: t(ctx, 'dm_address'), value: address });
  const head = e.rerolled?.includes(giver)
    ? `${t(ctx, 'dm_rerolled')}\n\n`
    : e.updated?.includes(giver) ? `${t(ctx, 'dm_updated', { name })}\n\n` : '';
  return {
    embeds: [{
      color: color(ctx),
      title: e.title ? t(ctx, 'dm_title', { title: e.title }) : t(ctx, 'title'),
      description: `${head}${t(ctx, 'dm_text', { name: `${name} (<@${receiver}>)` })}\n\n${t(ctx, 'dm_secret')}`,
      fields,
    }],
  };
}

/** The member who gives a present to this member, or null. */
export const giverOf = (e, receiver) => Object.keys(e.pairs ?? {}).find((giver) => e.pairs[giver] === receiver) ?? null;

/**
 * After the draw: the giver of this member gets the current address and wish
 * list again, marked as a change. A DM still pending goes out with the new
 * state anyway and needs no mark.
 */
export async function sendChange(ctx, e, receiver) {
  const giver = giverOf(e, receiver);
  if (!giver) return;
  if (!e.pending.includes(giver)) {
    e.updated = [...new Set([...(e.updated ?? []), giver])];
    e.pending.push(giver);
  }
  await deliver(ctx, e, 3000);
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
    if (e.updated) e.updated = e.updated.filter((id) => id !== giver);
    if (e.rerolled) e.rerolled = e.rerolled.filter((id) => id !== giver);
  }
  await saveEvent(ctx, e);
  return e;
}
