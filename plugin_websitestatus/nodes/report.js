// Node plugin.plugin_websitestatus.report: a member reports a problem with a
// website or service of the settings (/sitereport). Enough reports in the
// window make it a warning (services/reports.js); the report that reaches
// the threshold starts a check round at once, so board and alerts follow.
// Ports: "replied" (command), "next", "duplicate" (reported already),
// "not_found", "off" (reports switched off).
import { findEntry, runRound, TEXT } from '../services/monitor.js';
import { addReport, reportRules } from '../services/reports.js';
import { fill, setting } from '../services/util.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function report(ctx, { config, vars, interaction }) {
  const lang = setting(ctx, 'language', 'en');
  const t = TEXT[lang] ?? TEXT.en;
  const say = async (text, port, results = {}) => {
    if (interaction) await ctx.interaction.reply(interaction, text, { ephemeral: true });
    return { port: interaction && port !== 'not_found' && port !== 'off' ? 'replied' : port, results: { '': text, ...results } };
  };
  const rules = reportRules(ctx);
  if (!rules.on) return say(`❌ ${t.reports_off}`, 'off');
  const entry = findEntry(ctx, config.site);
  if (!entry) return say(`❌ ${fill(t.unknown, { name: String(config.site ?? '').slice(0, 64) })}`, 'not_found');
  const user = vars['user.id'] || 'anonymous';
  const { added, count } = await addReport(ctx, entry._id, user);
  const results = { '.name': entry.name, '.count': String(count) };
  if (!added) return say(`ℹ️ ${fill(t.report_again, { name: entry.name, count })}`, 'duplicate', results);
  const text = `✅ ${fill(t.report_thanks, { name: entry.name, count, threshold: rules.threshold })}`;
  if (count !== rules.threshold) return say(text, 'next', results);
  // Threshold reached: check now (up to 5 s), so the board shows it.
  if (interaction) await ctx.interaction.deferReply(interaction, { ephemeral: true });
  await runRound(ctx, lang);
  if (interaction) await ctx.interaction.editReply(interaction, text);
  return { port: interaction ? 'replied' : 'next', results: { '': text, ...results } };
}
