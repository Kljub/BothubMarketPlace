// Service "tracker": the games of the settings are checked every 30 minutes
// ("tick"). A game going on sale (from the minimum discount), becoming free
// and new announcements or patch notes are posted in its channel. The first
// check of a game only remembers its state, so nothing old is posted.
//
// Storage: "app:<entry _id>" = { input, appid, name } (the found game),
// "s:<appid>" = { discount, final, news } (last state; news = newest gid).
import { details, findApp, headerImage, money, news, prices, storeUrl } from './steam.js';
import { readJson, writeJson } from './storage.js';
import { setting } from './util.js';

/** The games of the settings with their app ID (found once and remembered). */
export async function trackedGames(ctx, cc) {
  const out = [];
  for (const e of setting(ctx, 'games', [])) {
    const input = String(e?.game ?? '').trim();
    if (!input || !e._id) continue;
    const key = `app:${e._id}`;
    let app = await readJson(ctx, key, null);
    if (!app || app.input !== input) {
      const appid = await findApp(ctx, input, cc).catch(() => null);
      const d = appid ? await details(ctx, appid, cc).catch(() => null) : null;
      if (!d) continue;
      app = { input, appid: d.appid, name: d.name };
      await writeJson(ctx, key, app);
    }
    out.push({ ...app, channel: e.channel?.id ?? null });
  }
  return out;
}

/** What changed for one game: posts to make. */
export function changes(prev, now, opts) {
  const posts = [];
  if (!prev) return posts; // first check: only remember
  const p = now.price;
  if (p && opts.free && p.final === 0 && p.initial > 0 && prev.final > 0) posts.push({ kind: 'free' });
  else if (p && opts.sales && p.discount >= opts.minDiscount && (prev.discount ?? 0) < opts.minDiscount) posts.push({ kind: 'sale' });
  if (opts.news && prev.news) {
    const fresh = [];
    for (const n of now.news) {
      if (n.gid === prev.news) break;
      fresh.push(n);
    }
    for (const n of fresh.slice(0, 2).reverse()) posts.push({ kind: 'news', item: n });
  }
  return posts;
}

export function postFor(game, post, price) {
  const base = { url: storeUrl(game.appid), thumbnail_url: undefined, timestamp: true };
  if (post.kind === 'news') {
    return { ...base, color: '#66c0f4', title: `📰 ${game.name}: ${post.item.title}`.slice(0, 256), url: post.item.url || base.url, description: post.item.text || undefined, image_url: headerImage(game.appid) };
  }
  const was = price.initial ? money(price.initial, price.currency) : '';
  if (post.kind === 'free') {
    return { ...base, color: '#22c55e', title: `🎁 ${game.name} is free right now!`, description: `~~${was}~~ → **Free**\n${base.url}`, image_url: headerImage(game.appid) };
  }
  return { ...base, color: '#a3e635', title: `🏷️ ${game.name}: -${price.discount} %`, description: `~~${was}~~ → **${money(price.final, price.currency)}**\n${base.url}`, image_url: headerImage(game.appid) };
}

/** One check of all games. */
export async function checkAll(ctx) {
  const cc = String(setting(ctx, 'country', 'us'));
  const opts = {
    sales: setting(ctx, 'notify_sales', true) !== false,
    minDiscount: Number(setting(ctx, 'min_discount', 20)) || 20,
    free: setting(ctx, 'notify_free', true) !== false,
    news: setting(ctx, 'notify_news', true) !== false,
  };
  const fallback = setting(ctx, 'channel', null)?.id ?? null;
  const roles = setting(ctx, 'mention_roles', []).map((r) => r?.id).filter(Boolean).slice(0, 5);
  const games = await trackedGames(ctx, cc);
  const priceMap = await prices(ctx, games.map((g) => g.appid), cc);
  let posted = 0;
  for (const g of games) {
    const items = opts.news ? await news(ctx, g.appid) : [];
    const now = { price: priceMap[g.appid] ?? null, news: items };
    const key = `s:${g.appid}`;
    const prev = await readJson(ctx, key, null);
    const channel = g.channel ?? fallback;
    if (channel) {
      for (const post of changes(prev, now, opts)) {
        await ctx.message.send(channel, {
          content: roles.length ? roles.map((r) => `<@&${r}>`).join(' ') : undefined,
          embeds: [postFor(g, post, now.price ?? {})],
        }).then(() => posted++, () => undefined);
      }
    }
    await writeJson(ctx, key, { discount: now.price?.discount ?? 0, final: now.price?.final ?? (prev?.final ?? 0), news: items[0]?.gid ?? prev?.news ?? null });
  }
  return posted;
}
