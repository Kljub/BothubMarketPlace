// Event voiceStateUpdate ("discord.events.voice"). Payload in the builder's
// variable names: 'voice.action' (join, leave, switch), 'server.id',
// 'user.id', 'user.name', 'user.bot', 'channel.id' / 'channel.name' (the
// new channel, on leave the one left), 'old_channel.id' (on switch).
import { joined, left } from '../services/link.js';

/** @param {import('@bothub/sdk').PluginContext} ctx */
export default async function voiceStateUpdate(ctx, payload) {
  if (payload['user.bot'] === true) return;
  const guild = payload['server.id'];
  const user = payload['user.id'];
  if (!guild || !user) return;
  const action = payload['voice.action'];
  const from = action === 'leave' ? payload['channel.id'] : payload['old_channel.id'];
  if ((action === 'leave' || action === 'switch') && from) await left(ctx, guild, from, user);
  if (action === 'join' || action === 'switch') {
    const voice = payload['channel.id'];
    if (!voice) return;
    const parentId = (await ctx.channel.get(voice).catch(() => null))?.parentId ?? null;
    await joined(ctx, guild, voice, user, { voiceName: payload['channel.name'] ?? '', userName: payload['user.name'] ?? '', parentId });
  }
}
