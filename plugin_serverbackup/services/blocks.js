// The blocks behind /backup create | info | delete | restore | clone. A
// backup takes longer than a block may run: the block answers ("working…")
// and the rest runs on in the plugin process, then edits the answer.
// Restore and clone ask first (button), and report by DM too, because
// "replace" may delete the channel the command came from.
import { countsLine, create, list, remove, size, when } from './backups.js';

async function say(ctx, interaction, ok, text) {
  if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
  return { port: ok ? (interaction ? 'replied' : 'next') : 'failed', results: { '': text } };
}

export async function createBlock(ctx, { vars, interaction }) {
  const guild = vars['server.id'];
  if (!guild) return say(ctx, interaction, false, '❌ Only on a server.');
  if (!interaction) {
    const b = await create(ctx, guild, vars['user.id'] ?? '', 'manual');
    return { port: 'next', results: { '': b.file } };
  }
  await ctx.interaction.deferReply(interaction, { ephemeral: true });
  const started = Date.now();
  void create(ctx, guild, vars['user.id'] ?? '', 'manual')
    .then((b) => ctx.interaction.editReply(interaction, `✅ **Backup made** (${((Date.now() - started) / 1000).toFixed(1)} s, ${size(b.size)})\n${countsLine(b.counts)}\nDownload: plugin page → Files.`))
    .catch((err) => ctx.interaction.editReply(interaction, `❌ ${err?.message ?? err}`).catch(() => undefined));
  return { port: 'replied', results: { '': '' } };
}

export async function infoBlock(ctx, { vars, interaction }) {
  const all = await list(ctx, vars['server.id']);
  if (!all.length) return say(ctx, interaction, true, 'ℹ️ No backup of this server yet. Make one with /backup create.');
  const lines = all.map((b, i) => `**${i + 1}.** ${when(b.createdAt)} · ${b.trigger === 'schedule' ? 'scheduled' : 'manual'} · ${size(b.size)}\n　${countsLine(b.counts)}`);
  return say(ctx, interaction, true, `💾 **Backups of this server** (1 = newest)\n${lines.join('\n')}`);
}

export async function deleteBlock(ctx, { config, vars, interaction }) {
  const index = Math.max(1, Number(config.number) || 1) - 1;
  const b = await remove(ctx, vars['server.id'], index);
  return say(ctx, interaction, !!b, b ? `🗑️ Backup ${index + 1} (${when(b.createdAt)}) deleted.` : '❌ No such backup. See /backup info.');
}

/** restore (this server's backup) and clone (another server's backup into this one): asks first. */
async function ask(ctx, { config, vars, interaction }, source) {
  const guild = vars['server.id'];
  if (!guild || !interaction) return say(ctx, interaction, false, '❌ Only as a command on a server.');
  const from = source ?? guild;
  const index = Math.max(1, Number(config.number) || 1) - 1;
  const b = (await list(ctx, from))[index];
  if (!b) return say(ctx, interaction, false, source ? '❌ No backup of that server (make one there with /backup create).' : '❌ No such backup. See /backup info.');
  const mode = String(config.mode ?? '').toLowerCase() === 'replace' ? 'replace' : 'add';
  const warn = mode === 'replace' ? '⚠️ **Replace** deletes all channels and the roles the bot may manage on this server first.' : 'Add: roles and channels are created next to what is there.';
  await ctx.interaction.reply(interaction, {
    content: `${source ? `Clone **${b.name}**` : 'Restore'} backup ${index + 1} from ${when(b.createdAt)} into this server?\n${countsLine(b.counts)}\n${warn}`,
    components: [[
      { key: 'confirm', data: `${from}:${index}:${mode}:${vars['user.id']}`, label: mode === 'replace' ? 'Yes, replace' : 'Yes, restore', style: 'danger' },
      { key: 'cancel', data: vars['user.id'] ?? '', label: 'Cancel', style: 'secondary' },
    ]],
  }, { ephemeral: true });
  return { port: 'replied', results: { '': b.file } };
}

export const restoreBlock = (ctx, input) => ask(ctx, input, null);

export async function cloneBlock(ctx, input) {
  const source = String(input.config.source ?? '').replace(/\D/g, '');
  if (!source) return say(ctx, input.interaction, false, '❌ Name the ID of the server to clone.');
  if (source === input.vars['server.id']) return say(ctx, input.interaction, false, '❌ That is this server: use /backup restore.');
  return ask(ctx, input, source);
}
