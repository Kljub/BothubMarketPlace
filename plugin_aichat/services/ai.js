// Service "ai": one chat answer from the AI provider of the settings. Keys
// are the bot owner's secrets (Settings → API / Secrets): AI_API_KEY, and
// AI_URL as the address of Ollama or an OpenAI-compatible server
// ("custom"). The plugin never sees them; the bot adds them to the request
// (ctx.http.secret). History per member: storage "h:<user>" (the last
// exchanges, dropped after the session timeout).
import { readJson, setting, writeJson } from './util.js';

export const PROVIDERS = {
  openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
  anthropic: { url: 'https://api.anthropic.com/v1/messages', model: 'claude-haiku-4-5-20251001' },
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-8b-instant' },
  nvidia: { url: 'https://integrate.api.nvidia.com/v1/chat/completions', model: 'meta/llama-3.1-70b-instruct' },
  ollama: { url: 'AI_URL', path: '/v1/chat/completions', model: 'llama3', noKey: true },
  custom: { url: 'AI_URL', path: '/chat/completions', model: '' },
};
const MAX_HISTORY_BYTES = 14_000;

/** The system prompt: base, behaviour (positive), taboos (negative), web results. */
export function systemPrompt(ctx, search = '') {
  const parts = [String(setting(ctx, 'system_prompt', '')).trim()];
  const pos = String(setting(ctx, 'positive_prompt', '')).trim();
  const neg = String(setting(ctx, 'negative_prompt', '')).trim();
  if (pos) parts.push(`Behave like this: ${pos}`);
  if (neg) parts.push(`Never do this: ${neg}`);
  if (search) parts.push(`Use these current web search results for your answer:\n\n${search}`);
  return parts.filter(Boolean).join('\n\n');
}

export async function history(ctx, user) {
  const h = await readJson(ctx, `h:${user}`, null);
  const timeout = Number(setting(ctx, 'session_minutes', 30)) * 60_000;
  if (!h || Date.now() - h.at > timeout) return [];
  return h.messages;
}

export async function remember(ctx, user, question, answer) {
  const keep = Math.max(0, Number(setting(ctx, 'history_length', 10))) * 2;
  if (!keep) return;
  let messages = [...(await history(ctx, user)), { role: 'user', content: question.slice(0, 4000) }, { role: 'assistant', content: answer.slice(0, 4000) }].slice(-keep);
  while (messages.length > 2 && JSON.stringify(messages).length > MAX_HISTORY_BYTES) messages = messages.slice(2);
  await writeJson(ctx, `h:${user}`, { at: Date.now(), messages });
}

export const forget = (ctx, user) => ctx.storage.delete(`h:${user}`);

/** Web search: Brave (BRAVE_API_KEY) when set up, else DuckDuckGo's instant answers. */
export async function webSearch(ctx, query) {
  const results = [];
  const brave = await ctx.http.secret({ url: 'https://api.search.brave.com/res/v1/web/search', query: { q: query, count: '4' }, headers: { Accept: 'application/json' }, auth: { secret: 'BRAVE_API_KEY', header: 'X-Subscription-Token', format: 'plain' } }).catch(() => null);
  for (const r of brave?.json?.web?.results ?? []) results.push({ title: r.title, snippet: r.description ?? '', url: r.url });
  if (!results.length) {
    const ddg = await ctx.http.secret({ url: 'https://api.duckduckgo.com/', query: { q: query, format: 'json', no_html: '1', skip_disambig: '1' } }).catch(() => null);
    const d = ddg?.json ?? {};
    if (d.AbstractText) results.push({ title: d.Heading || query, snippet: d.AbstractText, url: d.AbstractURL });
    for (const t of d.RelatedTopics ?? []) if (t.Text && results.length < 4) results.push({ title: t.Text.split(' - ')[0], snippet: t.Text, url: t.FirstURL ?? '' });
  }
  if (!results.length) return `[Web search for "${query}" found nothing]`;
  return `[Web search: "${query}"]\n${results.slice(0, 4).map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}${r.url ? `\n   ${r.url}` : ''}`).join('\n\n')}`;
}

/** Asks the provider; throws an Error with a readable text. */
export async function ask(ctx, user, question, { web = false } = {}) {
  const name = setting(ctx, 'provider', 'openai');
  const p = PROVIDERS[name] ?? PROVIDERS.openai;
  const model = String(setting(ctx, 'model', '')).trim() || p.model;
  if (!model) throw new Error('No model set (plugin page → Model).');
  const search = setting(ctx, 'web_search', false) && (web || setting(ctx, 'web_search_always', false)) ? await webSearch(ctx, question) : '';
  const system = systemPrompt(ctx, search);
  const messages = [...(await history(ctx, user)), { role: 'user', content: question }];
  const maxTokens = Number(setting(ctx, 'max_tokens', 1000));
  const temperature = Number(setting(ctx, 'temperature', 70)) / 100;
  const request = name === 'anthropic'
    ? { url: p.url, method: 'POST', timeoutMs: 60_000, headers: { 'anthropic-version': '2023-06-01' }, auth: { secret: 'AI_API_KEY', header: 'x-api-key', format: 'plain' },
        json: { model, messages, max_tokens: maxTokens, temperature, ...(system ? { system } : {}) } }
    : { url: p.url, ...(p.path ? { path: p.path } : {}), method: 'POST', timeoutMs: 60_000, ...(p.noKey ? {} : { auth: { secret: 'AI_API_KEY' } }),
        json: { model, messages: system ? [{ role: 'system', content: system }, ...messages] : messages, max_tokens: maxTokens, temperature } };
  let res;
  try {
    res = await ctx.http.secret(request);
  } catch (err) {
    const e = String(err?.message ?? err);
    if (e.includes('not_shared')) throw new Error('The AI key is not set up: Settings → API / Secrets → AI_API_KEY (and AI_URL for Ollama or custom).');
    if (e.includes('timeout')) throw new Error('The AI took too long to answer.');
    throw new Error(`The AI could not be reached (${e}).`);
  }
  if (res.status >= 400) throw new Error(`The AI answered with HTTP ${res.status}${res.json?.error?.message ? `: ${String(res.json.error.message).slice(0, 200)}` : ''}.`);
  const answer = name === 'anthropic' ? res.json?.content?.[0]?.text : res.json?.choices?.[0]?.message?.content;
  if (!answer) throw new Error('The AI sent an empty answer.');
  await remember(ctx, user, question, answer);
  return String(answer);
}

export const clip = (text) => (text.length > 1900 ? `${text.slice(0, 1900)}…` : text);
