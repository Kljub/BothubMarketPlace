// /rob-bank: a team robs a member's bank. The leader opens a lobby, others
// join with a button; at "heist_min_crew" members the leader starts. Chance
// grows by 5 % per member above the minimum (max. 90 %). Success: a share of
// the victim's bank (capped) is split evenly into the crew's wallets
// (ctx.economy.bankTransfer). Caught: every member pays a fine of their
// wallet. A heist lives in storage "h:<id>" = { id, guild, leader, target,
// crew, at }; open ones in "heists"; the victim is safe for a while after
// a heist ("hcd:<guild>:<target>").
import { money, wallet } from './econ.js';
import { readJson, setting, writeJson } from './util.js';

const MAX_CREW = 10;
const num = (ctx, key, fallback) => Number(setting(ctx, key, fallback) || 0);

export function heistMessage(ctx, h, text = '', done = false) {
  const min = Math.max(1, num(ctx, 'heist_min_crew', 3));
  const crew = h.crew.map((u) => `<@${u}>`).join(', ');
  const lines = [`Target: <@${h.target}>'s bank`, `Crew (${h.crew.length}/${MAX_CREW}, at least ${min}): ${crew}`, `Chance: ${chanceOf(ctx, h.crew.length)} %`];
  if (text) lines.push('', text);
  const components = done ? [] : [[
    { key: 'heist_join', data: h.id, label: 'Join', emoji: '🔫', style: 'primary' },
    { key: 'heist_start', data: h.id, label: 'Start', emoji: '🏦', style: 'success', disabled: h.crew.length < min },
    { key: 'heist_cancel', data: h.id, label: 'Cancel', style: 'secondary' },
  ]];
  return { embeds: [{ color: done ? '#5865f2' : '#f59e0b', title: '🏦 Bank heist', description: lines.join('\n') }], components };
}

export function chanceOf(ctx, size) {
  const min = Math.max(1, num(ctx, 'heist_min_crew', 3));
  return Math.max(0, Math.min(90, num(ctx, 'heist_chance', 40) + 5 * Math.max(0, size - min)));
}

export async function endHeist(ctx, h) {
  await ctx.storage.delete(`h:${h.id}`);
  await writeJson(ctx, 'heists', (await readJson(ctx, 'heists', [])).filter((x) => x !== h.id));
}

async function no(ctx, interaction, text) {
  if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
  return { port: 'failed', results: { '': text } };
}

export async function heist(ctx, { config, vars, interaction }) {
  const guild = vars['server.id'];
  const user = vars['user.id'];
  const target = String(config.target ?? '').replace(/\D/g, '');
  if (!guild || !user || !interaction) return no(ctx, interaction, '❌ Only as a command on a server.');
  if (!target) return no(ctx, interaction, '❌ Choose a member.');
  if (target === user) return no(ctx, interaction, '❌ You cannot rob your own bank.');
  const victim = await ctx.member.get(guild, target).catch(() => null);
  if (!victim || victim.bot) return no(ctx, interaction, '❌ Choose a member (no bot).');
  const safe = Number((await ctx.storage.get(`hcd:${guild}:${target}`)) ?? 0);
  if (safe > Date.now()) return no(ctx, interaction, `🚓 The bank of <@${target}> is guarded: try again <t:${Math.floor(safe / 1000)}:R>.`);
  if ((await wallet(ctx).bank(guild, target)) <= 0) return no(ctx, interaction, `❌ <@${target}> has nothing in the bank.`);
  const h = { id: ctx.utils.uuid().replace(/-/g, '').slice(0, 12), guild, leader: user, target, crew: [user], at: Date.now() };
  await writeJson(ctx, `h:${h.id}`, h);
  await writeJson(ctx, 'heists', [...(await readJson(ctx, 'heists', [])), h.id]);
  await ctx.interaction.reply(interaction, heistMessage(ctx, h, `<@${user}> plans a heist. Join within 5 minutes!`));
  return { port: 'replied', results: { '': h.id } };
}

/** Runs the heist: true when it worked. */
export async function runHeist(ctx, h, rng = Math.random) {
  const bank = await wallet(ctx).bank(h.guild, h.target);
  await ctx.storage.set(`hcd:${h.guild}:${h.target}`, String(Date.now() + num(ctx, 'heist_cooldown_minutes', 120) * 60_000));
  if (bank > 0 && rng() * 100 < chanceOf(ctx, h.crew.length)) {
    let loot = Math.floor(bank * (num(ctx, 'heist_percent', 30) / 100));
    const cap = num(ctx, 'heist_max', '');
    if (cap) loot = Math.min(loot, cap);
    const share = Math.floor(loot / h.crew.length);
    if (share > 0) for (const u of h.crew) await wallet(ctx).bankTransfer(h.guild, h.target, u, share);
    return { ok: true, text: share > 0 ? `💰 The crew got away with ${money(ctx, share * h.crew.length)}: ${money(ctx, share)} each.` : '💨 The vault was nearly empty: nothing worth taking.' };
  }
  const pct = num(ctx, 'heist_fine_percent', 10) / 100;
  const fines = [];
  for (const u of h.crew) {
    const fine = Math.floor((await wallet(ctx).get(h.guild, u)) * pct);
    if (fine > 0) await wallet(ctx).remove(h.guild, u, fine);
    fines.push(`<@${u}> −${money(ctx, fine)}`);
  }
  return { ok: false, text: `🚨 Caught by the police!\nFines: ${fines.join(', ')}` };
}

const say = (ctx, ev, text) => ctx.interaction.reply(ev.handle, text, { ephemeral: true });

export const heistComponents = {
  async heist_join(ctx, ev) {
    const h = await readJson(ctx, `h:${ev.data}`, null);
    if (!h) return say(ctx, ev, '⌛ This heist is over.');
    if (ev.user.id === h.target) return say(ctx, ev, '❌ You cannot rob your own bank.');
    if (h.crew.includes(ev.user.id)) return say(ctx, ev, 'ℹ️ You are already in the crew.');
    if (h.crew.length >= MAX_CREW) return say(ctx, ev, '❌ The crew is full.');
    h.crew.push(ev.user.id);
    await writeJson(ctx, `h:${h.id}`, h);
    await ctx.interaction.update(ev.handle, heistMessage(ctx, h, `<@${ev.user.id}> joined.`));
  },

  async heist_start(ctx, ev) {
    const h = await readJson(ctx, `h:${ev.data}`, null);
    if (!h) return say(ctx, ev, '⌛ This heist is over.');
    if (ev.user.id !== h.leader) return say(ctx, ev, '❌ Only the leader starts the heist.');
    if (h.crew.length < Math.max(1, num(ctx, 'heist_min_crew', 3))) return say(ctx, ev, '❌ The crew is too small.');
    await endHeist(ctx, h);
    const r = await runHeist(ctx, h);
    await ctx.interaction.update(ev.handle, heistMessage(ctx, h, r.text, true));
  },

  async heist_cancel(ctx, ev) {
    const h = await readJson(ctx, `h:${ev.data}`, null);
    if (!h) return say(ctx, ev, '⌛ This heist is over.');
    if (ev.user.id !== h.leader) return say(ctx, ev, '❌ Only the leader can call it off.');
    await endHeist(ctx, h);
    await ctx.interaction.update(ev.handle, heistMessage(ctx, h, 'Called off.', true));
  },
};

export const tasks = {
  /** Lobbies older than 5 minutes end. */
  async expire(ctx) {
    for (const id of await readJson(ctx, 'heists', [])) {
      const h = await readJson(ctx, `h:${id}`, null);
      if (h && Date.now() - h.at < 300_000) continue;
      await endHeist(ctx, h ?? { id });
    }
  },
};
