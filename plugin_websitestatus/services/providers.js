// Service "providers": the downtime detector. Known services report their own
// state on public status pages; game servers are asked through public APIs.
// Every check answers { status: green | yellow | red, detail, latencyMs }.
//   statuspage   the common Statuspage JSON (indicator none / minor / major / critical)
//   aws          health.aws.amazon.com: current events (UTF-16 JSON), optional region
//   gcp          status.cloud.google.com: incidents without an end
//   azure        azure.status.microsoft: the RSS feed lists only open issues
//   slack, psn, xbox  their own status APIs
//   minecraft    api.mcsrvstat.us: online, players, version (target host[:port])
//   steam        Steam master server list (target ip:port, secret STEAM_API_KEY)
// The hosts are in bothub.json "services.hosts" ("http.outbound").

export const CATALOG = {
  aws: { name: 'AWS', kind: 'aws', url: 'https://health.aws.amazon.com/public/currentevents' },
  gcp: { name: 'Google Cloud', kind: 'gcp', url: 'https://status.cloud.google.com/incidents.json' },
  azure: { name: 'Microsoft Azure', kind: 'azure', url: 'https://azure.status.microsoft/en-us/status/feed/' },
  cloudflare: { name: 'Cloudflare', kind: 'statuspage', url: 'https://www.cloudflarestatus.com' },
  digitalocean: { name: 'DigitalOcean', kind: 'statuspage', url: 'https://status.digitalocean.com' },
  linode: { name: 'Linode (Akamai)', kind: 'statuspage', url: 'https://status.linode.com' },
  vercel: { name: 'Vercel', kind: 'statuspage', url: 'https://www.vercel-status.com' },
  discord: { name: 'Discord', kind: 'statuspage', url: 'https://discordstatus.com' },
  github: { name: 'GitHub', kind: 'statuspage', url: 'https://www.githubstatus.com' },
  npm: { name: 'npm', kind: 'statuspage', url: 'https://status.npmjs.org' },
  slack: { name: 'Slack', kind: 'slack', url: 'https://slack-status.com/api/v2.0.0/current' },
  reddit: { name: 'Reddit', kind: 'statuspage', url: 'https://www.redditstatus.com' },
  dropbox: { name: 'Dropbox', kind: 'statuspage', url: 'https://status.dropbox.com' },
  twitch: { name: 'Twitch', kind: 'statuspage', url: 'https://status.twitch.com' },
  openai: { name: 'OpenAI', kind: 'statuspage', url: 'https://status.openai.com' },
  claude: { name: 'Claude', kind: 'statuspage', url: 'https://status.claude.com' },
  epic: { name: 'Epic Games', kind: 'statuspage', url: 'https://status.epicgames.com' },
  psn: { name: 'PlayStation Network', kind: 'psn', url: 'https://status.playstation.com/data/statuses/region/' },
  xbox: { name: 'Xbox Live', kind: 'xbox', url: 'https://xnotify.xboxlive.com/servicestatusv6/US/en-US' },
  minecraft: { name: 'Minecraft server', kind: 'minecraft', url: 'https://api.mcsrvstat.us/3/', target: true },
  steam: { name: 'Steam game server', kind: 'steam', url: 'https://api.steampowered.com/IGameServersService/GetServerList/v1/', target: true },
};

/** Events older than this no longer count for AWS (some regions report one event for months). */
const AWS_RECENT_MS = 3 * 86_400_000;
const PSN_REGIONS = ['SCEA', 'SCEE', 'SCEJ', 'SCEK'];
const PSN_AMERICAS = ['US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'CR', 'EC', 'GT', 'HN', 'NI', 'PA', 'PY', 'SV', 'UY', 'BO'];

/** The PlayStation region file of a target: a region (SCEE …) or a country code (DE, US …). */
export function psnRegion(target) {
  const t = String(target ?? '').trim().toUpperCase();
  if (PSN_REGIONS.includes(t)) return t;
  if (t === 'JP') return 'SCEJ';
  if (t === 'KR') return 'SCEK';
  if (PSN_AMERICAS.includes(t)) return 'SCEA';
  return 'SCEE';
}

const short = (s, n = 90) => {
  const text = String(s ?? '').replace(/\s+/g, ' ').trim();
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
};
const decodeXml = (s) => String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** The JSON of an answer; tolerates UTF-16 (AWS), which arrives as UTF-8 text with zero bytes. */
export function jsonOf(res) {
  if (res.json && typeof res.json === 'object') return res.json;
  const text = String(res.text ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/^[^[{]+/, '');
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The display name of a configured service. */
export function serviceName(svc) {
  const c = CATALOG[svc.service];
  const own = String(svc.name ?? '').trim();
  if (own) return own;
  const target = String(svc.target ?? '').trim();
  return c ? (target ? `${c.name} (${target})` : c.name) : String(svc.service ?? '?');
}

// ── One reader per kind: (answer, target, now) -> { status, detail } ──────

/** Statuspage: summary.json with the open incidents. */
export function readStatuspage(j) {
  const indicator = String(j?.status?.indicator ?? '');
  const incident = (j?.incidents ?? []).find((i) => !['resolved', 'postmortem'].includes(i.status));
  const maintenance = (j?.scheduled_maintenances ?? []).find((m) => m.status === 'in_progress');
  const detail = short(incident?.name ?? maintenance?.name ?? (indicator === 'none' ? '' : j?.status?.description));
  if (indicator === 'none' || (!indicator && !incident)) return { status: 'green', detail: '' };
  // "major" often means a few locations (Cloudflare data centers): red only when the page says critical.
  if (indicator === 'critical') return { status: 'red', detail };
  return { status: 'yellow', detail };
}

/** AWS: recent events, optionally of one region (e.g. eu-central-1). Status 3 = disruption. */
export function readAws(list, target, now) {
  const region = String(target ?? '').trim().toLowerCase();
  const events = (Array.isArray(list) ? list : []).filter((e) => {
    const last = Math.max(Number(e.date) || 0, ...(e.event_log ?? []).map((l) => Number(l.timestamp) || 0)) * 1000;
    if (now - last > AWS_RECENT_MS) return false;
    return !region || String(e.arn ?? '').toLowerCase().includes(`:${region}:`) || String(e.service ?? '').toLowerCase().endsWith(`-${region}`);
  });
  if (!events.length) return { status: 'green', detail: '' };
  const worst = events.some((e) => String(e.status) === '3') ? 'red' : 'yellow';
  const e = events[0];
  return { status: worst, detail: short(`${e.service_name ?? ''} · ${e.region_name ?? ''}: ${e.summary ?? ''}`) };
}

/** Google Cloud: incidents without an end; "high" severity is red. */
export function readGcp(list, target) {
  const want = String(target ?? '').trim().toLowerCase();
  const open = (Array.isArray(list) ? list : []).filter((i) => !i.end && (!want || (i.affected_products ?? []).some((p) => String(p.title ?? '').toLowerCase().includes(want))));
  if (!open.length) return { status: 'green', detail: '' };
  return { status: open.some((i) => i.severity === 'high') ? 'red' : 'yellow', detail: short(open[0].external_desc) };
}

/** Azure: the feed has items only while there are issues. */
export function readAzure(xml) {
  const items = [...String(xml).matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/item>/g)].map((m) => decodeXml(m[1]));
  return items.length ? { status: 'yellow', detail: short(items[0]) } : { status: 'green', detail: '' };
}

export function readSlack(j) {
  const open = j?.active_incidents ?? [];
  if (j?.status === 'ok' && !open.length) return { status: 'green', detail: '' };
  const outage = open.some((i) => String(i.type).toLowerCase() === 'outage');
  return { status: outage ? 'red' : 'yellow', detail: short(open[0]?.title ?? j?.status) };
}

/** "tbone.playStationStore.outage" -> "PlayStation Store". */
const psnService = (key) => String(key ?? '').split('.')[1]?.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).replace('Play Station', 'PlayStation') ?? '';

/**
 * PlayStation: the statuses of one country (target DE, US …), or of the
 * whole region (SCEA, SCEE, SCEJ, SCEK or empty). Issues of single countries
 * count as a warning for the region, with the countries named.
 */
export function readPsn(j, target) {
  const code = String(target ?? '').trim().toUpperCase();
  const country = /^[A-Z]{2}$/.test(code) ? (j?.countries ?? []).find((c) => c.countryCode === code) : null;
  const list = country ? country.status ?? [] : Array.isArray(j?.status) ? j.status : [];
  if (!list.length) return { status: 'green', detail: '' };
  const s = list[0];
  const msgs = s.message?.messages ?? {};
  const english = msgs['en-US'] ?? msgs['en-GB'] ?? Object.entries(msgs).find(([k]) => k.startsWith('en'))?.[1];
  const where = country ? [] : (j?.countries ?? []).filter((c) => c.status?.length).map((c) => c.countryCode);
  const text = english ?? [psnService(s.message?.messageKey), s.statusType].filter(Boolean).join(': ');
  const regionWide = !country && where.length === 0;
  const outage = list.some((x) => x.statusType === 'Outage') && (country || regionWide);
  return { status: outage ? 'red' : 'yellow', detail: short(`${text}${where.length ? ` (${where.slice(0, 6).join(', ')})` : ''}`) };
}

/** Xbox: the overall state (None = all good). */
export function readXbox(xml) {
  const state = /<Overall>\s*<State>([^<]*)<\/State>/.exec(String(xml))?.[1] ?? '';
  if (!state || state === 'None') return { status: 'green', detail: '' };
  const affected = [...String(xml).matchAll(/<Category>\s*<Id>\d+<\/Id>\s*<Name>([^<]*)<\/Name>\s*<Status>\s*<Name>(?!None)([^<]*)<\/Name>/g)].map((m) => decodeXml(m[1]));
  return { status: /major/i.test(state) ? 'red' : 'yellow', detail: short(affected.join(', ') || state) };
}

/** Minecraft: online, players and version. */
export function readMinecraft(j) {
  if (!j?.online) return { status: 'red', detail: '' };
  const p = j.players ?? {};
  return { status: 'green', detail: short(`${Number(p.online ?? 0).toLocaleString('en-US')}/${Number(p.max ?? 0).toLocaleString('en-US')} players${j.version ? ` · ${j.version}` : ''}`) };
}

/** Steam: the server is in the master list while it runs. */
export function readSteam(j) {
  const s = j?.response?.servers?.[0];
  if (!s) return { status: 'red', detail: '' };
  return { status: 'green', detail: short(`${s.players ?? 0}/${s.max_players ?? 0} players${s.map ? ` · ${s.map}` : ''}${s.name ? ` · ${s.name}` : ''}`) };
}

/** Checks one configured service: { status, detail, latencyMs, code }. */
export async function checkService(ctx, svc, now = Date.now()) {
  const c = CATALOG[svc.service];
  if (!c) return { status: 'red', detail: 'unknown service', latencyMs: null, code: null };
  const target = String(svc.target ?? '').trim();
  const started = Date.now();
  try {
    let res;
    if (c.kind === 'statuspage') res = await ctx.http.get(`${c.url}/api/v2/summary.json`);
    else if (c.kind === 'psn') res = await ctx.http.get(`${c.url}${psnRegion(target)}.json`);
    else if (c.kind === 'minecraft') {
      if (!/^[a-z0-9.-]{1,253}(:\d{1,5})?$/i.test(target)) return { status: 'red', detail: 'no server address', latencyMs: null, code: null };
      res = await ctx.http.get(`${c.url}${encodeURIComponent(target)}`);
    } else if (c.kind === 'steam') {
      if (!/^[\d.]{7,15}:\d{1,5}$/.test(target)) return { status: 'red', detail: 'no ip:port', latencyMs: null, code: null };
      res = await ctx.http.secret({ url: c.url, query: { filter: `\\addr\\${target}`, limit: '1' }, auth: { secret: 'STEAM_API_KEY', format: 'query', param: 'key' } });
    } else res = await ctx.http.get(c.url);
    const latencyMs = Date.now() - started;
    if (c.kind === 'steam' && (res.status === 401 || res.status === 403)) return { status: 'yellow', detail: 'Steam refused STEAM_API_KEY', latencyMs, code: res.status };
    if (res.status >= 400) return { status: c.kind === 'minecraft' || c.kind === 'steam' ? 'yellow' : 'red', detail: `status page answered HTTP ${res.status}`, latencyMs, code: res.status };
    const body = c.kind === 'azure' || c.kind === 'xbox' ? res.text : jsonOf(res);
    if (body === null || body === undefined) return { status: 'yellow', detail: 'unreadable status page', latencyMs, code: res.status };
    const read = {
      statuspage: () => readStatuspage(body), aws: () => readAws(body, target, now), gcp: () => readGcp(body, target), azure: () => readAzure(body),
      slack: () => readSlack(body), psn: () => readPsn(body, target), xbox: () => readXbox(body), minecraft: () => readMinecraft(body), steam: () => readSteam(body),
    }[c.kind];
    return { ...read(), latencyMs, code: res.status };
  } catch (err) {
    const key = String(err?.message ?? err);
    const detail = key.includes('secret.not_shared') ? 'needs the secret STEAM_API_KEY' : key.includes('timeout') ? 'status page timed out' : 'status page unreachable';
    // A status page or API that does not answer says nothing sure about the service itself.
    return { status: 'yellow', detail, latencyMs: null, code: null };
  }
}
