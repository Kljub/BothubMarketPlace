// Service "patreon": the Patreon API v2 with the creator's access token
// (secret PATREON_CREATOR_TOKEN, Patreon → Creators → Clients & API Keys).
// The plugin never sees the token: ctx.http.secret adds it as Bearer header.
// A patron's Discord account comes from Patreon itself: when the patron
// connected Discord in their Patreon settings, the member resource's user
// has social_connections.discord.user_id.
const API = 'https://www.patreon.com/api/oauth2/v2';
export const TOKEN = 'PATREON_CREATOR_TOKEN';
export const PAGE_SIZE = 200;

const MEMBER_FIELDS = 'patron_status,full_name,currently_entitled_amount_cents,lifetime_support_cents,pledge_relationship_start,last_charge_status,last_charge_date';
const QUERY = {
  include: 'currently_entitled_tiers,user',
  'fields[member]': MEMBER_FIELDS,
  'fields[user]': 'social_connections,full_name,vanity',
  'fields[tier]': 'title,amount_cents',
};

export class PatreonError extends Error {
  constructor(key) {
    super(key);
    this.key = key;
  }
}

async function call(ctx, url, query = {}) {
  let res;
  try {
    res = await ctx.http.secret({ url, query, auth: { secret: TOKEN } });
  } catch (err) {
    const key = err?.key ?? err?.message;
    throw new PatreonError(key === 'sdk.secret.not_shared' ? 'err.token' : 'err.api');
  }
  if (res.status === 401 || res.status === 403) throw new PatreonError('err.token');
  if (res.status !== 200 || !res.json || typeof res.json !== 'object') throw new PatreonError('err.api');
  return res.json;
}

/** The creator's campaign: { id, tiers: [{ id, title, cents }] }. */
export async function campaign(ctx) {
  const json = await call(ctx, `${API}/campaigns`, { include: 'tiers', 'fields[campaign]': 'vanity,patron_count', 'fields[tier]': 'title,amount_cents,published' });
  const c = Array.isArray(json.data) ? json.data[0] : null;
  if (!c?.id) throw new PatreonError('err.no_campaign');
  const tiers = (json.included ?? [])
    .filter((x) => x?.type === 'tier' && x.attributes?.title)
    .map((x) => ({ id: String(x.id), title: String(x.attributes.title).slice(0, 100), cents: Number(x.attributes.amount_cents) || 0 }));
  return { id: String(c.id), tiers };
}

/** One member resource with its included user and tiers as a plain patron. */
export function patron(member, included = []) {
  if (!member?.id || member.type !== 'member') return null;
  const byKey = new Map(included.map((x) => [`${x.type}:${x.id}`, x]));
  const userRef = member.relationships?.user?.data;
  const user = userRef ? byKey.get(`user:${userRef.id}`) : null;
  const discord = user?.attributes?.social_connections?.discord?.user_id;
  const tiers = (member.relationships?.currently_entitled_tiers?.data ?? [])
    .map((t) => byKey.get(`tier:${t.id}`))
    .filter(Boolean)
    .map((t) => ({ id: String(t.id), title: String(t.attributes?.title ?? '') }));
  const a = member.attributes ?? {};
  return {
    pid: String(member.id),
    discord: /^\d{17,20}$/.test(String(discord ?? '')) ? String(discord) : null,
    name: String(a.full_name ?? user?.attributes?.full_name ?? '').slice(0, 100),
    status: a.patron_status ?? null,
    cents: Number(a.currently_entitled_amount_cents) || 0,
    lifetime: Number(a.lifetime_support_cents) || 0,
    since: a.pledge_relationship_start ?? null,
    tiers,
  };
}

/** One page of the campaign's members; cursor null: the first page. */
export async function membersPage(ctx, campaignId, cursor = null) {
  const query = { ...QUERY, 'page[count]': String(PAGE_SIZE) };
  if (cursor) query['page[cursor]'] = cursor;
  const json = await call(ctx, `${API}/campaigns/${encodeURIComponent(campaignId)}/members`, query);
  const included = Array.isArray(json.included) ? json.included : [];
  const patrons = (Array.isArray(json.data) ? json.data : []).map((m) => patron(m, included)).filter(Boolean);
  const next = json.meta?.pagination?.cursors?.next ?? null;
  return { patrons, next: typeof next === 'string' && next ? next : null };
}

/** One member by its Patreon member ID (after a webhook). */
export async function member(ctx, pid) {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(String(pid))) throw new PatreonError('err.api');
  const json = await call(ctx, `${API}/members/${encodeURIComponent(pid)}`, QUERY);
  return patron(json.data, Array.isArray(json.included) ? json.included : []);
}
