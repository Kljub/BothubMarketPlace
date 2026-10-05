// Cooldown Reminders: members start a reminder for a cooldown (/cooldown
// <name>, e.g. "daily" of another bot's command); when it is over, the bot
// sends a direct message (or posts in the channel, setting "delivery").
// The bot owner lists the cooldowns with their minutes; custom ones with a
// minute value can be allowed. Storage "due" = [{ g, u, c, name, at }],
// checked every minute by the task "remind".
import { readJson, setting, writeJson } from './util.js';

const MAX_TOTAL = 150;
const MAX_PER_USER = 10;
const norm = (v) => String(v ?? '').trim().toLowerCase();

export function presets(ctx) {
  return setting(ctx, 'cooldowns', [])
    .filter((p) => norm(p?.name))
    .map((p) => ({ name: String(p.name).trim().slice(0, 40), minutes: Math.max(1, Math.min(43200, Math.floor(Number(p.minutes)) || 60)) }));
}

const duration = (min) => (min >= 1440 ? `${Math.floor(min / 1440)} d${min % 1440 >= 60 ? ` ${Math.floor((min % 1440) / 60)} h` : ''}` : min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);

async function answer(ctx, interaction, ok, message, result = '') {
  if (interaction) {
    await ctx.interaction.reply(interaction, message, { ephemeral: !ok || typeof message === 'string' });
    return { port: ok ? 'replied' : 'failed', results: { '': result } };
  }
  return { port: ok ? 'next' : 'failed', results: { '': result } };
}

export async function start(ctx, { config, vars, interaction }, now = Date.now()) {
  const g = vars['server.id'];
  const u = vars['user.id'];
  if (!g || !u) return answer(ctx, interaction, false, '❌ Only on a server.');
  const all = presets(ctx);
  let p = all.find((x) => norm(x.name) === norm(config.name));
  const custom = Math.floor(Number(config.minutes));
  if (custom >= 1 && setting(ctx, 'allow_custom', true) !== false) p = { name: p?.name ?? String(config.name ?? '').trim().slice(0, 40), minutes: Math.min(43200, custom) };
  if (!p?.name) {
    const names = all.map((x) => `\`${x.name}\``).join(', ');
    return answer(ctx, interaction, false, `❌ Unknown cooldown.${names ? ` Known: ${names}.` : ''}${setting(ctx, 'allow_custom', true) !== false ? ' Or give minutes.' : ''}`);
  }
  const due = await readJson(ctx, 'due', []);
  const rest = due.filter((d) => !(d.g === g && d.u === u && norm(d.name) === norm(p.name)));
  if (rest.filter((d) => d.g === g && d.u === u).length >= MAX_PER_USER) return answer(ctx, interaction, false, `❌ You have ${MAX_PER_USER} reminders running already.`);
  if (rest.length >= MAX_TOTAL) return answer(ctx, interaction, false, '❌ Too many reminders on this bot right now. Try again later.');
  const at = now + p.minutes * 60_000;
  rest.push({ g, u, c: String(vars['channel.id'] ?? ''), name: p.name, at });
  await writeJson(ctx, 'due', rest);
  return answer(ctx, interaction, true, `⏰ I remind you about **${p.name}** <t:${Math.floor(at / 1000)}:R> (${duration(p.minutes)}).`, String(at));
}

export async function list(ctx, { vars, interaction }) {
  const mine = (await readJson(ctx, 'due', [])).filter((d) => d.g === vars['server.id'] && d.u === vars['user.id']).sort((a, b) => a.at - b.at);
  const known = presets(ctx).map((p) => `\`${p.name}\` ${duration(p.minutes)}`).join(' · ');
  const lines = mine.map((d) => `⏰ **${d.name}** <t:${Math.floor(d.at / 1000)}:R>`);
  return answer(ctx, interaction, true, { embeds: [{ color: '#f59e0b', title: '⏰ Your cooldowns', description: `${lines.join('\n') || 'No reminders running.'}${known ? `\n\n**Cooldowns:** ${known}` : ''}`.slice(0, 4000) }] }, String(mine.length));
}

export async function stop(ctx, { config, vars, interaction }) {
  const due = await readJson(ctx, 'due', []);
  const rest = due.filter((d) => !(d.g === vars['server.id'] && d.u === vars['user.id'] && (norm(config.name) === 'all' || norm(d.name) === norm(config.name))));
  if (rest.length === due.length) return answer(ctx, interaction, false, '❌ No such reminder. See /cooldowns.');
  await writeJson(ctx, 'due', rest);
  return answer(ctx, interaction, true, `🗑️ Stopped ${due.length - rest.length} reminder(s).`, String(due.length - rest.length));
}

/** Sends the reminders that are due. */
export async function remind(ctx, now = Date.now()) {
  const due = await readJson(ctx, 'due', []);
  const ready = due.filter((d) => d.at <= now);
  if (!ready.length) return;
  await writeJson(ctx, 'due', due.filter((d) => d.at > now));
  const delivery = setting(ctx, 'delivery', 'dm');
  for (const d of ready) {
    const text = `⏰ <@${d.u}> your **${d.name}** cooldown is over!`;
    let ok = false;
    if (delivery !== 'channel') ok = await ctx.message.dm(d.u, text).then(() => true, () => false);
    if (!ok && d.c) await ctx.message.send(d.c, text).catch(() => undefined);
  }
}

export const tasks = { remind: (ctx) => remind(ctx) };
