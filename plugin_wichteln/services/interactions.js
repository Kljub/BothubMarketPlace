// Buttons of a round: join, leave, wish list and address (members), draw and
// cancel (only the member who started it), and after the draw "Who do I
// give to?" (shows the own name privately, for closed DMs). Wish list and
// address stay open after the draw: the giver gets the change by DM.
import { deliver, drawPairs, eventMessage, getEvent, locked, MAX_ADDRESS, MAX_MEMBERS, MAX_WISH, MIN_MEMBERS, removeEvent, saveEvent, sendChange, t } from './wichteln.js';

const say = (ctx, ev, text) => ctx.interaction.reply(ev.handle, text, { ephemeral: true });

/** The round of the click, or null after the answer "over". */
async function eventOf(ctx, ev) {
  const e = await getEvent(ctx, ev.data);
  if (!e || e.cancelled || e.guild !== ev.guildId) {
    await say(ctx, ev, t(ctx, 'over'));
    return null;
  }
  return e;
}

const handlers = {
  async join(ctx, ev) {
    const e = await eventOf(ctx, ev);
    if (!e) return;
    if (e.drawn) return say(ctx, ev, t(ctx, 'closed'));
    if (e.members.includes(ev.user.id)) return say(ctx, ev, t(ctx, 'already'));
    if (e.members.length >= MAX_MEMBERS) return say(ctx, ev, t(ctx, 'full', { max: MAX_MEMBERS }));
    e.members.push(ev.user.id);
    e.names[ev.user.id] = String(ev.user.displayName || ev.user.name || ev.user.id).slice(0, 64);
    await saveEvent(ctx, e);
    await ctx.interaction.update(ev.handle, eventMessage(ctx, e));
  },

  async leave(ctx, ev) {
    const e = await eventOf(ctx, ev);
    if (!e) return;
    if (e.drawn) return say(ctx, ev, t(ctx, 'closed'));
    if (!e.members.includes(ev.user.id)) return say(ctx, ev, t(ctx, 'not_member'));
    if (ev.user.id === e.host) return say(ctx, ev, t(ctx, 'host_stays'));
    e.members = e.members.filter((id) => id !== ev.user.id);
    delete e.names[ev.user.id];
    delete e.wishes[ev.user.id];
    if (e.addresses) delete e.addresses[ev.user.id];
    await saveEvent(ctx, e);
    await ctx.interaction.update(ev.handle, eventMessage(ctx, e));
  },

  async wish(ctx, ev) {
    const e = await eventOf(ctx, ev);
    if (!e) return;
    if (!e.members.includes(ev.user.id)) return say(ctx, ev, t(ctx, 'not_member'));
    await ctx.interaction.showModal(ev.handle, {
      key: 'wish', data: e.id, title: t(ctx, 'wish_title'),
      fields: [{ key: 'wish', label: t(ctx, 'wish_label'), style: 'long', required: false, max: MAX_WISH, value: e.wishes[ev.user.id] ?? '', placeholder: t(ctx, 'wish_placeholder') }],
    });
  },

  async address(ctx, ev) {
    const e = await eventOf(ctx, ev);
    if (!e) return;
    if (!e.members.includes(ev.user.id)) return say(ctx, ev, t(ctx, 'not_member'));
    await ctx.interaction.showModal(ev.handle, {
      key: 'address', data: e.id, title: t(ctx, 'address_title'),
      fields: [{ key: 'address', label: t(ctx, 'address_label'), style: 'long', required: false, max: MAX_ADDRESS, value: e.addresses?.[ev.user.id] ?? '', placeholder: t(ctx, 'address_placeholder') }],
    });
  },

  async draw(ctx, ev) {
    const e = await eventOf(ctx, ev);
    if (!e) return;
    if (ev.user.id !== e.host) return say(ctx, ev, t(ctx, 'host_only', { host: `<@${e.host}>` }));
    if (e.drawn) return say(ctx, ev, t(ctx, 'closed'));
    if (e.members.length < MIN_MEMBERS) return say(ctx, ev, t(ctx, 'too_few', { min: MIN_MEMBERS }));
    e.pairs = drawPairs(e.members, (min, max) => ctx.utils.random(min, max));
    e.drawn = true;
    e.pending = [...e.members];
    e.failed = [];
    await saveEvent(ctx, e);
    await ctx.interaction.update(ev.handle, eventMessage(ctx, e));
    await deliver(ctx, e);
    // Closed DMs: the host learns it now; DMs the task sends later are not reported here.
    if (e.failed.length) await ctx.interaction.followUp(ev.handle, t(ctx, 'no_dm', { list: e.failed.map((id) => `<@${id}>`).join(', ') }), { ephemeral: true });
  },

  async cancel(ctx, ev) {
    const e = await eventOf(ctx, ev);
    if (!e) return;
    if (ev.user.id !== e.host) return say(ctx, ev, t(ctx, 'host_only', { host: `<@${e.host}>` }));
    e.cancelled = true;
    await ctx.interaction.update(ev.handle, eventMessage(ctx, e));
    await removeEvent(ctx, e.id);
  },

  async reveal(ctx, ev) {
    const e = await eventOf(ctx, ev);
    if (!e) return;
    const receiver = e.drawn ? e.pairs[ev.user.id] : null;
    if (!receiver) return say(ctx, ev, t(ctx, 'not_member'));
    const wish = e.wishes[receiver];
    const address = e.addresses?.[receiver];
    await say(ctx, ev, `${t(ctx, 'you_give', { name: `${e.names[receiver] ?? receiver} (<@${receiver}>)` })}${wish ? `\n📝 ${wish}` : ''}${address ? `\n📮 ${address}` : ''}`);
  },
};

/**
 * Saves one text of a member (wish list or address). After the draw the
 * giver gets the change by DM; an unchanged text sends nothing.
 */
async function saveText(ctx, ev, kind, max) {
  const e = await eventOf(ctx, ev);
  if (!e) return;
  if (!e.members.includes(ev.user.id)) return say(ctx, ev, t(ctx, 'not_member'));
  const all = kind === 'wish' ? e.wishes : (e.addresses ??= {});
  const text = String(ev.fields?.[kind] ?? '').trim().slice(0, max);
  const changed = (all[ev.user.id] ?? '') !== text;
  if (text) all[ev.user.id] = text;
  else delete all[ev.user.id];
  await saveEvent(ctx, e);
  // Answer first: the DM to the giver may take a moment.
  await say(ctx, ev, t(ctx, !text ? `${kind}_removed` : e.drawn ? `${kind}_sent` : `${kind}_saved`));
  if (e.drawn && changed) await sendChange(ctx, e, ev.user.id);
}

const modalHandlers = {
  wish: (ctx, ev) => saveText(ctx, ev, 'wish', MAX_WISH),
  address: (ctx, ev) => saveText(ctx, ev, 'address', MAX_ADDRESS),
};

// Every handler runs under the lock of its round.
const serial = (all) => Object.fromEntries(Object.entries(all).map(([key, fn]) => [key, (ctx, ev) => locked(String(ev.data), () => fn(ctx, ev))]));

export const components = serial(handlers);
export const modals = serial(modalHandlers);
