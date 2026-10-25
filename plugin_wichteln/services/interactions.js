// Buttons of a round: join, leave and the wish list (members), draw and
// cancel (only the member who started it), and after the draw "Who do I
// give to?" (shows the own name privately, for closed DMs).
import { deliver, drawPairs, eventMessage, getEvent, locked, MAX_MEMBERS, MAX_WISH, MIN_MEMBERS, removeEvent, saveEvent, t } from './wichteln.js';

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
    await saveEvent(ctx, e);
    await ctx.interaction.update(ev.handle, eventMessage(ctx, e));
  },

  async wish(ctx, ev) {
    const e = await eventOf(ctx, ev);
    if (!e) return;
    if (e.drawn) return say(ctx, ev, t(ctx, 'wish_too_late'));
    if (!e.members.includes(ev.user.id)) return say(ctx, ev, t(ctx, 'not_member'));
    await ctx.interaction.showModal(ev.handle, {
      key: 'wish', data: e.id, title: t(ctx, 'wish_title'),
      fields: [{ key: 'wish', label: t(ctx, 'wish_label'), style: 'long', required: false, max: MAX_WISH, value: e.wishes[ev.user.id] ?? '', placeholder: t(ctx, 'wish_placeholder') }],
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
    await say(ctx, ev, `${t(ctx, 'you_give', { name: `${e.names[receiver] ?? receiver} (<@${receiver}>)` })}${wish ? `\n📝 ${wish}` : ''}`);
  },
};

const modalHandlers = {
  async wish(ctx, ev) {
    const e = await eventOf(ctx, ev);
    if (!e) return;
    if (e.drawn) return say(ctx, ev, t(ctx, 'wish_too_late'));
    if (!e.members.includes(ev.user.id)) return say(ctx, ev, t(ctx, 'not_member'));
    const text = String(ev.fields?.wish ?? '').trim().slice(0, MAX_WISH);
    if (text) e.wishes[ev.user.id] = text;
    else delete e.wishes[ev.user.id];
    await saveEvent(ctx, e);
    await say(ctx, ev, t(ctx, text ? 'wish_saved' : 'wish_removed'));
  },
};

// Every handler runs under the lock of its round.
const serial = (all) => Object.fromEntries(Object.entries(all).map(([key, fn]) => [key, (ctx, ev) => locked(String(ev.data), () => fn(ctx, ev))]));

export const components = serial(handlers);
export const modals = serial(modalHandlers);
