// Inbound webhooks (bothub.json "services.webhooks", "webhooks.inbound").
// The URLs are on the plugin page of the bot; enter them in
//   Plex → Settings → Webhooks          -> "media"
//   Overseerr → Settings → Notifications → Webhook -> "overseerr"
import { byPlexName } from './accounts.js';
import { allowedLibraries, refOf, serverOf } from './plex.js';
import { setting } from './util.js';

const COLOR = '#e5a00d';

export const webhooks = {
  /** Plex: library.new -> new-content channel; media.play -> live channel (linked members who allow it). */
  async media(ctx, payload) {
    const event = String(payload?.event ?? '');
    const meta = payload?.Metadata ?? {};
    // Every server sends its machine identifier: it decides the library reference.
    const server = await serverOf(ctx, payload?.Server?.uuid);
    if (!allowedLibraries(ctx).includes(refOf(server, String(meta.librarySectionID ?? '')))) return;
    const title = meta.grandparentTitle ? `${meta.grandparentTitle} – ${meta.title ?? ''}` : String(meta.title ?? 'New');

    if (event === 'library.new') {
      const channel = setting(ctx, 'new_content_channel', null);
      if (!channel?.id) return;
      await ctx.message.send(channel.id, { embeds: [{ color: COLOR, title: `🆕 ${title}${meta.year ? ` (${meta.year})` : ''}`, description: String(meta.summary ?? '').slice(0, 500) || undefined, footer: { text: String(meta.librarySectionTitle ?? 'Plex') } }] });
      return;
    }
    if (event === 'media.play' && setting(ctx, 'announce_plays', false)) {
      const channel = setting(ctx, 'live_channel', null);
      const who = await byPlexName(ctx, payload?.Account?.title ?? '');
      if (!channel?.id || !who) return;
      await ctx.message.send(channel.id, { embeds: [{ color: COLOR, description: `▶️ <@${who.userId}> is watching **${title}**${meta.year ? ` (${meta.year})` : ''}` }] });
    }
  },

  /** Overseerr: approved / available / declined -> DM to the member who asked (/plex-request). */
  async overseerr(ctx, payload) {
    const texts = {
      MEDIA_APPROVED: '✅ Your Plex request **{title}** was approved.',
      MEDIA_AVAILABLE: '🎬 Your Plex request **{title}** is available now!',
      MEDIA_DECLINED: '❌ Your Plex request **{title}** was declined.',
    };
    const text = texts[String(payload?.notification_type ?? '')];
    const id = payload?.request?.request_id;
    if (!text || id == null) return;
    const userId = await ctx.storage.get(`req:${id}`);
    if (!userId) return;
    await ctx.message.dm(userId, text.replace('{title}', String(payload?.subject ?? payload?.media?.title ?? 'request').slice(0, 200)));
    if (payload.notification_type !== 'MEDIA_APPROVED') await ctx.storage.delete(`req:${id}`);
  },
};
