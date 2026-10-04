// The blocks behind the commands. Each answers the command itself
// (privately) when it has one, else it hands its result on (port next) or
// fails (port failed, {Var} = the reason).
import { byName, create, fileMessage, hashPassword, latestOf, parseDate, refresh, remove, save } from './files.js';

async function answer(ctx, interaction, ok, text) {
  if (interaction) {
    await ctx.interaction.reply(interaction, text, { ephemeral: true });
    return { port: ok ? 'replied' : 'failed', results: { '': text } };
  }
  return { port: ok ? 'next' : 'failed', results: { '': text } };
}

const yes = (v) => [true, 'true', 'yes', '1'].includes(typeof v === 'string' ? v.toLowerCase() : v);

export async function createFile(ctx, { config, vars, interaction }) {
  const guild = vars['server.id'];
  const channel = vars['channel.id'];
  if (!guild || !channel) return answer(ctx, interaction, false, '❌ Only on a server.');
  const name = String(config.name ?? '').trim().slice(0, 64);
  if (!name) return answer(ctx, interaction, false, '❌ Give the file a name.');
  if (await byName(ctx, guild, name)) return answer(ctx, interaction, false, `❌ There already is a file named \`${name}\` on this server.`);
  const text = String(config.text ?? '').trim().slice(0, 1900);
  const url = String(config.attachment ?? '').trim();
  if (!text && !url) return answer(ctx, interaction, false, '❌ Give an attachment or a text.');
  const start = parseDate(config.start);
  const end = parseDate(config.end);
  if (start === undefined || end === undefined) return answer(ctx, interaction, false, '❌ Unknown date. Example: `2026-12-24 18:00` (UTC).');
  if (start && end && start >= end) return answer(ctx, interaction, false, '❌ The end must be after the start.');
  const max = String(config.max ?? '').trim() ? Math.floor(Number(config.max)) : null;
  if (max !== null && !(max >= 1 && max <= 100000)) return answer(ctx, interaction, false, '❌ Max. uses: a number from 1.');
  let stored = null;
  if (url) {
    try {
      stored = await ctx.files.fromDiscord(url);
    } catch (err) {
      const why = String(err?.message ?? err);
      return answer(ctx, interaction, false, why.includes('too_big') ? '❌ The file is too big (max. 8 MB).' : why.includes('bad_type') ? '❌ This file type is not allowed (programs).' : '❌ The attachment could not be stored.');
    }
  }
  const salt = ctx.utils.uuid();
  const password = String(config.password ?? '');
  const f = {
    id: ctx.utils.uuid().replace(/-/g, '').slice(0, 12), guild, name, text, file: stored?.name ?? null, filename: stored?.filename ?? '',
    salt, hash: password ? hashPassword(ctx, salt, password) : null, max, used: 0, onePerUser: yes(config.once),
    start, end, roles: [], createdBy: vars['user.id'] ?? '', created: Date.now(), message: null,
  };
  await create(ctx, f);
  const id = await ctx.message.send(channel, fileMessage(f));
  f.message = { channel, id };
  await save(ctx, f);
  return answer(ctx, interaction, true, `✅ \`${name}\` is posted. Members open it with the button.`);
}

async function target(ctx, guild, name, userId) {
  return String(name ?? '').trim() ? byName(ctx, guild, name) : latestOf(ctx, guild, userId);
}

export async function allowRole(ctx, { config, vars, interaction }) {
  const f = await target(ctx, vars['server.id'], config.name, vars['user.id']);
  const role = String(config.role ?? '').replace(/\D/g, '');
  if (!f) return answer(ctx, interaction, false, '❌ File not found.');
  if (!role) return answer(ctx, interaction, false, '❌ Choose a role.');
  if (!f.roles.includes(role)) f.roles.push(role);
  await save(ctx, f);
  await refresh(ctx, f);
  return answer(ctx, interaction, true, `✅ <@&${role}> may open \`${f.name}\` now.`);
}

export async function removeRole(ctx, { config, vars, interaction }) {
  const f = await target(ctx, vars['server.id'], config.name, vars['user.id']);
  const role = String(config.role ?? '').replace(/\D/g, '');
  if (!f) return answer(ctx, interaction, false, '❌ File not found.');
  f.roles = f.roles.filter((r) => r !== role);
  await save(ctx, f);
  await refresh(ctx, f);
  return answer(ctx, interaction, true, `✅ <@&${role}> no longer opens \`${f.name}\`${f.roles.length ? '' : ' (no role limit left: everyone may)'}.`);
}

export async function deleteFile(ctx, { config, vars, interaction }) {
  const f = await byName(ctx, vars['server.id'], config.name);
  if (!f) return answer(ctx, interaction, false, `❌ File \`${String(config.name ?? '')}\` not found.`);
  await refresh(ctx, f, true);
  await remove(ctx, f);
  return answer(ctx, interaction, true, `🗑️ \`${f.name}\` deleted.`);
}
