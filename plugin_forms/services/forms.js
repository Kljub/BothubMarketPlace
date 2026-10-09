// Service "forms": the forms of the settings page, their questions, the
// panel with the button, the modal and the answers.
//
// A form (settings "forms"): name (what /form and the button use), title,
// questions (one per line, at most 5; "(long)" at the end gives a big text
// box, "(optional)" makes it optional), answers channel, text and button of
// the panel, review (Accept / Decline buttons), role on accept, once (one
// open answer per member).
//
// Storage: "s:<id>" = an answer { id, guild, form, user, answers, status,
// message }, "o:<guild>:<form>:<user>" = the ID of the member's open answer.
import { readJson, writeJson } from './storage.js';

export function setting(ctx, key, fallback) {
  const value = ctx.config.get(key);
  return value === undefined || value === null ? fallback : value;
}

/** The forms of a server (their answers channel is on it). */
export function formsOf(ctx, guildId) {
  return setting(ctx, 'forms', []).filter((f) => f?.name && f.channel?.guild === guildId);
}

export function formByName(ctx, guildId, name) {
  const n = String(name ?? '').trim().toLowerCase();
  return formsOf(ctx, guildId).find((f) => f.name.trim().toLowerCase() === n) ?? null;
}

/** "Why do you want to join? (long)" -> { label, long, required }; at most 5 (Discord's limit). */
export function questions(text) {
  return String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((line) => {
      let label = line;
      const flag = (word) => {
        const re = new RegExp(`\\s*\\(${word}\\)\\s*`, 'i');
        const hit = re.test(label);
        label = label.replace(re, ' ').trim();
        return hit;
      };
      const long = flag('long');
      const optional = flag('optional');
      return { label: label.slice(0, 45) || 'Answer', long, required: !optional };
    });
}

/** The panel message: text and the button that opens the form. */
export function panelMessage(form) {
  return {
    embeds: [{ color: '#5865f2', title: `📝 ${form.title}`.slice(0, 256), description: String(form.description || 'Press the button to fill in the form.').slice(0, 4000) }],
    components: [[{ key: 'open', data: form.name.slice(0, 60), label: (form.button || 'Fill in').slice(0, 80), emoji: '📝', style: 'primary' }]],
  };
}

/** The modal of a form (keys q0 … q4). */
export function modalOf(form) {
  return {
    key: 'answer',
    data: form.name.slice(0, 60),
    title: form.title.slice(0, 45),
    fields: questions(form.questions).map((q, i) => ({ key: `q${i}`, label: q.label, style: q.long ? 'long' : 'short', required: q.required, max: q.long ? 2000 : 300 })),
  };
}

const STATUS = { open: ['#5865f2', '🕓 Open'], accepted: ['#22c55e', '✅ Accepted'], declined: ['#ef4444', '❌ Declined'] };

/** The answer message in the answers channel (with Accept / Decline while open). */
export function answerMessage(form, s, by = '') {
  const [color, label] = STATUS[s.status] ?? STATUS.open;
  const qs = questions(form.questions);
  const embed = {
    color,
    title: `📝 ${form.title}`.slice(0, 256),
    description: `From <@${s.user}>\n**Status:** ${label}${by ? ` by <@${by}>` : ''}`,
    fields: qs.map((q, i) => ({ name: q.label, value: String(s.answers[`q${i}`] || '—').slice(0, 1024) })),
    footer: { text: `Answer ${s.id}` },
  };
  const components = form.review !== false && s.status === 'open'
    ? [[{ key: 'accept', data: s.id, label: 'Accept', emoji: '✅', style: 'success' }, { key: 'decline', data: s.id, label: 'Decline', emoji: '❌', style: 'danger' }]]
    : [];
  return { embeds: [embed], components };
}

export const loadAnswer = (ctx, id) => readJson(ctx, `s:${id}`, null);
export const saveAnswer = (ctx, s) => writeJson(ctx, `s:${s.id}`, s);
export const openKey = (s) => `o:${s.guild}:${s.form.toLowerCase()}:${s.user}`;
