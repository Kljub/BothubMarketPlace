// Blocks behind /globalban and /globalunban: ban or unban a user on every
// server of the bot (also the one the command runs on).
import { enqueue, ids, isTrusted, work } from './bans.js';

async function answer(ctx, interaction, ok, text) {
  if (interaction) {
    await ctx.interaction.reply(interaction, text, { ephemeral: true });
    return { port: ok ? 'replied' : 'failed', results: { '': text } };
  }
  return { port: ok ? 'next' : 'failed', results: { '': text } };
}

function userOf(config) {
  return ids([config.user])[0] ?? null;
}

export async function banBlock(ctx, { config, vars, interaction }) {
  const user = userOf(config);
  if (!user) return answer(ctx, interaction, false, '❌ Give a member or user ID.');
  if (user === vars['user.id']) return answer(ctx, interaction, false, '❌ You cannot ban yourself.');
  if (isTrusted(ctx, user)) return answer(ctx, interaction, false, '❌ This user is on the trusted list (Plugins → Global Bans).');
  const by = vars['user.name'] ? ` by ${vars['user.name']}` : '';
  const reason = `${String(config.reason ?? '').trim() || 'no reason'}${by}`;
  const n = await enqueue(ctx, 'ban', user, '', reason);
  await work(ctx);
  return answer(ctx, interaction, true, `🌐 <@${user}> is being banned on ${n} server${n === 1 ? '' : 's'}.`);
}

export async function unbanBlock(ctx, { config, interaction }) {
  const user = userOf(config);
  if (!user) return answer(ctx, interaction, false, '❌ Give a user ID.');
  const n = await enqueue(ctx, 'unban', user, '', '');
  await work(ctx);
  return answer(ctx, interaction, true, `🌐 <@${user}> is being unbanned on ${n} server${n === 1 ? '' : 's'}.`);
}
