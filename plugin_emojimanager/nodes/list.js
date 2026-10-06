// Node plugin.plugin_emojimanager.list (/emoji-menu list): every emoji the
// bot can use, privately: the emojis of the list (uploads and links) and the
// own emojis of every server the bot is on, one embed per server. Server
// emojis show as themselves (a bot may use the emojis of all its servers).
import { emojiList } from '../services/emojis.js';

const MAX_EMBEDS = 10;
const MAX_TEXT = 4000;

/** Joins items into embed texts of at most MAX_TEXT characters. */
function chunks(items, sep) {
  const out = [];
  let cur = '';
  for (const it of items) {
    if (cur && cur.length + sep.length + it.length > MAX_TEXT) {
      out.push(cur);
      cur = '';
    }
    cur = cur ? cur + sep + it : it;
  }
  if (cur) out.push(cur);
  return out;
}

/** The embeds of the overview (list first, then the servers by name); null when there is nothing. */
export async function overview(ctx, guildId) {
  const list = await emojiList(ctx, ''); // no server: only the list
  const sections = [];
  if (list.length) sections.push({ title: `📋 Emoji list (${list.length})`, text: list.map((e) => `\`:${e.name}:\``), sep: ' ' });
  let guilds = [];
  try {
    guilds = await ctx.guild.list();
  } catch {
    guilds = [];
  }
  // The current server first, then the others by name.
  guilds.sort((a, b) => (a.id === guildId ? -1 : b.id === guildId ? 1 : String(a.name).localeCompare(String(b.name))));
  let serverCount = 0;
  for (const g of guilds) {
    let emojis = [];
    try {
      emojis = (await ctx.emoji.list(g.id)).filter((e) => e.available !== false && e.mention);
    } catch {
      continue;
    }
    if (!emojis.length) continue;
    serverCount += emojis.length;
    sections.push({ title: `🖥️ ${g.name} (${emojis.length})`, text: emojis.map((e) => `${e.mention} \`:${e.name}:\``), sep: '  ' });
  }
  const embeds = [];
  let hidden = 0;
  for (const s of sections) {
    for (const [i, text] of chunks(s.text, s.sep).entries()) {
      if (embeds.length >= MAX_EMBEDS) {
        hidden += 1;
        continue;
      }
      embeds.push({ title: i ? `${s.title} …` : s.title, description: text, color: '#5865f2' });
    }
  }
  const total = list.length + serverCount;
  if (!total) return null;
  if (hidden && embeds.length) embeds[embeds.length - 1].footer = { text: `${hidden} more part(s) not shown (Discord: 10 embeds per message)` };
  return { total, listCount: list.length, serverCount, embeds };
}

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function listBlock(ctx, { vars, interaction }) {
  const o = await overview(ctx, String(vars['server.id'] ?? ''));
  if (!o) {
    if (interaction) await ctx.interaction.reply(interaction, '😶 No emojis yet: add some on the dashboard or with /emoji-menu add.', { ephemeral: true });
    return { port: 'empty', results: { '': '', '.count': '0' } };
  }
  const results = { '': String(o.total), '.count': String(o.total), '.list': String(o.listCount), '.server': String(o.serverCount) };
  if (!interaction) return { port: 'next', results };
  await ctx.interaction.reply(interaction, { content: `😀 **${o.total} emojis** the bot can use:`, embeds: o.embeds }, { ephemeral: true });
  return { port: 'replied', results };
}
