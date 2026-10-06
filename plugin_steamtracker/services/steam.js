// Service "steam": games of the Steam store (no API key needed): search,
// details, prices, current players, reviews and the news of a game.

export const STORE = 'https://store.steampowered.com';
export const API = 'https://api.steampowered.com';

/** A readable problem for the member. */
export class SteamError extends Error {}

async function get(ctx, url, query) {
  let res;
  try {
    res = await ctx.http.secret({ url, query });
  } catch (err) {
    if (String(err?.message ?? err).includes('sdk.http.timeout')) throw new SteamError('Steam did not answer in time. Try again in a moment.');
    throw err;
  }
  if (res.status === 429) throw new SteamError('Steam: too many requests right now. Try again in a minute.');
  return res;
}

/** The app ID of a game: an ID, a store link or a name (store search); null when none. */
export async function findApp(ctx, input, cc = 'us') {
  const raw = String(input ?? '').trim();
  const link = /store\.steampowered\.com\/app\/(\d{1,10})/i.exec(raw) ?? /steamdb\.info\/app\/(\d{1,10})/i.exec(raw);
  if (link) return Number(link[1]);
  if (/^\d{1,10}$/.test(raw)) return Number(raw);
  if (raw.length < 2) return null;
  const res = await get(ctx, `${STORE}/api/storesearch/`, { term: raw.slice(0, 100), cc, l: 'english' });
  const id = res.json?.items?.[0]?.id;
  return Number.isInteger(Number(id)) && Number(id) > 0 ? Number(id) : null;
}

/** Store details of one game (null when the store has none). */
export async function details(ctx, appid, cc = 'us') {
  const res = await get(ctx, `${STORE}/api/appdetails`, { appids: String(appid), cc, l: 'english' });
  const d = res.json?.[appid]?.success ? res.json[appid].data : null;
  if (!d) return null;
  const p = d.price_overview;
  return {
    appid: Number(appid),
    name: String(d.name ?? appid),
    image: String(d.header_image ?? headerImage(appid)),
    free: d.is_free === true,
    price: p ? { initial: Number(p.initial) || 0, final: Number(p.final) || 0, discount: Number(p.discount_percent) || 0, currency: String(p.currency ?? ''), text: String(p.final_formatted ?? '') } : null,
    release: String(d.release_date?.date ?? ''),
    comingSoon: d.release_date?.coming_soon === true,
    developers: (d.developers ?? []).slice(0, 3).join(', '),
    genres: (d.genres ?? []).map((g) => g.description).slice(0, 4).join(', '),
    short: String(d.short_description ?? '').slice(0, 300),
  };
}

export const headerImage = (appid) => `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`;
export const storeUrl = (appid) => `https://store.steampowered.com/app/${appid}/`;

/** Prices of many games at once: { appid: { initial, final, discount, currency } }; free games are missing. */
export async function prices(ctx, appids, cc = 'us') {
  const out = {};
  for (let i = 0; i < appids.length; i += 100) {
    const res = await get(ctx, `${STORE}/api/appdetails`, { appids: appids.slice(i, i + 100).join(','), filters: 'price_overview', cc }).catch(() => null);
    for (const [id, v] of Object.entries(res?.json ?? {})) {
      const p = v?.success ? v.data?.price_overview : null;
      if (p) out[id] = { initial: Number(p.initial) || 0, final: Number(p.final) || 0, discount: Number(p.discount_percent) || 0, currency: String(p.currency ?? '') };
    }
  }
  return out;
}

/** Players right now (null when unknown). */
export async function players(ctx, appid) {
  const res = await get(ctx, `${API}/ISteamUserStats/GetNumberOfCurrentPlayers/v1/`, { appid: String(appid) }).catch(() => null);
  const n = res?.json?.response?.player_count;
  return Number.isFinite(Number(n)) && res.json.response.result === 1 ? Number(n) : null;
}

/** Review summary: "Very Positive (92 % of 12,345)" or null. */
export async function reviews(ctx, appid) {
  const res = await get(ctx, `${STORE}/appreviews/${appid}`, { json: '1', language: 'all', purchase_type: 'all', num_per_page: '0' }).catch(() => null);
  const q = res?.json?.query_summary;
  if (!q || !q.total_reviews) return null;
  const pct = Math.round((Number(q.total_positive) / Number(q.total_reviews)) * 100);
  return `${q.review_score_desc} (${pct} % of ${Number(q.total_reviews).toLocaleString('en-US')})`;
}

/** The latest news of a game (announcements and patch notes), newest first. */
export async function news(ctx, appid, count = 3) {
  const res = await get(ctx, `${API}/ISteamNews/GetNewsForApp/v2/`, { appid: String(appid), count: String(count), maxlength: '400', feeds: 'steam_community_announcements' }).catch(() => null);
  return (res?.json?.appnews?.newsitems ?? []).map((n) => ({ gid: String(n.gid), title: String(n.title ?? ''), url: String(n.url ?? ''), date: Number(n.date) || 0, text: String(n.contents ?? '').replace(/\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300) }));
}

export const money = (cents, currency) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
};
