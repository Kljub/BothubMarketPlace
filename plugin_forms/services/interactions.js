// Buttons (open the form, accept, decline) and the form modal.
import { answerMessage, formByName, loadAnswer, modalOf, openKey, saveAnswer, setting } from './forms.js';

const reply = (ctx, ev, text) => ctx.interaction.reply(ev.handle, text, { ephemeral: true });

/** Opens the form of a server for a member (button or /form). */
export async function openForm(ctx, handle, guildId, userId, name) {
  const form = formByName(ctx, guildId, name);
  if (!form) return { ok: false, text: '❌ There is no such form on this server.' };
  if (form.once && (await ctx.storage.get(openKey({ guild: guildId, form: form.name, user: userId })))) {
    return { ok: false, text: '⏳ You already sent this form; wait for the answer.' };
  }
  await ctx.interaction.showModal(handle, modalOf(form));
  return { ok: true };
}

/** May this member accept or decline (reviewer roles; none set: everyone who sees the answers channel). */
async function mayReview(ctx, guildId, userId) {
  const roles = setting(ctx, 'reviewers', []).filter((r) => r?.guild === guildId).map((r) => r.id);
  if (!roles.length) return true;
  const m = await ctx.member.get(guildId, userId).catch(() => null);
  return !!m && m.roles.some((r) => roles.includes(r));
}

async function decide(ctx, ev, status) {
  const s = await loadAnswer(ctx, ev.data);
  if (!s) return reply(ctx, ev, '❌ This answer no longer exists.');
  const form = formByName(ctx, s.guild, s.form);
  if (!form) return reply(ctx, ev, '❌ The form was removed.');
  if (!(await mayReview(ctx, s.guild, ev.user.id))) return reply(ctx, ev, '❌ Only reviewers can do this.');
  if (s.status !== 'open') return reply(ctx, ev, 'This answer was already decided.');
  s.status = status;
  s.by = ev.user.id;
  await saveAnswer(ctx, s);
  await ctx.storage.delete(openKey(s));
  let note = '';
  if (status === 'accepted' && form.accept_role?.guild === s.guild && form.accept_role.id) {
    note = await ctx.member.addRole(s.guild, s.user, form.accept_role.id, `Form ${form.name} accepted`).then(() => ` and got <@&${form.accept_role.id}>`, () => ' (the role could not be given)');
  }
  await ctx.interaction.update(ev.handle, answerMessage(form, s, ev.user.id));
  await ctx.interaction.followUp(ev.handle, `${status === 'accepted' ? '✅' : '❌'} <@${s.user}> was ${status}${note}.`, { ephemeral: true }).catch(() => undefined);
}

export const components = {
  async open(ctx, ev) {
    const res = await openForm(ctx, ev.handle, ev.guildId, ev.user.id, ev.data);
    if (!res.ok) await reply(ctx, ev, res.text);
  },
  accept: (ctx, ev) => decide(ctx, ev, 'accepted'),
  decline: (ctx, ev) => decide(ctx, ev, 'declined'),
};

export const modals = {
  async answer(ctx, ev) {
    const form = formByName(ctx, ev.guildId, ev.data);
    if (!form) return reply(ctx, ev, '❌ The form was removed.');
    const s = { id: ctx.utils.uuid().replace(/-/g, '').slice(0, 12), guild: ev.guildId, form: form.name, user: ev.user.id, answers: ev.fields ?? {}, status: form.review === false ? 'received' : 'open', at: Date.now(), message: null };
    const ping = setting(ctx, 'ping_role', null);
    const msg = answerMessage(form, s);
    if (ping?.guild === s.guild && ping.id) msg.content = `<@&${ping.id}>`;
    s.message = { channel: form.channel.id, id: await ctx.message.send(form.channel.id, msg) };
    await saveAnswer(ctx, s);
    if (form.once && form.review !== false) await ctx.storage.set(openKey(s), s.id);
    await reply(ctx, ev, '✅ Thank you! Your answers were sent.');
  },
};
