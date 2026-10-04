// The buttons of the panel: a click plays the sound in the clicker's voice channel.
import { play } from './sounds.js';

export const components = {
  async play(ctx, ev) {
    if (!ev.guildId) return;
    const member = await ctx.member.get(ev.guildId, ev.user.id).catch(() => null);
    const error = await play(ctx, ev.guildId, member?.voiceChannelId ?? '', ev.data);
    await ctx.interaction.reply(ev.handle, error ?? `🔊 **${ev.data}**`, { ephemeral: true });
  },
};
