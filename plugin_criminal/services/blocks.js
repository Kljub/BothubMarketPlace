// /steal: tries to take a share of another member's balance. Chance, loot
// share, fine and cooldown come from the settings; the fine goes to the
// victim when "penalty_to_victim" is on. Cooldown per member and server in
// storage "cd:<guild>:<user>".
import { money, wallet } from './econ.js';
import { setting } from './util.js';

async function no(ctx, interaction, text) {
  if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
  return { port: 'failed', results: { '': text } };
}

export async function steal(ctx, { config, vars, interaction }, rng = Math.random) {
  const guild = vars['server.id'];
  const user = vars['user.id'];
  const target = String(config.target ?? '').replace(/\D/g, '');
  if (!guild || !user) return no(ctx, interaction, '❌ Only on a server.');
  if (!target) return no(ctx, interaction, '❌ Choose a member.');
  if (target === user) return no(ctx, interaction, '❌ You cannot steal from yourself.');
  const victim = await ctx.member.get(guild, target).catch(() => null);
  if (!victim || victim.bot) return no(ctx, interaction, '❌ Choose a member (no bot).');
  const cdKey = `cd:${guild}:${user}`;
  const cooldown = Number(setting(ctx, 'cooldown_minutes', 30)) * 60_000;
  const last = Number((await ctx.storage.get(cdKey)) ?? 0);
  if (cooldown && Date.now() - last < cooldown) return no(ctx, interaction, `⏳ Lie low for a while: try again <t:${Math.floor((last + cooldown) / 1000)}:R>.`);
  const theirs = await wallet(ctx).get(guild, target);
  if (theirs <= 0) return no(ctx, interaction, `❌ <@${target}> has nothing to steal.`);
  await ctx.storage.set(cdKey, String(Date.now()));

  let embed;
  let result;
  if (rng() * 100 < Number(setting(ctx, 'success_chance', 50))) {
    let loot = Math.max(1, Math.floor(theirs * (Number(setting(ctx, 'steal_percent', 20)) / 100)));
    const cap = Number(setting(ctx, 'max_steal', '') || 0);
    if (cap) loot = Math.min(loot, cap);
    await wallet(ctx).transfer(guild, target, user, loot);
    const balance = await wallet(ctx).get(guild, user);
    embed = { color: '#4ade80', title: '🕵️ Got away with it!', description: `You stole ${money(ctx, loot)} from <@${target}>.\nBalance: ${money(ctx, balance)}` };
    result = 'success';
  } else {
    const mine = await wallet(ctx).get(guild, user);
    const fine = Math.floor(mine * (Number(setting(ctx, 'fail_penalty_percent', 15)) / 100));
    if (fine > 0) {
      if (setting(ctx, 'penalty_to_victim', false)) await wallet(ctx).transfer(guild, user, target, fine);
      else await wallet(ctx).remove(guild, user, fine);
    }
    embed = { color: '#ef4444', title: '🚨 Caught!', description: `Your try on <@${target}> failed.${fine ? `\nFine: ${money(ctx, fine)}${setting(ctx, 'penalty_to_victim', false) ? ` (to <@${target}>)` : ''}` : ''}\nBalance: ${money(ctx, mine - fine)}` };
    result = 'caught';
  }
  if (interaction) {
    await ctx.interaction.reply(interaction, { embeds: [embed] });
    return { port: 'replied', results: { '': result } };
  }
  return { port: 'next', results: { '': result } };
}
