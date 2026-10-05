// Node plugin.plugin_websitestatus.check_now: checks every website at once
// (no waiting for the interval), updates the status board and, from a
// command, answers with the results. Port "failed" when no website is set up.
import { line, runRound, sites, TEXT } from '../services/monitor.js';
import { setting } from '../services/util.js';

/** @type {import('@bothub/sdk').BlockHandler} */
export default async function checkNow(ctx, { interaction }) {
  const lang = setting(ctx, 'language', 'en');
  const t = TEXT[lang] ?? TEXT.en;
  if (!sites(ctx).length) {
    if (interaction) await ctx.interaction.reply(interaction, `❌ ${t.none}`, { ephemeral: true });
    return { port: 'failed', results: { '': t.none } };
  }
  // Checking takes up to 5 seconds: answer Discord first.
  if (interaction) await ctx.interaction.deferReply(interaction, { ephemeral: true });
  const results = await runRound(ctx, lang);
  const summary = results.map((r) => line(t, r, r.site.name)).join('\n').slice(0, 4000);
  const problems = results.filter((r) => r.status !== 'green').length;
  if (interaction) {
    await ctx.interaction.editReply(interaction, {
      embeds: [{ title: `📡 ${t.checked}`, description: summary, color: problems ? '#eab308' : '#22c55e', timestamp: true }],
    });
  }
  return { port: interaction ? 'replied' : 'next', results: { '': summary, '.online': String(results.length - problems), '.problems': String(problems) } };
}
