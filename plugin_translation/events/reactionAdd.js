// Event reactionAdd: Quick-Translation. A flag reaction (🇩🇪, 🇫🇷 …) on a
// message translates it into the language of that flag; the extra trigger
// emojis of the settings translate into the target language. Only in the
// chosen channels (none: all) and for the chosen roles (none: everyone).
// The translation goes into the channel (or by DM, setting "quick_reply").
import { countToday, FLAGS, flagOf, languageOf, LANGUAGES, translate, TranslateError } from '../services/deepl.js';
import { t } from '../services/i18n.js';
import { setting } from '../services/util.js';

const ids = (list) => (Array.isArray(list) ? list.map((r) => r?.id).filter(Boolean) : []);

/** The language an emoji asks for; null when it is no trigger. */
export function targetOf(ctx, emoji) {
  if (setting(ctx, 'flags', true) !== false && FLAGS[emoji]) return FLAGS[emoji];
  const extra = setting(ctx, 'trigger_emojis', []);
  return Array.isArray(extra) && extra.includes(emoji) ? (languageOf(setting(ctx, 'target', 'EN-GB')) ?? 'EN-GB') : null;
}

export default async function reactionAdd(ctx, p) {
  const guild = String(p['server.id'] ?? '');
  const channel = String(p['channel.id'] ?? '');
  const user = String(p['user.id'] ?? '');
  const messageId = String(p['message.id'] ?? '');
  if (!guild || !channel || !messageId || !user || p['user.bot'] === true) return;
  const target = targetOf(ctx, String(p.emoji ?? ''));
  if (!target) return;
  const channels = ids(setting(ctx, 'quick_channels', []));
  if (channels.length && !channels.includes(channel)) return;
  const roles = ids(setting(ctx, 'quick_roles', []));
  if (roles.length) {
    const member = await ctx.member.get(guild, user).catch(() => null);
    if (!member?.roles?.some((r) => roles.includes(r))) return;
  }
  const msg = await ctx.message.get(channel, messageId).catch(() => null);
  const text = String(msg?.content ?? p['message.content'] ?? '').trim();
  if (!text || msg?.bot) return;
  // One translation per message and language.
  const done = `q:${messageId}:${target}`;
  if (await ctx.storage.has(done)) return;
  const L = setting(ctx, 'language', 'en') === 'de' ? 'de' : 'en';
  const max = Math.max(50, Number(setting(ctx, 'char_limit', 1000)) || 1000);
  if (!(await countToday(ctx))) return;
  let out;
  try {
    out = await translate(ctx, text.slice(0, max), target);
  } catch (err) {
    if (!(err instanceof TranslateError)) throw err;
    await ctx.logger.warn(`quick translation: ${err.key}`);
    return;
  }
  await ctx.storage.set(done, '1');
  const embed = {
    color: '#0f2b46',
    title: `${flagOf(target)} ${LANGUAGES[target]}`,
    description: out.text.slice(0, 4000),
    fields: [{ name: t(L, 'quick.original'), value: `[${(msg?.authorName ?? '…').slice(0, 60)}](${msg?.url ?? p['message.url'] ?? ''})`, inline: false }],
    footer: { text: t(L, 'quick.footer', { from: LANGUAGES[out.from] ?? out.from, user: String(p['user.name'] ?? '') }) },
  };
  if (setting(ctx, 'quick_reply', 'channel') === 'dm') await ctx.message.dm(user, { embeds: [embed] }).catch(() => undefined);
  else await ctx.message.send(channel, { embeds: [embed] }).catch(() => undefined);
}
