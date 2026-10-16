// Node plugin.plugin_translation.translate: translates a text (/translate).
// Ports "replied" (command), "next", "failed" (results .error).
import { countToday, flagOf, languageOf, LANGUAGES, translate, TranslateError } from '../services/deepl.js';
import { t } from '../services/i18n.js';
import { setting } from '../services/util.js';

const opt = (v) => (typeof v === 'string' && !v.startsWith('{') ? v.trim() : '');

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function translateBlock(ctx, { config, interaction }) {
  const L = setting(ctx, 'language', 'en') === 'de' ? 'de' : 'en';
  const fail = async (key, params) => {
    const text = `❌ ${t(L, key, params)}`;
    if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
    return { port: 'failed', results: { '.error': text } };
  };
  const text = opt(config.text);
  if (!text) return fail('err.empty');
  const max = Math.max(50, Number(setting(ctx, 'char_limit', 1000)) || 1000);
  if (text.length > max) return fail('err.long', { max });
  const asked = opt(config.to);
  const target = asked ? languageOf(asked) : (languageOf(setting(ctx, 'default_target', 'EN-GB')) ?? 'EN-GB');
  if (!target || !LANGUAGES[target]) return fail('err.language', { lang: asked.slice(0, 30) });
  if (!(await countToday(ctx))) return fail('err.limit');
  if (interaction) await ctx.interaction.deferReply(interaction, { ephemeral: setting(ctx, 'private_replies', false) === true });
  let out;
  try {
    out = await translate(ctx, text, target);
  } catch (err) {
    if (!(err instanceof TranslateError)) throw err;
    const msg = `❌ ${t(L, err.key)}`;
    if (interaction) await ctx.interaction.editReply(interaction, msg);
    return { port: 'failed', results: { '.error': msg } };
  }
  const from = LANGUAGES[out.from] ?? out.from;
  const embed = {
    color: '#0f2b46',
    title: t(L, 'cmd.title', { flag: flagOf(target), to: LANGUAGES[target] }),
    fields: [
      { name: t(L, 'cmd.original', { from }), value: text.slice(0, 1024) },
      { name: t(L, 'cmd.translation'), value: out.text.slice(0, 1024) },
    ],
    footer: { text: 'DeepL' },
  };
  if (interaction) await ctx.interaction.editReply(interaction, { embeds: [embed] });
  return { port: interaction ? 'replied' : 'next', results: { '': out.text, '.from': out.from, '.to': target } };
}
