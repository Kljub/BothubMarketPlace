// Trivia: /trivia posts a question with four answers (Open Trivia Database,
// opentdb.com; a few built-in questions when it cannot be reached). Every
// member may answer once; the first right answer wins "trivia_reward"
// (once per "trivia_cooldown_minutes"). Unanswered questions end after two
// minutes (expire task).
import { money, wallet } from './econ.js';
import { endGame, loadGame, newGame, no, pick, saveGame, say, shuffle, who } from './core.js';
import { setting } from './util.js';

export const TRIVIA_IDLE_MS = 120_000;

export const BUILT_IN = [
  { q: 'Which planet is known as the Red Planet?', a: 'Mars', w: ['Venus', 'Jupiter', 'Mercury'], c: 'Science' },
  { q: 'How many sides does a hexagon have?', a: '6', w: ['5', '7', '8'], c: 'Math' },
  { q: 'What is the chemical symbol for gold?', a: 'Au', w: ['Ag', 'Gd', 'Go'], c: 'Science' },
  { q: 'Which ocean is the largest?', a: 'Pacific', w: ['Atlantic', 'Indian', 'Arctic'], c: 'Geography' },
  { q: 'Who painted the Mona Lisa?', a: 'Leonardo da Vinci', w: ['Michelangelo', 'Raphael', 'Rembrandt'], c: 'Art' },
  { q: 'What is the capital of Australia?', a: 'Canberra', w: ['Sydney', 'Melbourne', 'Perth'], c: 'Geography' },
  { q: 'In which year did the first person walk on the Moon?', a: '1969', w: ['1965', '1972', '1959'], c: 'History' },
  { q: 'How many bits are in a byte?', a: '8', w: ['4', '16', '10'], c: 'Computers' },
  { q: 'Which gas do plants take in for photosynthesis?', a: 'Carbon dioxide', w: ['Oxygen', 'Nitrogen', 'Hydrogen'], c: 'Science' },
  { q: 'What is the longest river in Africa?', a: 'Nile', w: ['Congo', 'Niger', 'Zambezi'], c: 'Geography' },
  { q: 'Which language has the most native speakers?', a: 'Mandarin Chinese', w: ['English', 'Spanish', 'Hindi'], c: 'General' },
  { q: 'What is the hardest natural material?', a: 'Diamond', w: ['Quartz', 'Iron', 'Granite'], c: 'Science' },
];

const decode = (s) => {
  try {
    return decodeURIComponent(String(s ?? ''));
  } catch {
    return String(s ?? '');
  }
};

/** One question: from opentdb.com, else a built-in one. */
export async function question(ctx, difficulty) {
  try {
    const query = { amount: 1, type: 'multiple', encode: 'url3986' };
    if (['easy', 'medium', 'hard'].includes(difficulty)) query.difficulty = difficulty;
    const res = await ctx.http.get('https://opentdb.com/api.php', { query });
    const r = res?.json?.results?.[0];
    if (res?.status === 200 && r?.question && r.correct_answer && r.incorrect_answers?.length === 3) {
      return { q: decode(r.question), a: decode(r.correct_answer), w: r.incorrect_answers.map(decode), c: decode(r.category), d: decode(r.difficulty) };
    }
  } catch {
    // offline or rate limited: built-in question
  }
  return { ...pick(BUILT_IN), d: '' };
}

const LETTERS = ['🇦', '🇧', '🇨', '🇩'];

function triviaMessage(ctx, g, text = '', done = false) {
  const lines = g.answers.map((a, i) => `${LETTERS[i]} ${done && i === g.right ? `**${a}** ✅` : a}`);
  return {
    embeds: [{
      color: done ? '#5865f2' : '#8b5cf6', title: '❓ Trivia',
      description: `**${g.question}**\n\n${lines.join('\n')}${text ? `\n\n${text}` : ''}`,
      footer: { text: `${g.category}${g.difficulty ? ` · ${g.difficulty}` : ''}${done ? '' : ' · one try per member · 2 minutes'}` },
    }],
    components: done ? [] : [g.answers.map((_, i) => ({ key: 'trivia', data: `${g.id}:${i}`, emoji: LETTERS[i], style: 'secondary' }))],
  };
}

export async function trivia(ctx, { config, vars, interaction }) {
  const { guild, user, error } = who(vars, interaction);
  if (error) return no(ctx, interaction, error);
  const q = await question(ctx, String(config.difficulty ?? '').trim().toLowerCase());
  const answers = shuffle([q.a, ...q.w]);
  const g = await newGame(ctx, 'trivia', guild, user, { question: q.q, answers, right: answers.indexOf(q.a), category: q.c || 'Trivia', difficulty: q.d || '', tried: [] });
  await ctx.interaction.reply(interaction, triviaMessage(ctx, g));
  return { port: 'replied', results: { '': g.id } };
}

/** The reward for a right answer, with its own cooldown per member. */
async function triviaReward(ctx, guild, user) {
  const amount = Math.floor(Number(setting(ctx, 'trivia_reward', '25') || 0));
  if (amount <= 0) return '';
  const key = `tr:${guild}:${user}`;
  const cooldown = Number(setting(ctx, 'trivia_cooldown_minutes', 5)) * 60_000;
  const last = Number((await ctx.storage.get(key)) ?? 0);
  if (cooldown && Date.now() - last < cooldown) return ` (next reward <t:${Math.floor((last + cooldown) / 1000)}:R>)`;
  await ctx.storage.set(key, String(Date.now()));
  await wallet(ctx).add(guild, user, amount);
  return ` and wins ${money(ctx, amount)}`;
}

/** Ends an unanswered question (expire task). */
export async function triviaTimeout(ctx, g) {
  await endGame(ctx, g);
}

export const triviaComponents = {
  async trivia(ctx, ev) {
    const [id, at] = String(ev.data).split(':');
    const g = await loadGame(ctx, id);
    if (!g || g.kind !== 'trivia') return say(ctx, ev, '⌛ This question is over.');
    if (g.tried.includes(ev.user.id)) return say(ctx, ev, 'ℹ️ You already answered.');
    const i = Number(at);
    if (!(i >= 0 && i < 4)) return;
    if (i !== g.right) {
      g.tried.push(ev.user.id);
      await saveGame(ctx, g);
      return say(ctx, ev, `❌ Wrong: **${g.answers[i]}** is not it. Others can still answer.`);
    }
    await endGame(ctx, g);
    const reward = await triviaReward(ctx, g.guild, ev.user.id);
    const wrong = g.tried.length ? ` · ${g.tried.length} wrong ${g.tried.length === 1 ? 'answer' : 'answers'}` : '';
    await ctx.interaction.update(ev.handle, triviaMessage(ctx, g, `🏆 <@${ev.user.id}> knew it${reward}!${wrong}`, true));
  },
};
