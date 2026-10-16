// Service "deepl": translations with the DeepL API v2. The key is the secret
// DEEPL_API_KEY; the bot adds it as the Authorization header, so the secret
// holds the whole header value "DeepL-Auth-Key <key>" (DeepL's format). The
// plugin never sees it. Free keys (ending ":fx") use api-free.deepl.com,
// paid ones api.deepl.com (setting "tier").
import { setting } from './util.js';

export const KEY = 'DEEPL_API_KEY';
const HOSTS = { free: 'https://api-free.deepl.com', paid: 'https://api.deepl.com' };

/** DeepL target languages: code -> English name. */
export const LANGUAGES = {
  AR: 'Arabic', BG: 'Bulgarian', CS: 'Czech', DA: 'Danish', DE: 'German', EL: 'Greek', 'EN-GB': 'English (British)', 'EN-US': 'English (American)',
  ES: 'Spanish', ET: 'Estonian', FI: 'Finnish', FR: 'French', HU: 'Hungarian', ID: 'Indonesian', IT: 'Italian', JA: 'Japanese', KO: 'Korean',
  LT: 'Lithuanian', LV: 'Latvian', NB: 'Norwegian (Bokmål)', NL: 'Dutch', PL: 'Polish', 'PT-BR': 'Portuguese (Brazilian)', 'PT-PT': 'Portuguese',
  RO: 'Romanian', RU: 'Russian', SK: 'Slovak', SL: 'Slovenian', SV: 'Swedish', TR: 'Turkish', UK: 'Ukrainian', ZH: 'Chinese (simplified)',
};

/** Flag emoji -> DeepL language (reacting with a flag translates into its language). */
export const FLAGS = {
  '🇸🇦': 'AR', '🇦🇪': 'AR', '🇪🇬': 'AR', '🇧🇬': 'BG', '🇨🇿': 'CS', '🇩🇰': 'DA', '🇩🇪': 'DE', '🇦🇹': 'DE', '🇨🇭': 'DE', '🇬🇷': 'EL',
  '🇬🇧': 'EN-GB', '🏴󠁧󠁢󠁥󠁮󠁧󠁿': 'EN-GB', '🇺🇸': 'EN-US', '🇦🇺': 'EN-GB', '🇨🇦': 'EN-US', '🇪🇸': 'ES', '🇲🇽': 'ES', '🇦🇷': 'ES', '🇪🇪': 'ET', '🇫🇮': 'FI',
  '🇫🇷': 'FR', '🇧🇪': 'FR', '🇭🇺': 'HU', '🇮🇩': 'ID', '🇮🇹': 'IT', '🇯🇵': 'JA', '🇰🇷': 'KO', '🇱🇹': 'LT', '🇱🇻': 'LV', '🇳🇴': 'NB',
  '🇳🇱': 'NL', '🇵🇱': 'PL', '🇧🇷': 'PT-BR', '🇵🇹': 'PT-PT', '🇷🇴': 'RO', '🇷🇺': 'RU', '🇸🇰': 'SK', '🇸🇮': 'SL', '🇸🇪': 'SV', '🇹🇷': 'TR',
  '🇺🇦': 'UK', '🇨🇳': 'ZH', '🇹🇼': 'ZH',
};

/** The flag shown for a language (first flag that maps to it). */
export const flagOf = (code) => Object.keys(FLAGS).find((f) => FLAGS[f] === code) ?? '🌐';

/** A language code from user input: "de", "German", "pt-br", "🇩🇪"; null when unknown. */
export function languageOf(input) {
  const s = String(input ?? '').trim();
  if (!s) return null;
  if (FLAGS[s]) return FLAGS[s];
  const up = s.toUpperCase().replace('_', '-');
  if (LANGUAGES[up]) return up;
  if (up === 'EN') return 'EN-GB';
  if (up === 'PT') return 'PT-PT';
  const byName = Object.entries(LANGUAGES).find(([, name]) => name.toLowerCase() === s.toLowerCase() || name.toLowerCase().startsWith(`${s.toLowerCase()} `));
  return byName ? byName[0] : null;
}

export class TranslateError extends Error {
  constructor(key) {
    super(key);
    this.key = key;
  }
}

/** Translates one text: { text, from } (from: the detected language, e.g. "EN"). */
export async function translate(ctx, text, target) {
  const host = HOSTS[setting(ctx, 'tier', 'free')] ?? HOSTS.free;
  let res;
  try {
    res = await ctx.http.secret({ url: `${host}/v2/translate`, method: 'POST', json: { text: [String(text)], target_lang: target }, auth: { secret: KEY, header: 'Authorization', format: 'plain' } });
  } catch (err) {
    throw new TranslateError((err?.key ?? err?.message) === 'sdk.secret.not_shared' ? 'err.key' : 'err.api');
  }
  if (res.status === 403 || res.status === 401) throw new TranslateError('err.key');
  if (res.status === 456) throw new TranslateError('err.quota');
  if (res.status === 429) throw new TranslateError('err.busy');
  const t = res.json?.translations?.[0];
  if (res.status !== 200 || typeof t?.text !== 'string') throw new TranslateError('err.api');
  return { text: t.text, from: String(t.detected_source_language ?? '').toUpperCase() };
}

/** Counts one translation for today; false when the daily limit (0: none) is reached. */
export async function countToday(ctx, now = new Date()) {
  const limit = Math.max(0, Number(setting(ctx, 'daily_limit', 0)) || 0);
  const key = `day:${now.toISOString().slice(0, 10)}`;
  const n = await ctx.storage.increment(key);
  if (limit && n > limit) {
    await ctx.storage.decrement(key);
    return false;
  }
  return true;
}
