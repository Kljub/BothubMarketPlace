// Node plugin.plugin_emojimanager.send: posts one emoji by name in a
// channel (default: the channel of the run). Ports: next, not_found.
import { findEmoji, sendEmoji } from '../services/emojis.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function send(ctx, { config, vars }) {
  const guildId = String(vars['server.id'] ?? '');
  const emoji = await findEmoji(ctx, guildId, config.name);
  if (!emoji) return { port: 'not_found', results: { '': String(config.name ?? '') } };
  const channelId = String(config.channel || vars['channel.id'] || '');
  if (!/^\d{17,20}$/.test(channelId)) throw new Error('No channel to send the emoji to.');
  const { id, uses } = await sendEmoji(ctx, channelId, guildId, emoji, String(vars['user.id'] ?? ''));
  return { port: 'next', results: { '': emoji.name, '.image': emoji.file ?? emoji.image, '.message': String(id ?? ''), '.uses': String(uses) } };
}
