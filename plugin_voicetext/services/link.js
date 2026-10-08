// Service "link": which text channel belongs to a voice channel, and who
// may see it. Linked channels (settings "links") stay; automatic ones are
// created on the first join (settings "auto") and deleted when the voice
// channel is empty again.
//
// Storage per server: "m:<guild>:<voice>" = JSON list of member IDs in the
// voice channel (as seen by the plugin), "a:<guild>:<voice>" = ID of the
// automatic text channel.
import { readJson, writeJson } from './storage.js';
import { channelName, fill, setting } from './util.js';

const SEE = ['view_channel', 'send_messages', 'read_message_history', 'attach_files', 'embed_links'];

/** The linked text channel of a voice channel (settings "links"), or null. */
export function linkedText(ctx, guildId, voiceId) {
  const links = setting(ctx, 'links', []);
  const hit = links.find((l) => l.voice?.id === voiceId && l.voice.guild === guildId && l.text?.id && l.text.guild === guildId);
  return hit ? hit.text.id : null;
}

/** Automatic text channels: on for this voice channel (all, or listed channels / categories)? */
export function autoFor(ctx, guildId, voiceId, parentId) {
  if (setting(ctx, 'auto', false) !== true) return false;
  const only = setting(ctx, 'auto_channels', []).filter((c) => c?.guild === guildId).map((c) => c.id);
  return only.length === 0 || only.includes(voiceId) || (!!parentId && only.includes(parentId));
}

async function members(ctx, guildId, voiceId) {
  return readJson(ctx, `m:${guildId}:${voiceId}`, []);
}

async function setMembers(ctx, guildId, voiceId, list) {
  if (list.length) await writeJson(ctx, `m:${guildId}:${voiceId}`, list.slice(0, 500));
  else await ctx.storage.delete(`m:${guildId}:${voiceId}`);
}

/** A member came into a voice channel: open its text channel for them. */
export async function joined(ctx, guildId, voiceId, userId, info) {
  const list = await members(ctx, guildId, voiceId);
  if (!list.includes(userId)) list.push(userId);
  await setMembers(ctx, guildId, voiceId, list);

  let textId = linkedText(ctx, guildId, voiceId);
  let created = false;
  if (!textId && autoFor(ctx, guildId, voiceId, info.parentId)) {
    textId = await ctx.storage.get(`a:${guildId}:${voiceId}`);
    if (!textId) {
      const name = channelName(fill(setting(ctx, 'auto_name', '{voice}-text'), { voice: info.voiceName || 'voice', user: info.userName || '' }));
      const ch = await ctx.channel.create(guildId, { name, type: 'text', parentId: info.parentId || undefined, topic: `Text channel of the voice channel ${info.voiceName || ''}`.trim(), reason: 'Voice Text Link' });
      textId = ch.id;
      created = true;
      await ctx.storage.set(`a:${guildId}:${voiceId}`, textId);
      // Hidden for everyone else (@everyone has the ID of the server).
      await ctx.channel.setPermissions(textId, guildId, { deny: ['view_channel'], reason: 'Voice Text Link' });
    }
  }
  if (!textId) return null;
  await ctx.channel.setPermissions(textId, userId, { allow: SEE, reason: 'Voice Text Link: joined voice' });
  const greeting = setting(ctx, 'greeting', '');
  if (greeting) await ctx.message.send(textId, fill(greeting, { user: `<@${userId}>`, voice: info.voiceName || '', channel: `<#${voiceId}>` })).catch(() => undefined);
  return { textId, created };
}

/** A member left a voice channel: close its text channel for them; an empty automatic one goes. */
export async function left(ctx, guildId, voiceId, userId) {
  const list = (await members(ctx, guildId, voiceId)).filter((id) => id !== userId);
  await setMembers(ctx, guildId, voiceId, list);
  const linked = linkedText(ctx, guildId, voiceId);
  const auto = await ctx.storage.get(`a:${guildId}:${voiceId}`);
  const textId = linked ?? auto;
  if (!textId) return null;
  if (!linked && auto && list.length === 0 && setting(ctx, 'auto_delete', true) !== false) {
    await ctx.storage.delete(`a:${guildId}:${voiceId}`);
    await ctx.channel.delete(auto, 'Voice Text Link: voice channel empty').catch(() => undefined);
    return { textId, deleted: true };
  }
  await ctx.channel.setPermissions(textId, userId, { deny: ['view_channel'], reason: 'Voice Text Link: left voice' });
  return { textId, deleted: false };
}
