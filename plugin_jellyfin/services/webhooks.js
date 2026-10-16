// Inbound webhooks (bothub.json "services.webhooks", "webhooks.inbound").
// The URLs are on the plugin page of the bot; enter them in
//   Jellyfin → Dashboard → Plugins → Webhook (the official Webhook plugin):
//     "Add Generic Destination", URL of "media", notification types
//     "Item Added" and "Playback Start", tick "Send All Properties"
//   Jellyseerr → Settings → Notifications → Webhook -> "jellyseerr"
import { byJellyfinUser } from './accounts.js';
import { allowedLibraries, libraryOf, serverOf } from './jellyfin.js';
import { setting } from './util.js';

const COLOR = '#aa5cc3';
const pad = (n) => String(n ?? '').padStart(2, '0');

/** The title of a webhook item: "Show – S01E02 · Name" for episodes. */
export function webhookTitle(p) {
  if (p.ItemType === 'Episode' && p.SeriesName) {
    const s = p.SeasonNumber00 ?? pad(p.SeasonNumber);
    const e = p.EpisodeNumber00 ?? pad(p.EpisodeNumber);
    return `${p.SeriesName} – S${s}E${e}${p.Name ? ` · ${p.Name}` : ''}`;
  }
  return String(p.Name ?? 'New');
}

export const webhooks = {
  /** Jellyfin: ItemAdded -> new-content channel; PlaybackStart -> live channel (linked members). */
  async media(ctx, payload) {
    const event = String(payload?.NotificationType ?? '');
    if (!payload?.ItemId) return;
    const server = await serverOf(ctx, payload.ServerId);
    if (!allowedLibraries(ctx).includes(await libraryOf(ctx, server, payload.ItemId))) return;
    const title = webhookTitle(payload);
    const year = payload.Year ? ` (${payload.Year})` : '';

    if (event === 'ItemAdded') {
      const channel = setting(ctx, 'new_content_channel', null);
      if (!channel?.id) return;
      await ctx.message.send(channel.id, { embeds: [{ color: COLOR, title: `🆕 ${title}${year}`.slice(0, 256), description: String(payload.Overview ?? '').slice(0, 500) || undefined, footer: { text: String(payload.ServerName ?? 'Jellyfin') } }] });
      return;
    }
    if (event === 'PlaybackStart' && setting(ctx, 'announce_plays', false)) {
      const channel = setting(ctx, 'live_channel', null);
      const who = await byJellyfinUser(ctx, payload.UserId ?? '');
      if (!channel?.id || !who) return;
      await ctx.message.send(channel.id, { embeds: [{ color: COLOR, description: `▶️ <@${who.userId}> is watching **${title}**${year}` }] });
    }
  },

  /** Jellyseerr: approved / available / declined -> DM to the member who asked (/jellyfin-request). */
  async jellyseerr(ctx, payload) {
    const texts = {
      MEDIA_APPROVED: '✅ Your Jellyfin request **{title}** was approved.',
      MEDIA_AVAILABLE: '🎬 Your Jellyfin request **{title}** is available now!',
      MEDIA_DECLINED: '❌ Your Jellyfin request **{title}** was declined.',
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
