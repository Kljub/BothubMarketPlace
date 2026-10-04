// The blocks behind the commands. Each answers the command itself
// (privately unless noted) when it has one, else it hands its result on
// (port next) or fails (port failed, {Var} = the reason).
import { add, list, panel, play, removeSound } from './sounds.js';

async function answer(ctx, interaction, ok, text, ephemeral = true) {
  if (interaction) {
    await ctx.interaction.reply(interaction, text, { ephemeral });
    return { port: ok ? 'replied' : 'failed', results: { '': typeof text === 'string' ? text : '' } };
  }
  return { port: ok ? 'next' : 'failed', results: { '': typeof text === 'string' ? text : '' } };
}

export async function playBlock(ctx, { config, vars, interaction }) {
  const guild = vars['server.id'];
  if (!guild) return answer(ctx, interaction, false, '❌ Only on a server.');
  if (interaction) await ctx.interaction.deferReply(interaction, { ephemeral: true });
  const error = await play(ctx, guild, String(config.channel ?? '').replace(/\D/g, ''), config.sound);
  const text = error ?? `🔊 Playing **${String(config.sound).trim().toLowerCase()}**.`;
  if (interaction) {
    await ctx.interaction.editReply(interaction, text);
    return { port: error ? 'failed' : 'replied', results: { '': text } };
  }
  return { port: error ? 'failed' : 'next', results: { '': text } };
}

export async function addBlock(ctx, { config, vars, interaction }) {
  if (interaction) await ctx.interaction.deferReply(interaction, { ephemeral: true });
  const error = await add(ctx, config.name, String(config.attachment ?? '').trim(), vars['user.id'] ?? '');
  const text = error ?? `✅ Sound \`${String(config.name).trim().toLowerCase()}\` added.`;
  if (interaction) {
    await ctx.interaction.editReply(interaction, text);
    return { port: error ? 'failed' : 'replied', results: { '': text } };
  }
  return { port: error ? 'failed' : 'next', results: { '': text } };
}

export async function removeBlock(ctx, { config, interaction }) {
  const ok = await removeSound(ctx, config.name);
  return answer(ctx, interaction, ok, ok ? `🗑️ Sound \`${String(config.name).trim().toLowerCase()}\` removed.` : '❌ Sound not found.');
}

export async function listBlock(ctx, { interaction }) {
  const sounds = await list(ctx);
  const text = sounds.length ? sounds.map((s) => `🔊 **${s.name}** · played ${s.plays}×`).join('\n') : 'ℹ️ No sounds yet. Add one with /soundboard-add.';
  return answer(ctx, interaction, true, text);
}

export async function panelBlock(ctx, { interaction }) {
  const sounds = await list(ctx);
  if (!interaction) return { port: 'next', results: { '': String(sounds.length) } };
  await ctx.interaction.reply(interaction, panel(sounds));
  return { port: 'replied', results: { '': String(sounds.length) } };
}

export async function stopBlock(ctx, { vars, interaction }) {
  const guild = vars['server.id'];
  if (guild) {
    await ctx.voice.stop(guild).catch(() => undefined);
    await ctx.voice.leave(guild).catch(() => undefined);
  }
  return answer(ctx, interaction, true, '⏹️ Stopped.');
}
