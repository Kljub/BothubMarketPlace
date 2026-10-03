// Service "tasks" ("scheduler"): bothub.json "services.tasks".
//   airing_check (every 15m): AniList's nextAiringEpisode points at the next,
//   not yet aired episode. When that number goes up, the episode before it
//   has aired: that one is announced in the settings channel.
import { airing } from './anilist.js';
import { list, save } from './tracking.js';
import { fill, setting } from './util.js';

export const DEFAULT_TEXT = 'Episode **{episode}** of **{title}** is out!';

export const tasks = {
  async airing_check(ctx) {
    const items = await list(ctx);
    if (!items.length) return;
    const channel = setting(ctx, 'channel', null);
    const media = await airing(ctx, items.map((t) => t.id));
    const text = setting(ctx, 'announce_text', DEFAULT_TEXT);
    const role = setting(ctx, 'ping_role', null);
    const color = setting(ctx, 'color', '#02a9ff');
    let changed = false;
    for (const t of items) {
      const m = media.get(t.id);
      const next = m?.nextAiringEpisode?.episode ?? null;
      if (next == null) continue; // finished or no data
      if (t.next != null && next > t.next && channel?.id) {
        await ctx.message.send(channel.id, {
          content: role?.id ? `<@&${role.id}>` : undefined,
          embeds: [{ color, title: `📺 ${t.title}`, url: t.url || undefined, description: fill(text, { episode: next - 1, title: t.title }), thumbnail_url: t.cover || undefined }],
        });
      }
      if (t.next !== next) {
        t.next = next;
        changed = true;
      }
    }
    if (changed) await save(ctx, items);
  },
};
