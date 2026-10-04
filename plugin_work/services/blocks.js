// Jobs: the bot owner lists them on the settings page (name, key, emoji,
// pay range, cooldown); members take one with /job-accept, earn with /work
// and quit with /job-leave. A member's job: storage "emp:<guild>:<user>" =
// { job, last }.
import { money } from './econ.js';
import { readJson, setting, writeJson } from './util.js';

export function jobs(ctx) {
  return setting(ctx, 'jobs', [])
    .filter((j) => j && j.enabled !== false && String(j.key ?? '').trim() && String(j.name ?? '').trim())
    .map((j) => {
      const min = Math.max(0, Math.floor(Number(j.pay_min) || 0));
      const max = Math.max(min, Math.floor(Number(j.pay_max) || min));
      return { key: String(j.key).trim().toLowerCase(), name: String(j.name).trim(), emoji: j.emoji || '💼', description: j.description ?? '', min, max, cooldown: Math.max(1, Number(j.cooldown_minutes) || 60) };
    });
}

const findJob = (ctx, key) => jobs(ctx).find((j) => j.key === String(key ?? '').trim().toLowerCase() || j.name.toLowerCase() === String(key ?? '').trim().toLowerCase());
const duration = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);

async function answer(ctx, interaction, ok, message, result = '') {
  if (interaction) {
    await ctx.interaction.reply(interaction, message, { ephemeral: !ok || typeof message === 'string' });
    return { port: ok ? 'replied' : 'failed', results: { '': result } };
  }
  return { port: ok ? 'next' : 'failed', results: { '': result } };
}

export async function list(ctx, { interaction }) {
  const all = jobs(ctx);
  if (!all.length) return answer(ctx, interaction, false, 'ℹ️ No jobs yet: the bot owner adds them on the plugin page.');
  const lines = all.map((j) => `${j.emoji} **${j.name}** (\`${j.key}\`) · ${money(ctx, j.min)}–${money(ctx, j.max)} · every ${duration(j.cooldown)}${j.description ? `\n　${j.description}` : ''}`);
  return answer(ctx, interaction, true, { embeds: [{ color: '#5865f2', title: '💼 Jobs', description: `${lines.join('\n')}\n\nTake one with /job-accept.` }] }, String(all.length));
}

export async function accept(ctx, { config, vars, interaction }) {
  const guild = vars['server.id'];
  const user = vars['user.id'];
  if (!guild || !user) return answer(ctx, interaction, false, '❌ Only on a server.');
  const job = findJob(ctx, config.job);
  if (!job) return answer(ctx, interaction, false, '❌ Unknown job. See /job-list.');
  const emp = await readJson(ctx, `emp:${guild}:${user}`, null);
  if (emp?.job === job.key) return answer(ctx, interaction, false, `ℹ️ You already work as ${job.emoji} **${job.name}**.`);
  await writeJson(ctx, `emp:${guild}:${user}`, { job: job.key, last: 0 });
  return answer(ctx, interaction, true, `✅ You work as ${job.emoji} **${job.name}** now. Earn with /work.`, job.key);
}

export async function leave(ctx, { vars, interaction }) {
  const key = `emp:${vars['server.id']}:${vars['user.id']}`;
  const emp = await readJson(ctx, key, null);
  if (!emp) return answer(ctx, interaction, false, 'ℹ️ You have no job.');
  await ctx.storage.delete(key);
  return answer(ctx, interaction, true, '👋 You quit your job.');
}

export async function work(ctx, { vars, interaction }, rng = Math.random) {
  const guild = vars['server.id'];
  const user = vars['user.id'];
  if (!guild || !user) return answer(ctx, interaction, false, '❌ Only on a server.');
  const emp = await readJson(ctx, `emp:${guild}:${user}`, null);
  const job = emp && findJob(ctx, emp.job);
  if (!job) return answer(ctx, interaction, false, '❌ You have no job (or it was removed). Take one with /job-accept.');
  const next = emp.last + job.cooldown * 60_000;
  if (Date.now() < next) return answer(ctx, interaction, false, `⏳ Your next shift starts <t:${Math.floor(next / 1000)}:R>.`);
  const pay = job.min + Math.floor(rng() * (job.max - job.min + 1));
  await writeJson(ctx, `emp:${guild}:${user}`, { ...emp, last: Date.now() });
  const balance = await ctx.economy.add(guild, user, pay);
  return answer(ctx, interaction, true, { embeds: [{ color: '#4ade80', title: `${job.emoji} ${job.name}`, description: `You earned ${money(ctx, pay)}!\nBalance: ${money(ctx, balance)}\nNext shift in ${duration(job.cooldown)}.` }] }, String(pay));
}
